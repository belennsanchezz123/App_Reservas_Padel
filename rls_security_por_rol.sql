-- ==========================================
-- RLS POR ROL  (PASO 2 — NO APLICAR TODAVÍA)
-- ==========================================
-- Este script REEMPLAZA las políticas "acceso total a autenticados" de
-- rls_security.sql por políticas que distinguen rol:
--   * coordinador (monitors.role = 'coordinador'): acceso total a todo.
--   * monitor     (monitors.role = 'monitor'):     solo SUS clases.
--
-- Aplícalo SOLO después de:
--   1) Haber ejecutado rls_security.sql (RLS ya activado).
--   2) Verificar que la app funciona con el modelo simple.
--   3) Confirmar que cada usuario tiene su fila en monitors con:
--        - auth_user_id = id del usuario en auth.users
--        - role IN ('monitor', 'coordinador')
--
-- PRERREQUISITO de datos: la app enlaza el usuario logueado con su fila
-- vía monitors.auth_user_id = auth.uid() (ver app.js handleLogin).
-- Si algún monitor no tiene auth_user_id, dejará de ver sus datos.
-- ==========================================


-- ------------------------------------------------------------------
-- 1) Funciones auxiliares (SECURITY DEFINER para poder leer monitors
--    sin que su propia RLS bloquee la comprobación).
-- ------------------------------------------------------------------

-- Devuelve el monitors.id del usuario autenticado actual.
CREATE OR REPLACE FUNCTION public.current_monitor_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.monitors WHERE auth_user_id = auth.uid() LIMIT 1;
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
    SELECT 1 FROM public.monitors
    WHERE auth_user_id = auth.uid() AND role = 'coordinador'
  );
$$;


-- ------------------------------------------------------------------
-- 2) Quitar las políticas simples del paso 1.
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "auth_all_monitors"           ON public.monitors;
DROP POLICY IF EXISTS "auth_all_students"           ON public.students;
DROP POLICY IF EXISTS "auth_all_classes"            ON public.classes;
DROP POLICY IF EXISTS "auth_all_matches"            ON public.matches;
DROP POLICY IF EXISTS "auth_all_tournaments"        ON public.tournaments;
DROP POLICY IF EXISTS "auth_all_tournament_pairs"   ON public.tournament_pairs;
DROP POLICY IF EXISTS "auth_all_tournament_matches" ON public.tournament_matches;


-- ------------------------------------------------------------------
-- 3) CLASSES: el coordinador ve/edita todo; el monitor solo las suyas
--    (classes.monitor_id = su monitors.id).
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "classes_select" ON public.classes;
CREATE POLICY "classes_select" ON public.classes
  FOR SELECT TO authenticated
  USING ( public.is_coordinator() OR monitor_id = public.current_monitor_id() );

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


-- ------------------------------------------------------------------
-- 4) MONITORS: cada uno puede leer/editar su propia fila;
--    el coordinador puede gestionar todas.
--    (Solo coordinador puede crear/borrar monitores.)
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "monitors_select" ON public.monitors;
CREATE POLICY "monitors_select" ON public.monitors
  FOR SELECT TO authenticated
  USING ( public.is_coordinator() OR auth_user_id = auth.uid() );

DROP POLICY IF EXISTS "monitors_update" ON public.monitors;
CREATE POLICY "monitors_update" ON public.monitors
  FOR UPDATE TO authenticated
  USING ( public.is_coordinator() OR auth_user_id = auth.uid() )
  WITH CHECK ( public.is_coordinator() OR auth_user_id = auth.uid() );

DROP POLICY IF EXISTS "monitors_insert" ON public.monitors;
CREATE POLICY "monitors_insert" ON public.monitors
  FOR INSERT TO authenticated
  WITH CHECK ( public.is_coordinator() );

DROP POLICY IF EXISTS "monitors_delete" ON public.monitors;
CREATE POLICY "monitors_delete" ON public.monitors
  FOR DELETE TO authenticated
  USING ( public.is_coordinator() );


-- ------------------------------------------------------------------
-- 5) STUDENTS / MATCHES / TOURNAMENTS:
--    Son datos compartidos del club (un alumno no "pertenece" a un
--    monitor en el esquema actual). Modelo recomendado:
--      - Lectura: cualquier autenticado.
--      - Escritura (insert/update/delete): solo coordinador.
--    Si quieres que los monitores también editen alumnos/partidos,
--    cambia los WITH CHECK / USING de escritura por TRUE.
-- ------------------------------------------------------------------

-- STUDENTS
DROP POLICY IF EXISTS "students_select" ON public.students;
CREATE POLICY "students_select" ON public.students
  FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS "students_write" ON public.students;
CREATE POLICY "students_write" ON public.students
  FOR ALL TO authenticated
  USING ( public.is_coordinator() )
  WITH CHECK ( public.is_coordinator() );

-- MATCHES
DROP POLICY IF EXISTS "matches_select" ON public.matches;
CREATE POLICY "matches_select" ON public.matches
  FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS "matches_write" ON public.matches;
CREATE POLICY "matches_write" ON public.matches
  FOR ALL TO authenticated
  USING ( public.is_coordinator() )
  WITH CHECK ( public.is_coordinator() );

-- TOURNAMENTS
DROP POLICY IF EXISTS "tournaments_select" ON public.tournaments;
CREATE POLICY "tournaments_select" ON public.tournaments
  FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS "tournaments_write" ON public.tournaments;
CREATE POLICY "tournaments_write" ON public.tournaments
  FOR ALL TO authenticated
  USING ( public.is_coordinator() )
  WITH CHECK ( public.is_coordinator() );

-- TOURNAMENT_PAIRS
DROP POLICY IF EXISTS "tournament_pairs_select" ON public.tournament_pairs;
CREATE POLICY "tournament_pairs_select" ON public.tournament_pairs
  FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS "tournament_pairs_write" ON public.tournament_pairs;
CREATE POLICY "tournament_pairs_write" ON public.tournament_pairs
  FOR ALL TO authenticated
  USING ( public.is_coordinator() )
  WITH CHECK ( public.is_coordinator() );

-- TOURNAMENT_MATCHES
DROP POLICY IF EXISTS "tournament_matches_select" ON public.tournament_matches;
CREATE POLICY "tournament_matches_select" ON public.tournament_matches
  FOR SELECT TO authenticated USING ( true );
DROP POLICY IF EXISTS "tournament_matches_write" ON public.tournament_matches;
CREATE POLICY "tournament_matches_write" ON public.tournament_matches
  FOR ALL TO authenticated
  USING ( public.is_coordinator() )
  WITH CHECK ( public.is_coordinator() );
