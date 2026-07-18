-- ==========================================
-- ROL "USUARIO" (ALUMNO) — Migración
-- Ejecuta este SQL en tu consola de Supabase (SQL Editor)
-- ==========================================
-- Añade el acceso de los alumnos a la app:
--   * students.auth_user_id  → enlaza cada alumno con su usuario de Supabase Auth
--                              (mismo patrón que monitors.auth_user_id).
--   * student_recoveries     → clases pendientes de recuperar (ausencias que
--                              marca el monitor).
--   * Funciones y políticas RLS para que un alumno solo vea SUS datos.
--
-- El rol del alumno NO se guarda en la base de datos como columna: en la app
-- se deduce en el login (si el usuario autenticado no está en `monitors`
-- pero sí en `students`, se le asignan permisos ['usuario']). Ver app.js.
-- ==========================================


-- ------------------------------------------------------------------
-- 1) Vincular alumnos a Supabase Auth
-- ------------------------------------------------------------------
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id);

-- Para dar acceso a un alumno:
--   1) Créale un usuario en Authentication → Users (email + contraseña).
--   2) Copia su UUID y enlázalo:
--        UPDATE students SET auth_user_id = '<uuid>' WHERE id = '<student_id>';


-- ------------------------------------------------------------------
-- 2) Tabla de recuperaciones (clases por recuperar)
--    Una fila con recovered_at IS NULL = una clase pendiente de recuperar.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_recoveries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         TEXT REFERENCES students(id) ON DELETE CASCADE,
  origin_class_id    TEXT REFERENCES classes(id) ON DELETE SET NULL,
  origin_date        DATE,
  recovered_at       TIMESTAMPTZ,          -- null = pendiente de recuperar
  recovered_class_id TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recoveries_student ON student_recoveries(student_id);

COMMENT ON TABLE student_recoveries IS 'Clases que un alumno tiene pendientes de recuperar (ausencias marcadas por el monitor)';


-- ------------------------------------------------------------------
-- 3) RLS por rol para el alumno
--    Requiere haber aplicado antes rls_security.sql / rls_security_por_rol.sql.
--    Si RLS sigue desactivado (fase de pruebas), estas políticas quedan
--    definidas pero no se aplican hasta activar RLS en cada tabla.
-- ------------------------------------------------------------------

-- Funciones auxiliares del personal. Son las mismas que define
-- rls_security_por_rol.sql; se repiten aquí para que este script sea
-- autocontenido y funcione aunque aquel no se haya ejecutado todavía.

-- Devuelve el monitors.id del usuario autenticado actual (o NULL si no es personal).
CREATE OR REPLACE FUNCTION public.current_monitor_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.personal WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- TRUE si el usuario autenticado es coordinador.
CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personal
    WHERE auth_user_id = auth.uid() AND role = 'coordinador'
  );
$$;

-- Devuelve el students.id del usuario autenticado actual (o NULL si no es alumno).
CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.students WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ---- student_payments: el alumno solo lee sus pagos ----
ALTER TABLE student_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_payments_own_select" ON public.student_payments;
CREATE POLICY "student_payments_own_select" ON public.student_payments
  FOR SELECT TO authenticated
  USING (
    public.is_coordinator()
    OR student_id = public.current_student_id()
    OR public.current_monitor_id() IS NOT NULL   -- monitor/recepción gestionan pagos
  );

DROP POLICY IF EXISTS "student_payments_staff_write" ON public.student_payments;
CREATE POLICY "student_payments_staff_write" ON public.student_payments
  FOR ALL TO authenticated
  USING ( public.current_monitor_id() IS NOT NULL )   -- solo personal (no alumnos)
  WITH CHECK ( public.current_monitor_id() IS NOT NULL );

-- ---- student_recoveries: el alumno solo lee las suyas; el personal escribe ----
ALTER TABLE student_recoveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recoveries_select" ON public.student_recoveries;
CREATE POLICY "recoveries_select" ON public.student_recoveries
  FOR SELECT TO authenticated
  USING (
    public.current_monitor_id() IS NOT NULL
    OR student_id = public.current_student_id()
  );

DROP POLICY IF EXISTS "recoveries_write" ON public.student_recoveries;
CREATE POLICY "recoveries_write" ON public.student_recoveries
  FOR ALL TO authenticated
  USING ( public.current_monitor_id() IS NOT NULL )
  WITH CHECK ( public.current_monitor_id() IS NOT NULL );

-- ---- classes: el alumno puede leer clases futuras no cerradas (para avisos) ----
-- Amplía la política de SELECT de classes definida en rls_security_por_rol.sql.
DROP POLICY IF EXISTS "classes_select" ON public.classes;
CREATE POLICY "classes_select" ON public.classes
  FOR SELECT TO authenticated
  USING (
    public.is_coordinator()
    OR monitor_id = public.current_monitor_id()
    OR (
      public.current_student_id() IS NOT NULL
      AND is_completed = false
      AND date >= now() - interval '1 day'
    )
  );

-- ---- students: el alumno puede leer su propia fila (y las de sus compañeros
--      de clase para calcular niveles). Lectura abierta a autenticados como ya
--      hace rls_security_por_rol.sql; la escritura sigue restringida al personal.
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT TO authenticated USING ( true );
