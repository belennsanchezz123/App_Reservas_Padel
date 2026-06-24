-- ==========================================
-- RLS SECURITY FIX
-- Soluciona el aviso de Supabase "rls_disabled_in_public".
-- Activa Row-Level Security en todas las tablas del esquema public
-- y solo permite acceso a usuarios AUTENTICADOS (login email/contraseña).
-- El rol anónimo (anon) queda bloqueado: con la anonKey ya NO se pueden
-- leer ni modificar datos sin iniciar sesión.
--
-- Ejecutar en: Supabase > SQL Editor > New query > Run
-- ==========================================

-- 1) Activar RLS en todas las tablas
ALTER TABLE public.monitors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_pairs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches  ENABLE ROW LEVEL SECURITY;

-- 2) Políticas: acceso total SOLO para el rol 'authenticated'.
--    USING controla SELECT/UPDATE/DELETE; WITH CHECK controla INSERT/UPDATE.
--    DROP previo para que el script sea reejecutable sin errores.

DROP POLICY IF EXISTS "auth_all_monitors"           ON public.monitors;
CREATE POLICY "auth_all_monitors"           ON public.monitors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_students"           ON public.students;
CREATE POLICY "auth_all_students"           ON public.students
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_classes"            ON public.classes;
CREATE POLICY "auth_all_classes"            ON public.classes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_matches"            ON public.matches;
CREATE POLICY "auth_all_matches"            ON public.matches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_tournaments"        ON public.tournaments;
CREATE POLICY "auth_all_tournaments"        ON public.tournaments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_tournament_pairs"   ON public.tournament_pairs;
CREATE POLICY "auth_all_tournament_pairs"   ON public.tournament_pairs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_tournament_matches" ON public.tournament_matches;
CREATE POLICY "auth_all_tournament_matches" ON public.tournament_matches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
