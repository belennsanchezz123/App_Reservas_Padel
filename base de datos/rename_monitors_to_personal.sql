-- ============================================================================
-- rename_monitors_to_personal.sql
-- ----------------------------------------------------------------------------
-- Renombra la tabla `monitors` -> `personal` (contiene TODO el personal:
-- coordinador / monitor / recepción; el nombre "monitors" era histórico).
--
-- Se conservan a propósito:
--   - la columna classes.monitor_id / class_requests.monitor_id (el monitor
--     que imparte la clase sigue siendo un monitor);
--   - los nombres de función current_monitor_id() / is_coordinator() / current_staff_role();
--   - el valor de rol 'monitor' (sigue siendo un rol válido).
--
-- EJECUTAR ESTO A LA VEZ que se despliega el código nuevo (db.js/app.js ya usan
-- .from('personal')). Si se ejecuta con el código viejo cargado, la app falla
-- hasta recargar; y al revés. En local: ejecuta este SQL y recarga el navegador.
--
-- Es idempotente y seguro sobre una base ya existente.
-- ============================================================================

-- 1) Renombrar la tabla. Las FK (classes.monitor_id -> id), índices y las
--    políticas RLS ya creadas se mantienen apuntando a la tabla renombrada.
ALTER TABLE IF EXISTS public.monitors RENAME TO personal;

-- 2) Recrear las funciones auxiliares para que lean de public.personal.
--    (Si ya existían apuntando a public.monitors, quedarían rotas tras el paso 1.)
CREATE OR REPLACE FUNCTION public.current_monitor_id()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.personal WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.personal
    WHERE auth_user_id = auth.uid() AND role = 'coordinador'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.personal WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- 3) Comprobación rápida (debe devolver la lista del personal, ahora en 'personal').
-- SELECT id, name, role FROM public.personal ORDER BY role, name;
