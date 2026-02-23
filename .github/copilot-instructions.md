# Copilot instructions

## Project overview
- Static, bundler-free web app for padel class management. UI is in [index.html](index.html); behavior/state is in [app.js](app.js).
- Data access is centralized in [db.js](db.js), which talks to Supabase using the global `supabase` client created in [supabase-init.js](supabase-init.js).
- Supabase schema lives in [schema.sql](schema.sql); migration helper is [migrate.html](migrate.html).
- [app_backup.js](app_backup.js) is the original LocalStorage-only version; [app_supabase.js](app_supabase.js) is an incomplete Supabase port. The production script loaded by the HTML is [app.js](app.js).

## Data flow & boundaries
- `app.js` owns `appState` and UI rendering; it calls `db.*` CRUD methods, then updates `appState`, then re-renders and (optionally) persists to LocalStorage.
- `db.js` is the only place that should call `supabase.from(...)`. Keep camelCase in app code and map to snake_case in `db.js` (see `updateClass()` and `convert*FromDB()` patterns).
- When adding or renaming DB fields, update both [schema.sql](schema.sql) and the converters in [db.js](db.js).
- Supabase client is injected via script order in [index.html](index.html): CDN → [supabase-init.js](supabase-init.js) → [db.js](db.js) → [app.js](app.js). Don’t reorder unless you also change initialization.

## LocalStorage fallback
- `app.js` still uses LocalStorage keys: `padelApp_students`, `padelApp_classes`, `padelApp_monitors`, `padelApp_currentUser`.
- Supabase load happens via `loadAllData()` in [app.js](app.js); LocalStorage is a fallback and is still called after mutations.

## Developer workflows
- Run locally: `npm run start` (serves via `python -m http.server 8000`). See [package.json](package.json).
- Supabase setup steps are documented in [SETUP_SUPABASE.md](SETUP_SUPABASE.md). Migration tool is [migrate.html](migrate.html).

## Project conventions
- Single global state object `appState` and constants in `CONFIG` (hours, day names in Spanish, max capacity). Keep Spanish day names consistent with `CONFIG.days` in [app.js](app.js).
- UI updates are imperative DOM operations in `app.js` (e.g., `renderCalendar()` → `renderDayColumn()` → `createClassCard()`). Follow the existing rendering flow instead of introducing frameworks.
- For class time logic, use the existing helpers (`formatTime()`, `timeStringToMinutes()`, `hasClassTimeConflict()`) rather than re-implementing.

## Integration points
- Supabase credentials live in [supabase-init.js](supabase-init.js) for the app runtime; [config.js](config.js) is used by [migrate.html](migrate.html).
- Supabase JS is loaded via CDN in [index.html](index.html); do not import modules or require bundlers without updating the HTML.
