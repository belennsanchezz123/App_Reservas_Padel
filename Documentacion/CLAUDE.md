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

Los scripts se cargan en orden estricto en `index.html`, cada uno con `?v=N`
para romper la caché (subir N al editar el archivo — ver también la nota de
caché de iOS en `MANTENIMIENTO.md`):
1. Supabase CDN
2. `supabase-init.js`
3. `db.js`
4. `app.js`
5. `tournaments.js`

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
├── tournaments.js      # Motor + UI de torneos (se carga tras app.js)
├── styles.css          # Estilos (todos)
├── schema.sql          # Esquema base de las tablas
├── rls_security.sql    # RLS paso 1 (acceso total a autenticados)
├── rls_security_por_rol.sql # RLS paso 2 (políticas por rol)
├── student_role.sql    # Rol alumno: auth_user_id, student_recoveries, RLS
├── class_requests.sql  # Solicitudes de inscripción + notifications + Realtime
├── matches.sql / tournaments.sql / seed_students.sql
└── Documentacion/      # Toda la documentación .md
    ├── CLAUDE.md               # Este archivo
    ├── MANTENIMIENTO.md        # Deuda técnica y mejoras aplazadas
    ├── SEGURIDAD_ROLES_PENDIENTE.md
    ├── SETUP_SUPABASE.md / README_SUPABASE.md / PASOS_FINALES.md
    └── PROMPT_COORDINADOR_MOVIL.md
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
| active | boolean |
| auth_user_id | uuid (enlace a `auth.users`; da acceso de alumno) |

### student_payments (cobros a alumnos)
| Campo | Tipo |
|---|---|
| id | uuid |
| student_id | uuid → students |
| class_id | uuid → classes (null si es cuota mensual) |
| period | text ('YYYY-MM', para cuotas mensuales) |
| amount | numeric |
| paid_date | date (null = pendiente) |
| method | text (efectivo / bizum / transferencia) |
| notes | text |

### student_recoveries (clases por recuperar)
| Campo | Tipo |
|---|---|
| id | uuid |
| student_id | text → students |
| origin_class_id | text → classes |
| origin_date | date |
| recovered_at | timestamptz (null = pendiente de recuperar) |
| recovered_class_id | text |
| notes | text |
| created_at | timestamptz |

Migración SQL en `student_role.sql` (añade `students.auth_user_id`, crea `student_recoveries` y políticas RLS por rol para el alumno).

### class_requests (solicitudes de inscripción alumno → monitor)
| Campo | Tipo |
|---|---|
| id | uuid |
| class_id | text → classes |
| student_id | text → students |
| monitor_id | text → monitors (monitor responsable, denormalizado) |
| status | text (`pendiente` / `aceptada` / `rechazada`) |
| reason | text (motivo del rechazo, ej. `clase completa`; null si no aplica) |
| created_at | timestamptz (fecha de solicitud) |
| resolved_at | timestamptz (fecha de resolución; null si pendiente) |

El alumno solicita plaza en una clase de su nivel con hueco (desde la sección "🔔 Avisos"); se crea una fila `pendiente`. El **monitor responsable** la acepta/rechaza desde su apartado "Solicitudes". Índice único parcial `(class_id, student_id) WHERE status='pendiente'` evita duplicados. Al aceptar y **llenarse** la clase, el resto de solicitudes pendientes de esa clase se auto-rechazan con `reason='clase completa'`. Migración en `class_requests.sql`.

### notifications (bus genérico de notificaciones, reutilizable)
| Campo | Tipo |
|---|---|
| id | uuid |
| recipient_id | text (id de student o monitor) |
| recipient_role | text (`usuario` / `monitor`) |
| type | text (`nueva_solicitud` / `solicitud_aceptada` / `solicitud_rechazada`) |
| request_id | uuid → class_requests |
| class_id | text |
| message | text |
| is_read | boolean |
| created_at | timestamptz |

Bus de avisos reutilizable para futuros flujos. Es además el **canal de Supabase Realtime**: cada usuario se suscribe a sus notificaciones (`subscribeToNotifications` en `app.js`, filtro `recipient_id=eq.<yo>`) y reacciona en vivo (`handleIncomingNotification`). Ambas tablas se publican en `supabase_realtime` (ver `class_requests.sql`). Migración en `class_requests.sql`.

### classes
| Campo | Tipo |
|---|---|
| id | uuid |
| day | text |
| date | date |
| start_at | timestamp (fecha + hora de inicio) |
| end_at | timestamp (fecha + hora de fin) |
| students | uuid[] |
| max_capacity | int (por defecto 4) |
| status | text |
| is_completed | boolean |
| monitor_id | uuid |
| monitor_name | text |
| comments | text |
| paid | boolean (pago de la clase al monitor, lo marca el coordinador) |

En la app (`db.js.convertClassFromDB`) `start_at`/`end_at` se convierten a `startTime`/`endTime` (HH:MM) y `date` (YYYY-MM-DD).

### matches (partidos por nivel, estilo Playtomic)
| Campo | Tipo |
|---|---|
| id | uuid |
| match_date | date |
| start_time | time |
| match_type | text (`competitive` / `friendly`) |
| level_min | numeric(3,1) (filtro de acceso al partido) |
| level_max | numeric(3,1) (filtro de acceso al partido) |
| players | uuid[] (hasta 4; `[0,1]`=Pareja A, `[2,3]`=Pareja B) |
| court | int (nº de pista asignada, 1..N; null = sin asignar) |
| winner | text (`A` / `B` / null) |
| is_completed | boolean |
| comments | text |
| created_at | timestamptz |

El nivel individual de cada jugador vive en `students.level` (numeric 0–5), **no** en `matches`. Al registrar resultado (`registerMatchResult` en `app.js`), los 2 jugadores de la pareja ganadora suman **+0.1** a `students.level`. `level_min`/`level_max` son solo el rango de acceso recomendado del partido. Migración SQL en `matches.sql`. La sección vive en una pestaña ("Partidos / Niveles") dentro del panel de Recepción, con dos vistas: **Lista** (tarjetas) y **Calendario** por pistas (`renderMatchesCalendar` en `app.js`). El calendario muestra una columna por pista (nº configurable vía `getNumCourts`/`setNumCourts`, persistido en `localStorage`), regla horaria cada 30 min y bloques de 1,5 h (`CONFIG.matchDurationMin`) posicionados por minutos. Al montar un partido se elige la pista; el filtro de jugadores del modal solo muestra alumnos dentro del rango de nivel.

### tournaments / tournament_pairs / tournament_matches (torneos — Fase 1)
Gestión de torneos en una pestaña ("Torneos") del panel de Recepción. Motor + UI en `tournaments.js` (cargado tras `app.js`); CRUD en `db.js`. Migración en `tournaments.sql`.

- **tournaments**: `id` uuid, `name`, `format` (`elimination`/`round_robin`/`groups_elim`), `seeding` (`random`/`level`/`manual`), `status` (`setup`/`active`/`finished`), `num_pairs`, `num_groups`, `qualifiers_per_group`, `bracket_size`, `winner_pair_id`.
- **tournament_pairs**: pareja = 2 alumnos (`player1_id`/`player2_id` = `students.id` TEXT), `seed`, `group_index`. Nivel de pareja para siembra `level` = suma de los dos `students.level`.
- **tournament_matches**: `phase` (`group`/`bracket`), `group_index`, `round`, `slot`, `pair_a_id`, `pair_b_id`, `label_a`/`label_b` (huecos por clasificar), `winner_pair_id`, `score`.

Motor (`tournaments.js`): `computeGroupPlan(n, format)` calcula grupos/clasificados para llegar a un cuadro potencia de 2 (2 clasificados/grupo, grupos ≥3 parejas); `bracketSeedOrder` genera el orden de cruces; al registrar resultado el ganador avanza solo (`advanceBracketWinner`) y, al cerrarse todos los grupos, se rellena la 1ª ronda del cuadro (`tryResolveGroups`). **Pendiente Fase 2**: colocación manual con drag & drop (hoy "manual" = orden de inscripción).

## Roles de usuario

Los permisos viven en el array `monitors.permissions` (`coordinador` / `monitor` / `recepcion`). El rol `usuario` (alumno) **no** está en `monitors`: se deduce en el login (`resolveUserFromAuth` en `app.js`) cuando el usuario autenticado no tiene fila en `monitors` pero sí en `students` (por `students.auth_user_id`).

- **Coordinador**: ve todos los monitores y sus clases, puede exportar a Excel. Su panel tiene dos pestañas: "Monitores" y "Gestión de clase" (historial de pagos de alumnos y retrasos), ver `switchCoordTab`/`renderGestionClase`.
- **Monitor**: gestiona únicamente sus propias clases y alumnos. Desde el detalle de una clase puede "marcar ausencia" de un alumno (`markAbsence`), que genera una clase por recuperar. En su vista de calendario tiene el botón **"📩 Solicitudes"** (con contador de pendientes) que abre el apartado de solicitudes de inscripción de sus clases: acepta (`acceptRequest`) o rechaza (`rejectRequest`). Al aceptar, el alumno se añade a `classes.students`, el calendario se refresca y el alumno recibe notificación; si la clase se llena, el resto de solicitudes de esa clase se auto-rechazan ("clase completa").
- **Recepción**: gestión de pagos, caja, partidos, categorías y torneos.
- **Usuario (alumno)**: `permissions: ['usuario']`, `currentUser.studentId` = `students.id`. Panel propio (`showStudentView`/`renderStudentDashboard`) con:
  - Cuotas pagadas y pendientes (tabla `student_payments`).
  - Clases por recuperar (tabla `student_recoveries`, filas con `recovered_at` nulo).
  - Avisos de clases libres que "cuadran" con su nivel: clases futuras, no cerradas (`is_completed=false`), con 1–3 alumnos (sin llegar a `max_capacity`) y con el nivel del alumno dentro de ±0,5 del nivel medio de los inscritos (`findFreeClassesForStudent`). El estado "visto" se guarda en `localStorage`. Cada aviso tiene un botón **"Solicitar plaza"** (`requestClassEnrollment`) que crea una solicitud pendiente (tabla `class_requests`) y notifica al monitor.
  - **Mis solicitudes**: estado de las inscripciones pedidas (pendiente / aceptada / rechazada + motivo). Es la notificación visible del resultado; el alumno recibe además un aviso en vivo (Supabase Realtime) al aceptarse/rechazarse. Si le rechazan, puede solicitar otra clase de su nivel.
  - **Bloqueo por impago**: si hay una cuota mensual (`period`, sin `class_id`) sin pagar de un mes anterior, o del mes actual pasado el día 5, se muestra una pantalla de bloqueo en vez del panel (`findBlockingUnpaidQuota`).

## Funcionalidades principales

- Calendario semanal (desktop) y mensual (móvil) con vista de día
- Drag & drop de clases entre slots horarios (snap cada 15 min, de 08:00 a 23:00)
- Copiar semana completa hacia adelante
- Máximo 4 alumnos por clase
- Exportar datos a Excel (SheetJS/xlsx via CDN)
- Login con Supabase Auth (email/contraseña)
- Solicitudes de inscripción a clase (alumno → monitor) con aprobación, notificaciones en ambos sentidos y actualización en vivo vía Supabase Realtime (tablas `class_requests` + `notifications`)

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
- **Diálogos y avisos**: NO usar `confirm()`/`alert()`/`prompt()` nativos (el navegador los muestra como "localhost dice"). Usar los helpers propios de `app.js`, que devuelven una promesa y reutilizan el estilo de modales: `await showConfirm(msg, {title, confirmText, cancelText, danger})`, `await showAlert(msg, {title})`, `await showPrompt(msg, valorPorDefecto, {title})`. Para avisos transitorios (no bloqueantes), `showToast(msg, 'success'|'error'|'warning')`.

## Notas para el agente IA

- Este proyecto **no tiene build step**. Nunca sugerir `npm run build`, `vite build`, ni similares.
- Al modificar columnas de base de datos, actualizar siempre la conversión camelCase ↔ snake_case en `db.js`.
- El archivo `index.html` contiene toda la UI (login, calendario, modales). Es intencionalmente monolítico.
- Para probar cambios, basta con recargar el navegador en `http://localhost:8000` (servidor Python activo).
- Las credenciales de Supabase están en `config.js`. No hardcodear URL ni anonKey en otros archivos.
- Cualquier nueva tabla o campo en Supabase debe reflejarse en los modelos de datos de este CLAUDE.md.
- El rol del usuario autenticado determina qué datos y acciones están disponibles — tenerlo en cuenta al añadir funcionalidades.
