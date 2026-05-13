# PadelPro Manager — CLAUDE.md

## Descripción general

Aplicación web estática de gestión de clases de pádel para monitores y coordinadores. Sin bundler ni framework, todo en HTML/CSS/JS vanilla con Supabase como backend.

## Arquitectura

```
Browser (HTML + CSS + JS vanilla)
        │
        ├── app.js          ← Lógica principal, estado global (window.appState), renderizado
        ├── db.js           ← Capa de acceso a datos (CRUD Supabase, camelCase ↔ snake_case)
        ├── config.js       ← Inicialización del cliente Supabase (URL + anonKey)
        └── supabase-init.js← Inicialización adicional de Supabase
                │
                ▼
        Supabase (PostgreSQL + Auth email/contraseña)
```

Los scripts se cargan en orden estricto en `index.html`:
1. Supabase CDN
2. `supabase-init.js`
3. `db.js`
4. `app.js`

## Comandos de desarrollo

```bash
# Servidor local de desarrollo
python -m http.server 8000
# Acceder en http://localhost:8000
```

No hay build step, npm install, ni proceso de compilación. Abrir directamente en el navegador vía el servidor Python.

## Estructura de archivos

```
App_Reservas_Padel/
├── index.html          # UI completa: login, calendario, modales
├── app.js              # Lógica principal y renderizado
├── db.js               # Capa de datos (CRUD sobre Supabase)
├── config.js           # Credenciales y cliente Supabase
├── supabase-init.js    # Script de inicialización adicional
└── CLAUDE.md           # Este archivo
```

## Modelos de datos

### monitors
| Campo | Tipo |
|---|---|
| id | uuid |
| name | text |
| email | text |
| phone | text |
| role | text (`monitor` / `coordinador`) |
| created_date | date |

### students
| Campo | Tipo |
|---|---|
| id | uuid |
| name | text |
| email | text |
| phone | text |
| level | int (0–5) |
| registered_date | date |

### classes
| Campo | Tipo |
|---|---|
| id | uuid |
| day | text |
| date | date |
| start_time | time |
| end_time | time |
| students | uuid[] |
| max_capacity | int (por defecto 4) |
| status | text |
| is_completed | boolean |
| monitor_id | uuid |
| monitor_name | text |
| comments | text |

## Roles de usuario

- **Coordinador**: ve todos los monitores y sus clases, puede exportar a Excel.
- **Monitor**: gestiona únicamente sus propias clases y alumnos.

## Funcionalidades principales

- Calendario semanal (desktop) y mensual (móvil) con vista de día
- Drag & drop de clases entre slots horarios (snap cada 15 min, de 08:00 a 23:00)
- Copiar semana completa hacia adelante
- Máximo 4 alumnos por clase
- Exportar datos a Excel (SheetJS/xlsx via CDN)
- Login con Supabase Auth (email/contraseña)

## Librerías CDN

| Librería | Uso |
|---|---|
| `supabase-js v2` | Cliente Supabase (Auth + DB) |
| `SheetJS (xlsx)` | Exportación a Excel |

No se usa ningún framework frontend (React, Vue, Angular, etc.) ni gestor de paquetes.

## Convenciones de código

- **Sin bundler**: no usar webpack, vite, parcel ni ningún build step.
- **Sin npm scripts de build**: el proyecto no tiene `package.json` de producción.
- **Estado global**: toda la aplicación comparte `window.appState`. No crear estados locales que dupliquen esta estructura.
- **Conversión de nombres**: `db.js` es el único punto donde se hace la conversión `camelCase` (app) ↔ `snake_case` (Supabase). Respetar este patrón al añadir nuevas columnas o campos.
- **Orden de carga de scripts**: respetar el orden en `index.html` o la app no arranca (dependencias globales síncronas).
- **Capacidad máxima de clase**: 4 alumnos. Esta restricción se aplica tanto en UI como en `db.js`.
- **Slots horarios**: el drag & drop opera en intervalos de 15 minutos entre 08:00 y 23:00.

## Notas para el agente IA

- Este proyecto **no tiene build step**. Nunca sugerir `npm run build`, `vite build`, ni similares.
- Al modificar columnas de base de datos, actualizar siempre la conversión camelCase ↔ snake_case en `db.js`.
- El archivo `index.html` contiene toda la UI (login, calendario, modales). Es intencionalmente monolítico.
- Para probar cambios, basta con recargar el navegador en `http://localhost:8000` (servidor Python activo).
- Las credenciales de Supabase están en `config.js`. No hardcodear URL ni anonKey en otros archivos.
- Cualquier nueva tabla o campo en Supabase debe reflejarse en los modelos de datos de este CLAUDE.md.
- El rol del usuario autenticado determina qué datos y acciones están disponibles — tenerlo en cuenta al añadir funcionalidades.
