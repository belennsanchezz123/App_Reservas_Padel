-- ==========================================
-- TORNEOS (Fase 1)
-- ==========================================
-- Ejecutar en el SQL Editor de Supabase.
--
-- Tres tablas:
--   tournaments         -> configuración del torneo (formato, siembra, plan de grupos)
--   tournament_pairs    -> parejas inscritas (2 alumnos cada una). player*_id = students.id (TEXT)
--   tournament_matches  -> partidos, tanto de fase de grupos (phase='group')
--                          como del cuadro de eliminatoria (phase='bracket')
--
-- IDs de alumno son TEXT (ej. "student-041"), por eso player1_id/player2_id son text.
-- RLS deshabilitada para "modo simple", igual que el resto del proyecto.

create table if not exists public.tournaments (
    id                   uuid primary key default gen_random_uuid(),
    name                 text        not null,
    format               text        not null default 'elimination', -- elimination | round_robin | groups_elim
    seeding              text        not null default 'random',       -- random | level | manual
    status               text        not null default 'setup',        -- setup | active | finished
    num_pairs            int         not null default 0,
    num_groups           int         not null default 0,
    qualifiers_per_group int         not null default 0,
    bracket_size         int         not null default 0,
    winner_pair_id       uuid,
    created_at           timestamptz not null default now()
);

create table if not exists public.tournament_pairs (
    id            uuid primary key default gen_random_uuid(),
    tournament_id uuid not null references public.tournaments(id) on delete cascade,
    player1_id    text not null,
    player2_id    text not null,
    name          text,        -- etiqueta cacheada (ej. "García / López")
    seed          int,         -- posición de siembra (1 = cabeza de serie)
    group_index   int,         -- grupo asignado (null si no hay fase de grupos)
    created_at    timestamptz not null default now()
);

create table if not exists public.tournament_matches (
    id              uuid primary key default gen_random_uuid(),
    tournament_id   uuid not null references public.tournaments(id) on delete cascade,
    phase           text not null,             -- 'group' | 'bracket'
    group_index     int,                       -- grupo (solo phase='group')
    round           int not null default 0,    -- bracket: 0=primera ronda; group: jornada (0)
    slot            int not null default 0,     -- posición del cruce dentro de la ronda
    pair_a_id       uuid references public.tournament_pairs(id) on delete set null,
    pair_b_id       uuid references public.tournament_pairs(id) on delete set null,
    -- Etiquetas para huecos aún sin pareja (ej. "1º Grupo A"), solo en bracket
    label_a         text,
    label_b         text,
    winner_pair_id  uuid references public.tournament_pairs(id) on delete set null,
    score           text,
    created_at      timestamptz not null default now()
);

create index if not exists tournament_pairs_tid_idx   on public.tournament_pairs (tournament_id);
create index if not exists tournament_matches_tid_idx on public.tournament_matches (tournament_id);

alter table public.tournaments        disable row level security;
alter table public.tournament_pairs   disable row level security;
alter table public.tournament_matches disable row level security;
