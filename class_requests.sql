-- ==========================================
-- TABLAS: class_requests (solicitudes de inscripción) + notifications
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase.
--
-- Flujo: un alumno solicita plaza en una clase de su nivel -> se crea una
-- fila en class_requests con status 'pendiente'. El monitor responsable la
-- acepta o rechaza. Cada cambio genera una notificación (bus reutilizable).
--
-- IMPORTANTE: students.id / classes.id / monitors.id son TEXT en este
-- proyecto (ej. "student-041"), NO uuid. Por eso las FKs son TEXT (mismo
-- criterio que classes y matches).

-- ------------------------------------------------------------------
-- 1) Solicitudes de inscripción
--    status: 'pendiente' -> 'aceptada' | 'rechazada'
--    reason: motivo del rechazo (ej. 'clase completa'), null si no aplica
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    TEXT REFERENCES classes(id) ON DELETE CASCADE,
  student_id  TEXT REFERENCES students(id) ON DELETE CASCADE,
  monitor_id  TEXT REFERENCES personal(id) ON DELETE CASCADE, -- monitor responsable (denormalizado)
  status      TEXT NOT NULL DEFAULT 'pendiente'
              CHECK (status IN ('pendiente', 'aceptada', 'rechazada')),
  reason      TEXT,                                            -- motivo del rechazo (ej. 'clase completa')
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),              -- fecha de solicitud
  resolved_at TIMESTAMPTZ                                      -- fecha de resolución (null si pendiente)
);

CREATE INDEX IF NOT EXISTS idx_class_requests_monitor ON class_requests(monitor_id, status);
CREATE INDEX IF NOT EXISTS idx_class_requests_student ON class_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_class_requests_class   ON class_requests(class_id);

-- Un alumno no puede tener dos solicitudes PENDIENTES a la vez para la misma
-- clase (sí puede volver a solicitar si una previa fue rechazada).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_request
  ON class_requests(class_id, student_id) WHERE status = 'pendiente';

COMMENT ON TABLE class_requests IS 'Solicitudes de inscripción de alumnos a clases (aprobadas por el monitor)';

-- ------------------------------------------------------------------
-- 2) Notificaciones (bus genérico, reutilizable para otros flujos)
--    recipient_id  -> id de un student o de un monitor
--    recipient_role-> 'usuario' | 'monitor'
--    type          -> nueva_solicitud | solicitud_aceptada | solicitud_rechazada
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id   TEXT NOT NULL,
  recipient_role TEXT NOT NULL,                                -- 'usuario' | 'monitor'
  type           TEXT NOT NULL
                 CHECK (type IN ('nueva_solicitud', 'solicitud_aceptada', 'solicitud_rechazada')),
  request_id     uuid REFERENCES class_requests(id) ON DELETE CASCADE,
  class_id       TEXT,
  message        TEXT,
  is_read        BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read);

COMMENT ON TABLE notifications IS 'Bus de notificaciones a alumnos/monitores (canal de Supabase Realtime)';

-- ------------------------------------------------------------------
-- 3) Row Level Security: deshabilitado (igual que el resto en "modo simple").
--    IMPORTANTE: solo para desarrollo/pruebas.
-- ------------------------------------------------------------------
ALTER TABLE class_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  DISABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------
-- 4) Supabase Realtime: publicar ambas tablas para recibir cambios en vivo.
--    REPLICA IDENTITY FULL asegura payloads completos en UPDATE/DELETE.
-- ------------------------------------------------------------------
ALTER TABLE class_requests REPLICA IDENTITY FULL;
ALTER TABLE notifications  REPLICA IDENTITY FULL;

-- Añadir a la publicación de realtime (ignora error si ya estaban añadidas).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE class_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
