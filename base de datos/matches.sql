-- ==========================================
-- TABLA: matches (partidos por nivel, estilo Playtomic)
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase.
--
-- Modelo de jugadores/equipos:
--   players  -> array ordenado de hasta 4 alumnos (text, mismo tipo que students.id).
--               players[1], players[2] = Pareja A
--               players[3], players[4] = Pareja B
--   winner   -> 'A' | 'B' (null mientras no haya resultado registrado)
--
-- IMPORTANTE: students.id es TEXT (ej. "student-041"), NO uuid. Por eso
-- players es text[]. Mismo criterio que classes (ids TEXT en este proyecto).
--
-- El nivel individual de cada jugador NO se guarda aquí: vive en
-- students.level (numeric, 0-5). Al registrar el resultado, ambos
-- jugadores de la pareja ganadora suman +0.1 a students.level.
-- El rango level_min/level_max es solo el filtro de acceso del partido.

create table if not exists public.matches (
    id            uuid primary key default gen_random_uuid(),
    match_date    date        not null,
    start_time    time        not null,
    match_type    text        not null default 'competitive', -- competitive | friendly
    level_min     numeric(3,1) not null default 0.5,
    level_max     numeric(3,1) not null default 5.0,
    players       text[]      not null default '{}',
    court         int,                                         -- nº de pista asignada (1..N), null = sin asignar
    winner        text,                                        -- 'A' | 'B' | null
    is_completed  boolean     not null default false,
    comments      text,
    created_at    timestamptz not null default now()
);

create index if not exists matches_match_date_idx on public.matches (match_date);

-- Si la tabla matches ya existía sin la columna 'court', ejecutar esto una vez:
alter table public.matches add column if not exists court int;

-- Deshabilitar Row Level Security (igual que monitors/students/classes en este
-- proyecto en "modo simple"). IMPORTANTE: solo para desarrollo/pruebas.
alter table public.matches disable row level security;
