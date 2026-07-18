-- ============================================================================
-- rls_cleanup_old_policies.sql
-- ----------------------------------------------------------------------------
-- Borra las políticas RLS ANTIGUAS y permisivas que quedaron de experimentos
-- previos (rls_security.sql "paso 1" + políticas creadas a mano en el dashboard).
--
-- POR QUÉ: las políticas de RLS se combinan con OR. Una política vieja que da
-- "acceso total a autenticados" ANULA las políticas por rol (Belen vería todas
-- las clases, no solo las suyas). Hay que dejar ÚNICAMENTE las políticas por rol.
--
-- Ejecutar DESPUÉS de rls_security_por_rol.sql + student_role.sql + rls_recepcion_fix.sql,
-- y volver a comprobar con:
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;
-- ============================================================================

-- ---- classes ----
DROP POLICY IF EXISTS "Acceso total a usuarios logueados"     ON public.classes;
DROP POLICY IF EXISTS "Autenticados pueden modificar clases"  ON public.classes;
DROP POLICY IF EXISTS "Autenticados pueden ver clases"        ON public.classes;
DROP POLICY IF EXISTS "auth_all_classes"                      ON public.classes;
DROP POLICY IF EXISTS "classes_write"                         ON public.classes;

-- ---- personal (antes monitors) ----
DROP POLICY IF EXISTS "Acceso total a usuarios logueados"       ON public.personal;
DROP POLICY IF EXISTS "Autenticados pueden modificar monitores" ON public.personal;
DROP POLICY IF EXISTS "Autenticados pueden ver monitores"       ON public.personal;
DROP POLICY IF EXISTS "auth_all_monitors"                       ON public.personal;

-- ---- students ----
DROP POLICY IF EXISTS "Acceso total a usuarios logueados"         ON public.students;
DROP POLICY IF EXISTS "Autenticados pueden modificar estudiantes" ON public.students;
DROP POLICY IF EXISTS "Autenticados pueden ver estudiantes"       ON public.students;
DROP POLICY IF EXISTS "auth_all_students"                         ON public.students;

-- ---- matches ----
DROP POLICY IF EXISTS "auth_all_matches" ON public.matches;

-- ---- tournaments / tournament_pairs / tournament_matches ----
DROP POLICY IF EXISTS "auth_all_tournaments"        ON public.tournaments;
DROP POLICY IF EXISTS "auth_all_tournament_pairs"   ON public.tournament_pairs;
DROP POLICY IF EXISTS "auth_all_tournament_matches" ON public.tournament_matches;

-- ---- student_payments ----
DROP POLICY IF EXISTS "payments_access" ON public.student_payments;
