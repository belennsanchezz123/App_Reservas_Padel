-- ============================================================================
-- rls_recepcion_fix.sql
-- ----------------------------------------------------------------------------
-- Corrige las políticas de escritura de rls_security_por_rol.sql, que se
-- escribieron antes de que existieran el rol RECEPCIÓN y las funciones de
-- partidos/torneos, y que por eso daban acceso SOLO al coordinador.
--
-- Reparto real según el modelo de roles de la app (CLAUDE.md):
--   - students                → lo edita CUALQUIER PERSONAL (el monitor gestiona
--                               sus alumnos; registrar resultado sube el nivel).
--   - matches / tournaments / tournament_pairs / tournament_matches
--                             → SOLO RECEPCIÓN (es su panel). Ni monitor ni
--                               coordinador, tampoco desde la consola del navegador.
--
-- IMPORTANTE: ejecutar DESPUÉS de rls_security_por_rol.sql y student_role.sql.
-- La lectura (SELECT) de estas tablas ya está abierta a autenticados y no se toca.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Función auxiliar: rol del personal autenticado (NULL si no es personal).
-- Usa la columna personal.role ('coordinador' / 'monitor' / 'recepcion').
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.personal WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
-- STUDENTS: escritura de cualquier personal (coordinador / monitor / recepción).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "students_write" ON public.students;
CREATE POLICY "students_write" ON public.students
  FOR ALL TO authenticated
  USING ( public.current_monitor_id() IS NOT NULL )
  WITH CHECK ( public.current_monitor_id() IS NOT NULL );

-- ----------------------------------------------------------------------------
-- MATCHES / TOURNAMENTS / TOURNAMENT_PAIRS / TOURNAMENT_MATCHES:
-- escritura SOLO del rol recepción.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "matches_write" ON public.matches;
CREATE POLICY "matches_write" ON public.matches
  FOR ALL TO authenticated
  USING ( public.current_staff_role() = 'recepcion' )
  WITH CHECK ( public.current_staff_role() = 'recepcion' );

DROP POLICY IF EXISTS "tournaments_write" ON public.tournaments;
CREATE POLICY "tournaments_write" ON public.tournaments
  FOR ALL TO authenticated
  USING ( public.current_staff_role() = 'recepcion' )
  WITH CHECK ( public.current_staff_role() = 'recepcion' );

DROP POLICY IF EXISTS "tournament_pairs_write" ON public.tournament_pairs;
CREATE POLICY "tournament_pairs_write" ON public.tournament_pairs
  FOR ALL TO authenticated
  USING ( public.current_staff_role() = 'recepcion' )
  WITH CHECK ( public.current_staff_role() = 'recepcion' );

DROP POLICY IF EXISTS "tournament_matches_write" ON public.tournament_matches;
CREATE POLICY "tournament_matches_write" ON public.tournament_matches
  FOR ALL TO authenticated
  USING ( public.current_staff_role() = 'recepcion' )
  WITH CHECK ( public.current_staff_role() = 'recepcion' );
