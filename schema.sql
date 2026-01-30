-- ==========================================
-- SUPABASE DATABASE SCHEMA
-- Ejecuta este SQL en tu consola de Supabase (SQL Editor)
-- ==========================================

-- Tabla de Monitores
CREATE TABLE IF NOT EXISTS monitors (
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
  monitor_id TEXT REFERENCES monitors(id) ON DELETE CASCADE,
  monitor_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE students 
ADD COLUMN level DECIMAL(2,1) 
CHECK (level >= 0 AND level <= 5);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(date);
CREATE INDEX IF NOT EXISTS idx_classes_monitor ON classes(monitor_id);
CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);
CREATE INDEX IF NOT EXISTS idx_monitors_name ON monitors(name);

-- Deshabilitar Row Level Security (RLS) para modo simple
-- IMPORTANTE: Solo para desarrollo/pruebas
ALTER TABLE monitors DISABLE ROW LEVEL SECURITY;
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE classes DISABLE ROW LEVEL SECURITY;

-- Comentarios en las tablas
COMMENT ON TABLE monitors IS 'Monitores de clases de pádel';
COMMENT ON TABLE students IS 'Estudiantes registrados';
COMMENT ON TABLE classes IS 'Clases programadas';
