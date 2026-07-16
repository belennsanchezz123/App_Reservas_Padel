-- ==========================================
-- SUPABASE DATABASE SCHEMA
-- Ejecuta este SQL en tu consola de Supabase (SQL Editor)
-- ==========================================

-- Tabla de Monitores
CREATE TABLE IF NOT EXISTS personal (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'monitor',
  created_date TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Estudiantes
CREATE TABLE IF NOT EXISTS students (
  id NUMBER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  level DECIMAL(2,1) CHECK (level >= 0 AND level <= 5),
  registered_date TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Clases
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  students JSONB DEFAULT '[]'::jsonb,
  max_capacity INTEGER DEFAULT 4,
  status TEXT DEFAULT 'active',
  is_completed BOOLEAN DEFAULT FALSE,
  monitor_id TEXT REFERENCES personal(id) ON DELETE CASCADE,
  monitor_name TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE students 
ADD COLUMN level DECIMAL(2,1) 
CHECK (level >= 0 AND level <= 5);

-- Comentarios opcionales en clases (si no existía la columna)
ALTER TABLE classes 
ADD COLUMN IF NOT EXISTS comments TEXT;

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(date);
CREATE INDEX IF NOT EXISTS idx_classes_monitor ON classes(monitor_id);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);
CREATE INDEX IF NOT EXISTS idx_personal_name ON personal(name);

-- Row Level Security (RLS)
-- La seguridad se configura en rls_security.sql (activa RLS + políticas
-- para usuarios autenticados). NO desactivar RLS aquí: dejarlo deshabilitado
-- expone toda la base de datos a cualquiera con la anonKey.
-- Ver rls_security.sql y rls_security_por_rol.sql.

-- Comentarios en las tablas
COMMENT ON TABLE personal IS 'Personal del club (coordinador / monitor / recepción)';
COMMENT ON TABLE students IS 'Estudiantes registrados';
COMMENT ON TABLE classes IS 'Clases programadas';
