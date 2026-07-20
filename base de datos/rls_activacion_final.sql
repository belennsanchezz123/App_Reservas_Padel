-- ============================================================================
-- rls_activacion_final.sql
-- ----------------------------------------------------------------------------
-- ACTIVACIÓN COMPLETA Y DEFINITIVA DE RLS EN TODAS LAS TABLAS.
--
-- Sustituye el estado "RLS desactivada para poder probar" (ver
-- SEGURIDAD_ROLES_PENDIENTE.md) por el modelo final:
--
--   personal      -> coordinador ve/gestiona todo; cada uno lee/edita su fila.
--   students      -> personal lee/escribe todo; alumno SOLO su propia fila.
--   classes       -> personal lee todas (la app ya filtra el calendario del
--                    monitor en cliente); escribe el coordinador o el monitor
--                    dueño. Alumno: solo clases futuras no cerradas (avisos).
--   class_requests-> alumno crea ('pendiente') y lee las suyas; el monitor lee
--                    las suyas y solo puede pasar 'pendiente' -> 'rechazada'.
--                    TODAS las transiciones de pago las hace el servidor
--                    (service_role, salta RLS): el alumno NO puede marcarse
--                    'confirmada_pagada' desde la consola. (Cierra el agujero
--                    descrito en SEGURIDAD_ROLES_PENDIENTE.md §7.)
--   notifications -> cada uno lee/marca-leídas SOLO las suyas. Inserta el
--                    personal (avisos a alumnos) y el alumno solo el tipo
--                    'nueva_solicitud' dirigido a un monitor.
--   matches/torneos-> lectura autenticados; escritura solo recepción.
--   student_recoveries / student_payments -> personal escribe; alumno lee las suyas.
--
-- VISTAS "roster" (sin security_invoker: se ejecutan con permisos del dueño y
-- exponen SOLO columnas no sensibles, para que la app siga funcionando con RLS):
--   students_roster  (id, name, level, active)          -> nivel medio en avisos.
--   personal_roster  (id, name, role, permissions)      -> nombres de monitor en
--                                                          el calendario/paneles.
--   class_holds      (id, class_id, status,             -> aforo con plazas
--                     payment_expires_at)                  retenidas (occupancyOf).
--
-- REQUISITOS antes de ejecutar (el script los comprueba y ABORTA si fallan):
--   * Todas las filas de `personal` tienen auth_user_id enlazado. (Fue lo que
--     rompió el intento anterior: un monitor sin enlazar deja de ver sus datos.)
--   * Haber ejecutado en su día: schema.sql, class_requests.sql,
--     stripe_payments.sql, race_and_cancellation.sql, matches.sql,
--     tournaments.sql, student_role.sql (student_recoveries).
--
-- El script es IDEMPOTENTE: se puede re-ejecutar entero sin error.
-- Va acompañado de cambios en db.js (getPersonal y getActiveHolds usan las
-- vistas) — desplegar la web actualizada a la vez que se ejecuta esto.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) COMPROBACIÓN PREVIA: nadie del personal sin enlazar a Supabase Auth.
--    Si esto lanza error, enlaza primero: UPDATE personal SET auth_user_id='<uuid>'
--    WHERE id='<id>'; (el uuid sale de Authentication -> Users).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_sin_enlazar text;
BEGIN
  SELECT string_agg(id || ' (' || name || ')', ', ')
    INTO v_sin_enlazar
    FROM public.personal
    WHERE auth_user_id IS NULL;
  IF v_sin_enlazar IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: hay personal sin auth_user_id: %. Enlázalos antes de activar RLS.', v_sin_enlazar;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 1) Funciones auxiliares (SECURITY DEFINER: leen personal/students sin que la
--    propia RLS bloquee la comprobación). Mismas firmas que en scripts previos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_monitor_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.personal WHERE auth_user_id = auth.uid() LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.personal WHERE auth_user_id = auth.uid() AND role = 'coordinador'); $$;

CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.personal WHERE auth_user_id = auth.uid() LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.students WHERE auth_user_id = auth.uid() LIMIT 1; $$;


-- ----------------------------------------------------------------------------
-- 2) Activar RLS en TODAS las tablas.
-- ----------------------------------------------------------------------------
ALTER TABLE public.personal            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_pairs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_recoveries  ENABLE ROW LEVEL SECURITY;

-- student_payments no tiene CREATE en el repo (se creó desde el dashboard):
-- activar solo si existe, para que el script no falle en un proyecto nuevo.
DO $$
BEGIN
  IF to_regclass('public.student_payments') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.student_payments ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 3) Limpiar TODAS las políticas antiguas/permisivas (se combinan con OR: una
--    sola política vieja de "acceso total" anularía todo lo de abajo).
-- ----------------------------------------------------------------------------
-- classes
DROP POLICY IF EXISTS "Acceso total a usuarios logueados"     ON public.classes;
DROP POLICY IF EXISTS "Autenticados pueden modificar clases"  ON public.classes;
DROP POLICY IF EXISTS "Autenticados pueden ver clases"        ON public.classes;
DROP POLICY IF EXISTS "auth_all_classes"                      ON public.classes;
DROP POLICY IF EXISTS "classes_write"                         ON public.classes;
-- personal
DROP POLICY IF EXISTS "Acceso total a usuarios logueados"       ON public.personal;
DROP POLICY IF EXISTS "Autenticados pueden modificar monitores" ON public.personal;
DROP POLICY IF EXISTS "Autenticados pueden ver monitores"       ON public.personal;
DROP POLICY IF EXISTS "auth_all_monitors"                       ON public.personal;
-- students
DROP POLICY IF EXISTS "Acceso total a usuarios logueados"         ON public.students;
DROP POLICY IF EXISTS "Autenticados pueden modificar estudiantes" ON public.students;
DROP POLICY IF EXISTS "Autenticados pueden ver estudiantes"       ON public.students;
DROP POLICY IF EXISTS "auth_all_students"                         ON public.students;
-- resto
DROP POLICY IF EXISTS "auth_all_matches"            ON public.matches;
DROP POLICY IF EXISTS "auth_all_tournaments"        ON public.tournaments;
DROP POLICY IF EXISTS "auth_all_tournament_pairs"   ON public.tournament_pairs;
DROP POLICY IF EXISTS "auth_all_tournament_matches" ON public.tournament_matches;


-- ----------------------------------------------------------------------------
-- 4) PERSONAL: coordinador gestiona todo; cada uno lee/edita su propia fila.
--    (Los nombres para pintar el calendario salen de la vista personal_roster.)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "monitors_select" ON public.personal;
CREATE POLICY "monitors_select" ON public.personal
  FOR SELECT TO authenticated
  USING ( public.is_coordinator() OR auth_user_id = auth.uid() );

DROP POLICY IF EXISTS "monitors_update" ON public.personal;
CREATE POLICY "monitors_update" ON public.personal
  FOR UPDATE TO authenticated
  USING ( public.is_coordinator() OR auth_user_id = auth.uid() )
  WITH CHECK ( public.is_coordinator() OR auth_user_id = auth.uid() );

DROP POLICY IF EXISTS "monitors_insert" ON public.personal;
CREATE POLICY "monitors_insert" ON public.personal
  FOR INSERT TO authenticated
  WITH CHECK ( public.is_coordinator() );

DROP POLICY IF EXISTS "monitors_delete" ON public.personal;
CREATE POLICY "monitors_delete" ON public.personal
  FOR DELETE TO authenticated
  USING ( public.is_coordinator() );


-- ----------------------------------------------------------------------------
-- 5) STUDENTS: personal lee todo; el alumno SOLO su fila (students_privacy.sql).
--    Escritura: cualquier personal (rls_recepcion_fix.sql).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT TO authenticated
  USING ( public.current_monitor_id() IS NOT NULL OR auth_user_id = auth.uid() );

DROP POLICY IF EXISTS "students_write" ON public.students;
CREATE POLICY "students_write" ON public.students
  FOR ALL TO authenticated
  USING ( public.current_monitor_id() IS NOT NULL )
  WITH CHECK ( public.current_monitor_id() IS NOT NULL );


-- ----------------------------------------------------------------------------
-- 6) CLASSES: lectura de todo el personal (el calendario del monitor ya se
--    filtra en la app; recepción también puede necesitar consultar clases).
--    Alumno: solo clases futuras no cerradas (para avisos y "mis clases").
--    Escritura: coordinador o el monitor dueño de la clase.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "classes_select" ON public.classes;
CREATE POLICY "classes_select" ON public.classes
  FOR SELECT TO authenticated
  USING (
    public.current_monitor_id() IS NOT NULL
    OR (
      public.current_student_id() IS NOT NULL
      AND is_completed = false
      AND date >= now() - interval '1 day'
    )
  );

DROP POLICY IF EXISTS "classes_insert" ON public.classes;
CREATE POLICY "classes_insert" ON public.classes
  FOR INSERT TO authenticated
  WITH CHECK ( public.is_coordinator() OR monitor_id = public.current_monitor_id() );

DROP POLICY IF EXISTS "classes_update" ON public.classes;
CREATE POLICY "classes_update" ON public.classes
  FOR UPDATE TO authenticated
  USING ( public.is_coordinator() OR monitor_id = public.current_monitor_id() )
  WITH CHECK ( public.is_coordinator() OR monitor_id = public.current_monitor_id() );

DROP POLICY IF EXISTS "classes_delete" ON public.classes;
CREATE POLICY "classes_delete" ON public.classes
  FOR DELETE TO authenticated
  USING ( public.is_coordinator() OR monitor_id = public.current_monitor_id() );


-- ----------------------------------------------------------------------------
-- 7) MATCHES / TORNEOS: lectura autenticados; escritura SOLO recepción
--    (rls_recepcion_fix.sql; registrar resultado sube students.level, y eso
--    lo permite students_write porque recepción es personal).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "matches_select" ON public.matches;
CREATE POLICY "matches_select" ON public.matches
  FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS "matches_write" ON public.matches;
CREATE POLICY "matches_write" ON public.matches
  FOR ALL TO authenticated
  USING ( public.current_staff_role() = 'recepcion' )
  WITH CHECK ( public.current_staff_role() = 'recepcion' );

DROP POLICY IF EXISTS "tournaments_select" ON public.tournaments;
CREATE POLICY "tournaments_select" ON public.tournaments
  FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS "tournaments_write" ON public.tournaments;
CREATE POLICY "tournaments_write" ON public.tournaments
  FOR ALL TO authenticated
  USING ( public.current_staff_role() = 'recepcion' )
  WITH CHECK ( public.current_staff_role() = 'recepcion' );

DROP POLICY IF EXISTS "tournament_pairs_select" ON public.tournament_pairs;
CREATE POLICY "tournament_pairs_select" ON public.tournament_pairs
  FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS "tournament_pairs_write" ON public.tournament_pairs;
CREATE POLICY "tournament_pairs_write" ON public.tournament_pairs
  FOR ALL TO authenticated
  USING ( public.current_staff_role() = 'recepcion' )
  WITH CHECK ( public.current_staff_role() = 'recepcion' );

DROP POLICY IF EXISTS "tournament_matches_select" ON public.tournament_matches;
CREATE POLICY "tournament_matches_select" ON public.tournament_matches
  FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS "tournament_matches_write" ON public.tournament_matches;
CREATE POLICY "tournament_matches_write" ON public.tournament_matches
  FOR ALL TO authenticated
  USING ( public.current_staff_role() = 'recepcion' )
  WITH CHECK ( public.current_staff_role() = 'recepcion' );


-- ----------------------------------------------------------------------------
-- 8) CLASS_REQUESTS: el corazón del cobro. Reparto de permisos:
--    * Alumno:  INSERT solo de SU solicitud y solo en 'pendiente';
--               SELECT solo de las suyas. NO puede hacer UPDATE (no puede
--               marcarse pagada ni tocar el estado: eso es del servidor).
--    * Monitor: SELECT de sus solicitudes; UPDATE únicamente la transición
--               'pendiente' -> 'rechazada' (el botón Rechazar del modal).
--               Aceptar va por /api/checkout/create (service_role).
--    * Transiciones de pago (aceptada_pendiente_pago, confirmada_pagada,
--      cancelada_por_impago, cancelada_por_alumno): SOLO service_role.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "requests_select" ON public.class_requests;
CREATE POLICY "requests_select" ON public.class_requests
  FOR SELECT TO authenticated
  USING (
    public.is_coordinator()
    OR monitor_id = public.current_monitor_id()
    OR student_id = public.current_student_id()
  );

DROP POLICY IF EXISTS "requests_student_insert" ON public.class_requests;
CREATE POLICY "requests_student_insert" ON public.class_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_student_id() IS NOT NULL
    AND student_id = public.current_student_id()
    AND status = 'pendiente'
  );

DROP POLICY IF EXISTS "requests_monitor_reject" ON public.class_requests;
CREATE POLICY "requests_monitor_reject" ON public.class_requests
  FOR UPDATE TO authenticated
  USING (
    status = 'pendiente'
    AND ( public.is_coordinator() OR monitor_id = public.current_monitor_id() )
  )
  WITH CHECK (
    status = 'rechazada'
    AND ( public.is_coordinator() OR monitor_id = public.current_monitor_id() )
  );
-- Sin política de DELETE: nadie borra solicitudes desde el cliente.


-- ----------------------------------------------------------------------------
-- 9) NOTIFICATIONS: cada uno SOLO las suyas (también aplica a Realtime: con
--    RLS activa, Supabase solo emite por el canal las filas que el suscriptor
--    puede leer, así que un alumno ya no puede escuchar el canal de otro).
--    INSERT: personal libre (avisos a alumnos); alumno solo 'nueva_solicitud'
--    hacia un monitor (el aviso que crea al solicitar plaza).
--    UPDATE: el destinatario (marcar como leída).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_id = public.current_student_id()
    OR recipient_id = public.current_monitor_id()
  );

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_monitor_id() IS NOT NULL
    OR (
      public.current_student_id() IS NOT NULL
      AND type = 'nueva_solicitud'
      AND recipient_role = 'monitor'
    )
  );

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    recipient_id = public.current_student_id()
    OR recipient_id = public.current_monitor_id()
  )
  WITH CHECK (
    recipient_id = public.current_student_id()
    OR recipient_id = public.current_monitor_id()
  );

-- Borrar: el destinatario puede eliminar SUS avisos (botón ✕ de la bandeja 🔔).
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO authenticated
  USING (
    recipient_id = public.current_student_id()
    OR recipient_id = public.current_monitor_id()
  );


-- ----------------------------------------------------------------------------
-- 10) STUDENT_RECOVERIES y STUDENT_PAYMENTS: personal escribe; alumno lee las suyas.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "recoveries_select" ON public.student_recoveries;
CREATE POLICY "recoveries_select" ON public.student_recoveries
  FOR SELECT TO authenticated
  USING ( public.current_monitor_id() IS NOT NULL OR student_id = public.current_student_id() );

DROP POLICY IF EXISTS "recoveries_write" ON public.student_recoveries;
CREATE POLICY "recoveries_write" ON public.student_recoveries
  FOR ALL TO authenticated
  USING ( public.current_monitor_id() IS NOT NULL )
  WITH CHECK ( public.current_monitor_id() IS NOT NULL );

DO $$
BEGIN
  IF to_regclass('public.student_payments') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "payments_access" ON public.student_payments';
    EXECUTE 'DROP POLICY IF EXISTS "student_payments_own_select" ON public.student_payments';
    EXECUTE $pol$CREATE POLICY "student_payments_own_select" ON public.student_payments
      FOR SELECT TO authenticated
      USING ( public.current_monitor_id() IS NOT NULL OR student_id = public.current_student_id() )$pol$;
    EXECUTE 'DROP POLICY IF EXISTS "student_payments_staff_write" ON public.student_payments';
    EXECUTE $pol$CREATE POLICY "student_payments_staff_write" ON public.student_payments
      FOR ALL TO authenticated
      USING ( public.current_monitor_id() IS NOT NULL )
      WITH CHECK ( public.current_monitor_id() IS NOT NULL )$pol$;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 11) VISTAS ROSTER (sin security_invoker: puentean RLS a propósito para
--     exponer SOLO columnas no sensibles a cualquier autenticado).
--     IMPORTANTE: se revoca el acceso de anon/public — solo autenticados.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.students_roster AS
  SELECT id, name, level, active FROM public.students;

CREATE OR REPLACE VIEW public.personal_roster AS
  SELECT id, name, role, permissions FROM public.personal;

-- Holds de pago vivos: lo mínimo para calcular el aforo (occupancyOf en app.js)
-- sin exponer alumno, precio ni el checkout_url de nadie.
CREATE OR REPLACE VIEW public.class_holds AS
  SELECT id, class_id, status, payment_expires_at
  FROM public.class_requests
  WHERE status = 'aceptada_pendiente_pago';

REVOKE ALL ON public.students_roster FROM anon, public;
REVOKE ALL ON public.personal_roster FROM anon, public;
REVOKE ALL ON public.class_holds     FROM anon, public;
GRANT SELECT ON public.students_roster TO authenticated;
GRANT SELECT ON public.personal_roster TO authenticated;
GRANT SELECT ON public.class_holds     TO authenticated;


-- ----------------------------------------------------------------------------
-- COMPROBACIONES tras ejecutar (SQL Editor):
--
--   1) Todas las tablas con RLS activa:
--      SELECT tablename, rowsecurity FROM pg_tables
--      WHERE schemaname='public' ORDER BY 1;
--
--   2) Solo las políticas nuevas (nada de "auth_all_*" ni "Acceso total"):
--      SELECT tablename, policyname, cmd FROM pg_policies
--      WHERE schemaname='public' ORDER BY 1, 2;
--
--   3) Como ALUMNO (consola del navegador, logueado):
--      supabaseClient.from('class_requests').update({status:'confirmada_pagada'}).eq('id','<su-solicitud>')
--        -> 0 filas afectadas (RLS lo bloquea)   ✔ el agujero del pago está cerrado
--      supabaseClient.from('students').select('*')        -> solo su fila
--      supabaseClient.from('notifications').select('*')   -> solo las suyas
--
--   4) Como MONITOR: su calendario, solicitudes y el botón Rechazar funcionan.
--      Aceptar (pago) funciona: va por el servidor con service_role.
--
--   5) SIN sesión (anon): cualquier select devuelve [] o error de permisos.
-- ----------------------------------------------------------------------------
