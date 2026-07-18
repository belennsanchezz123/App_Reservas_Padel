-- ==========================================
-- COBRO CON STRIPE AL ACEPTAR UNA SOLICITUD DE CLASE
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de class_requests.sql.
--
-- Cambio de flujo: al aceptar el monitor, el alumno YA NO entra en la clase.
-- Se crea una sesión de Stripe Checkout y la solicitud queda como
-- 'aceptada_pendiente_pago' (un "hold" sobre la plaza). Solo cuando el webhook
-- de Stripe confirma el pago, el alumno se añade a classes.students.
--
--   pendiente --(monitor acepta)--> aceptada_pendiente_pago
--                                     |-- pago ok      --> confirmada_pagada
--                                     |-- pago expira  --> cancelada_por_impago
--   monitor rechaza / clase completa --------------------> rechazada
--
-- AFORO: ocupación = classes.students + solicitudes en 'aceptada_pendiente_pago'
-- con payment_expires_at > now(). Así la plaza se libera sola al caducar el
-- plazo de pago, sin necesidad de ningún job programado.

-- ------------------------------------------------------------------
-- 1) Precio de la clase.
--    La política de precios (fijo / por nivel / por tipo) está PENDIENTE de
--    decidir; por ahora es un campo editable por clase con un valor por defecto.
-- ------------------------------------------------------------------
ALTER TABLE classes ADD COLUMN IF NOT EXISTS precio NUMERIC(6,2) NOT NULL DEFAULT 10.00;

COMMENT ON COLUMN classes.precio IS 'Importe en EUR que paga el alumno al aceptarse su solicitud';

-- ------------------------------------------------------------------
-- 2) Nuevos estados de solicitud.
--    Las solicitudes históricas en 'aceptada' (flujo antiguo, sin cobro) se
--    migran a 'confirmada_pagada': esos alumnos ya están dentro de la clase.
-- ------------------------------------------------------------------
ALTER TABLE class_requests DROP CONSTRAINT IF EXISTS class_requests_status_check;

UPDATE class_requests SET status = 'confirmada_pagada' WHERE status = 'aceptada';

ALTER TABLE class_requests ADD CONSTRAINT class_requests_status_check
  CHECK (status IN ('pendiente',
                    'aceptada_pendiente_pago',
                    'confirmada_pagada',
                    'cancelada_por_impago',
                    'rechazada'));

-- ------------------------------------------------------------------
-- 3) Datos del cobro.
--    price se congela al aceptar: si luego cambia classes.precio, el importe
--    ya acordado con el alumno no se ve afectado.
-- ------------------------------------------------------------------
ALTER TABLE class_requests
  ADD COLUMN IF NOT EXISTS price              NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS stripe_session_id  TEXT,
  ADD COLUMN IF NOT EXISTS checkout_url       TEXT,
  ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ;

COMMENT ON COLUMN class_requests.price IS 'Importe congelado al crear la sesión de pago';
COMMENT ON COLUMN class_requests.payment_expires_at IS 'Plazo dinámico: min(2h, inicio de clase - 30min)';

-- Idempotencia del webhook: una sesión de Stripe corresponde a una sola solicitud.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_stripe_session
  ON class_requests(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

-- ------------------------------------------------------------------
-- 4) El hold también debe impedir solicitudes duplicadas.
--    El índice anterior solo miraba 'pendiente': un alumno con el pago en curso
--    podría volver a solicitar la misma clase.
-- ------------------------------------------------------------------
DROP INDEX IF EXISTS uniq_pending_request;
CREATE UNIQUE INDEX uniq_pending_request ON class_requests(class_id, student_id)
  WHERE status IN ('pendiente', 'aceptada_pendiente_pago');

-- Cálculo de aforo con holds.
CREATE INDEX IF NOT EXISTS idx_requests_hold
  ON class_requests(class_id, status, payment_expires_at);

-- ------------------------------------------------------------------
-- 5) Nuevos tipos de notificación (link de pago, pago confirmado, pago expirado).
-- ------------------------------------------------------------------
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('nueva_solicitud',
                  'solicitud_aceptada',
                  'solicitud_rechazada',
                  'pago_pendiente',
                  'pago_confirmado',
                  'pago_expirado'));
