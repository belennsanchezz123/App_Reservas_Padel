-- ============================================================================
-- students_privacy.sql
-- ----------------------------------------------------------------------------
-- Cierra la fuga de privacidad: hasta ahora cualquier autenticado (incluido un
-- alumno) leía la tabla `students` entera, con email y teléfono de todos.
--
-- Nuevo modelo:
--   - Tabla `students`: el PERSONAL lee todo; el ALUMNO solo su PROPIA fila
--     (con su email/teléfono). No ve las filas de otros alumnos.
--   - Vista `students_roster` (id, name, level, active): expone SOLO datos no
--     sensibles de todos los alumnos, para que el panel del alumno pueda
--     calcular el nivel medio de las clases (avisos) sin ver email/teléfono.
--
-- El alumno NO edita (de momento): no se añade política de UPDATE para él;
-- `students_write` sigue siendo solo del personal (rls_recepcion_fix.sql).
--
-- Ejecutar DESPUÉS de rls_security_por_rol.sql + student_role.sql + rls_recepcion_fix.sql.
-- ============================================================================

-- 1) Lectura de la tabla base: personal (todo) o el alumno SOLO su fila.
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT TO authenticated
  USING (
    public.current_monitor_id() IS NOT NULL   -- personal: ve a todos los alumnos
    OR auth_user_id = auth.uid()              -- alumno: solo su propia fila (email/phone incl.)
  );

-- 2) Vista "roster": columnas NO sensibles de todos los alumnos.
--    Sin security_invoker: se ejecuta con permisos del dueño, así que expone estas
--    4 columnas de todos aunque quien consulte sea un alumno (que por RLS ya no
--    puede leer la tabla base de los demás). Necesario para el nivel medio de los avisos.
CREATE OR REPLACE VIEW public.students_roster AS
  SELECT id, name, level, active FROM public.students;

GRANT SELECT ON public.students_roster TO authenticated;

-- Comprobación:
--   Como alumno:   supabaseClient.from('students').select('*')        -> solo su fila
--                  supabaseClient.from('students_roster').select('*') -> todos, sin email/phone
