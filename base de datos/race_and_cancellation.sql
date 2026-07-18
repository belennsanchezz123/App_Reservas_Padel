-- ==========================================
-- FASE 2: antisobrecupo (reserva atómica) + baja del alumno + aviso de plaza libre
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de stripe_payments.sql.

-- ------------------------------------------------------------------
-- (a) Nuevo estado de solicitud: baja voluntaria del alumno.
--     Cuando un alumno se da de baja de una clase que ya había pagado, su
--     solicitud confirmada pasa a 'cancelada_por_alumno' y se le genera una
--     "clase por recuperar" (student_recoveries).
-- ------------------------------------------------------------------
ALTER TABLE class_requests DROP CONSTRAINT IF EXISTS class_requests_status_check;
ALTER TABLE class_requests ADD CONSTRAINT class_requests_status_check
  CHECK (status IN ('pendiente',
                    'aceptada_pendiente_pago',
                    'confirmada_pagada',
                    'cancelada_por_impago',
                    'rechazada',
                    'cancelada_por_alumno'));

-- ------------------------------------------------------------------
-- (b) Nuevo tipo de notificación: plaza libre.
--     Al liberarse una plaza de una clase que estaba llena, se avisa a los
--     alumnos del nivel para que la clase reaparezca en sus "Avisos".
-- ------------------------------------------------------------------
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('nueva_solicitud',
                  'solicitud_aceptada',
                  'solicitud_rechazada',
                  'pago_pendiente',
                  'pago_confirmado',
                  'pago_expirado',
                  'plaza_libre'));

-- ------------------------------------------------------------------
-- (c) RESERVA ATÓMICA de plaza: cierra la condición de carrera.
--
-- Hasta ahora el aforo se validaba con un read-then-write NO atómico en la
-- Cloudflare Function (leía la ocupación y, después, escribía el hold): dos
-- aceptaciones simultáneas podían leer "3/4" a la vez y crear ambas su hold,
-- dejando 5 ocupantes sobre 4.
--
-- Esta función bloquea la fila de la clase (SELECT ... FOR UPDATE): dos
-- llamadas concurrentes se SERIALIZAN en ese lock, así que la segunda ya ve el
-- hold de la primera al recalcular la ocupación. Solo si queda hueco marca la
-- solicitud como hold (aceptada_pendiente_pago). Todo en una sola transacción.
--
-- Devuelve: 'ok'   -> plaza retenida (la Function sigue creando la sesión Stripe)
--           'full' -> no hay hueco  (la Function rechaza: "plaza ya cubierta")
--           'gone' -> la solicitud ya no está 'pendiente' (resuelta por otra vía)
--
-- SECURITY DEFINER para que se ejecute con permisos del owner (ignora RLS); se
-- invoca solo desde el servidor con la service_role.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_class_spot(
  p_request_id uuid,
  p_expires_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id text;
  v_cap      int;
  v_occ      int;
BEGIN
  -- La solicitud debe existir y seguir pendiente.
  SELECT class_id INTO v_class_id
    FROM class_requests
    WHERE id = p_request_id AND status = 'pendiente';
  IF v_class_id IS NULL THEN
    RETURN 'gone';
  END IF;

  -- Lock de la clase: aquí es donde se serializan las aceptaciones concurrentes.
  SELECT COALESCE(max_capacity, 4), COALESCE(jsonb_array_length(students), 0)
    INTO v_cap, v_occ
    FROM classes
    WHERE id = v_class_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'gone';  -- la clase ya no existe
  END IF;

  -- Sumar los holds vivos (otras solicitudes con el pago en curso, sin caducar).
  v_occ := v_occ + (
    SELECT count(*)
      FROM class_requests
      WHERE class_id = v_class_id
        AND status = 'aceptada_pendiente_pago'
        AND payment_expires_at > now()
        AND id <> p_request_id
  );

  IF v_occ >= v_cap THEN
    RETURN 'full';
  END IF;

  -- Hay hueco: retener la plaza de forma atómica.
  UPDATE class_requests
    SET status = 'aceptada_pendiente_pago',
        payment_expires_at = p_expires_at
    WHERE id = p_request_id;

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_class_spot(uuid, timestamptz) TO service_role;
