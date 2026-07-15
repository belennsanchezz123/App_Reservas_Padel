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
                ├──────────────────────────────┐
                ▼                              ▼
        Supabase                    functions/ (Cloudflare Pages Functions)
        (PostgreSQL + Auth)         Pagos con Stripe. Único código de servidor
                ▲                   del proyecto: guarda la clave secreta de
                │                   Stripe y la service_role de Supabase, que
                └───────────────────  NUNCA pueden estar en el navegador.
                                            │
                                            ▼
                                     Stripe (Checkout + webhook)
```

**Las Functions son la excepción a "todo es cliente"**: existen porque un cobro no se
puede autorizar desde el navegador. Son ESM sobre `fetch` (sin SDK de Stripe ni bundler)
y se despliegan solas con el mismo `git push` a Cloudflare Pages.

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
# Servidor local de desarrollo (solo el frontend)
python -m http.server 8000
# Acceder en http://localhost:8000

# Si tocas los pagos (carpeta functions/), el servidor de Python NO las sirve:
npx wrangler pages dev .          # frontend + functions en http://localhost:8788
stripe listen --forward-to localhost:8788/api/stripe/webhook
```

Sigue sin haber build step ni compilación: `wrangler` solo hace falta para ejecutar
las Functions de pago en local (en producción las despliega Cloudflare Pages solo).

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
├── functions/          # Cloudflare Pages Functions (pagos con Stripe) — ver "Pagos"
│   ├── _shared/        # stripe.js, supabase.js, time.js, fulfillment.js
│   └── api/            # checkout/create.js, checkout/status.js, stripe/webhook.js
├── .dev.vars.example   # Plantilla de secretos (copiar a .dev.vars, que está en .gitignore)
├── schema.sql          # Esquema base de las tablas
├── rls_security.sql    # RLS paso 1 (acceso total a autenticados)
├── rls_security_por_rol.sql # RLS paso 2 (políticas por rol)
├── student_role.sql    # Rol alumno: auth_user_id, student_recoveries, RLS
├── class_requests.sql  # Solicitudes de inscripción + notifications + Realtime
├── stripe_payments.sql # Cobro al aceptar: classes.precio + estados de pago
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

### class_requests (solicitudes de inscripción alumno → monitor, con cobro)
| Campo | Tipo |
|---|---|
| id | uuid |
| class_id | text → classes |
| student_id | text → students |
| monitor_id | text → monitors (monitor responsable, denormalizado) |
| status | text (ver estados abajo) |
| reason | text (motivo del rechazo, ej. `clase completa`; null si no aplica) |
| created_at | timestamptz (fecha de solicitud) |
| resolved_at | timestamptz (fecha de resolución; null si pendiente) |
| price | numeric(6,2) (importe **congelado** al aceptar; si luego cambia `classes.precio`, no afecta) |
| stripe_session_id | text (único; da idempotencia al webhook) |
| checkout_url | text (link de pago que abre el alumno) |
| payment_expires_at | timestamptz (plazo dinámico de pago) |
| paid_at | timestamptz (null hasta que Stripe confirma el cobro) |

**Estados** (`pendiente` → aceptación del monitor → pago):

```
pendiente ──(monitor acepta: reserva atómica + sesión Stripe)──> aceptada_pendiente_pago
                                                         ├─ pago ok     ──> confirmada_pagada
                                                         └─ pago expira ──> cancelada_por_impago
monitor rechaza / plaza ya cubierta ─────────────────────────────────────> rechazada
alumno se da de baja (clase pagada, ≥24h) ───────────────────────────────> cancelada_por_alumno
```

**Aceptar ya NO inscribe al alumno.** Al aceptar se crea una sesión de Stripe Checkout y la
solicitud queda como `aceptada_pendiente_pago`: eso es un **"hold"** que RETIENE la plaza sin
tocar `classes.students`. El alumno solo entra en la clase cuando el pago se confirma.

**Aforo real** = `classes.students` + solicitudes en `aceptada_pendiente_pago` con
`payment_expires_at > now()` (`occupancyOf()` en `app.js`, `getOccupancy()` en las Functions).
Un hold caducado no retiene nada, así que **la plaza se libera sola** sin ningún job programado.

**Plazo de pago dinámico** = `min(2h, tiempo hasta la clase − 30 min de margen)`. Ese plazo ES
el `expires_at` de la sesión de Stripe: es Stripe quien caduca el pago, no un temporizador propio.
El tope estándar (`STANDARD_WINDOW_MS` en `functions/_shared/time.js`) se fijó en **2 h** para no
retener plazas demasiado tiempo sin pagar; las clases cercanas lo acortan solas hasta el mínimo de
Stripe (30 min). Subirlo/bajarlo es cambiar esa sola constante.

**Corte de 60 minutos**: no se puede solicitar una clase que empieza en menos de 1 hora. Sale de
sumar los 30 min de margen antes de la clase + los **30 min mínimos que Stripe exige** que viva una
sesión de Checkout (su `expires_at` debe estar entre 30 min y 24 h). Constante `MIN_LEAD_MINUTES`.

Índice único parcial `(class_id, student_id) WHERE status IN ('pendiente','aceptada_pendiente_pago')`
evita duplicados también mientras el pago está en curso. Al confirmarse un pago que **llena** la
clase, el resto de solicitudes pendientes se auto-rechazan con `reason='plaza ya cubierta'` (lo hace el
servidor, en `functions/_shared/fulfillment.js`). Migraciones en `class_requests.sql` + `stripe_payments.sql`.

**Reserva atómica (antisobrecupo).** La aceptación NO valida el aforo con un read-then-write (que
permitía sobrecupo si dos monitores aceptaban a la vez): lo hace la función Postgres
`reserve_class_spot(request_id, expires_at)` (`race_and_cancellation.sql`), que bloquea la fila de la
clase (`SELECT ... FOR UPDATE`), recuenta alumnos + holds vivos **ya con el lock**, y solo marca el
hold si queda hueco. Devuelve `ok` | `full` | `gone`. Es el **único uso de RPC de Postgres** del
proyecto; se invoca desde `create.js` con la `service_role`. El "segundo que pierde" recibe
`reason='plaza ya cubierta'` + notificación.

**Baja del alumno** (estado `cancelada_por_alumno`): el alumno puede darse de baja de una clase futura
solo con **≥24h** de antelación (endpoint `functions/api/enrollment/leave.js`; el alumno no tiene
permiso de escritura, va por servidor). Libera la plaza; si la clase estaba **pagada** (había una
solicitud `confirmada_pagada`), en vez de reembolsar se le crea una **clase por recuperar**
(`student_recoveries`) y su solicitud pasa a `cancelada_por_alumno`. Migración en `race_and_cancellation.sql`.

### notifications (bus genérico de notificaciones, reutilizable)
| Campo | Tipo |
|---|---|
| id | uuid |
| recipient_id | text (id de student o monitor) |
| recipient_role | text (`usuario` / `monitor`) |
| type | text (`nueva_solicitud` / `solicitud_aceptada` / `solicitud_rechazada` / `pago_pendiente` / `pago_confirmado` / `pago_expirado` / `plaza_libre`) |
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
| precio | numeric(6,2), default 10.00 (lo que paga el alumno por confirmar su plaza) |

En la app (`db.js.convertClassFromDB`) `start_at`/`end_at` se convierten a `startTime`/`endTime` (HH:MM) y `date` (YYYY-MM-DD).

**Fecha/día de la clase: la fuente fiable es `start_at`, NO la columna `date`.** `convertClassFromDB`
deriva `date` y `day` de la parte de fecha de `start_at` (que se guarda como hora de pared local, así
que su substring es el día local correcto). La columna `date` es `timestamptz` y, si una clase se
guardó a **medianoche** local, su representación en UTC cae en el **día anterior** (bug off-by-one:
p. ej. jueves 16 a las 00:00 CEST se almacena como `2026-07-15T22:00:00Z`), lo que hacía que el modal
de solicitudes mostrara un día menos que el calendario. El servidor de pagos (`functions/_shared/time.js`,
`classStartMs`) usa el mismo criterio para anclar el plazo de pago al día correcto.

`precio` es editable por clase en el formulario de clase (campo `#classPrecio`, por defecto
`DEFAULT_CLASS_PRICE = 10`). **La política de precios definitiva está PENDIENTE de decidir**
(¿fijo?, ¿por nivel?, ¿por tipo de clase?): de momento es un campo manual. No confundir con
`paid`, que es el pago de la clase **al monitor** y no tiene importe.

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

## Pagos con Stripe (cobro al aceptar una solicitud)

Único código de servidor del proyecto: `functions/` (Cloudflare Pages Functions). Está en
**modo test** (`sk_test_…`). Migraciones: `stripe_payments.sql` + `race_and_cancellation.sql`.

| Endpoint | Cuándo | Qué hace |
|---|---|---|
| `POST /api/checkout/create` | El monitor pulsa "Aceptar" | Corte de 60 min + precio, **reserva atómica** de la plaza (RPC `reserve_class_spot`, sin sobrecupo), crea la sesión de Stripe con el `expires_at` dinámico y notifica al alumno. Si la plaza ya no está → `plaza ya cubierta` |
| `POST /api/stripe/webhook` | Stripe nos avisa | **Fuente de verdad del cobro.** `checkout.session.completed` → confirma la plaza; `checkout.session.expired` → la libera |
| `GET /api/checkout/status` | El alumno vuelve de Stripe (`?pago=ok`) | Red de seguridad: pregunta el estado a Stripe por si el webhook aún no ha llegado |
| `POST /api/enrollment/leave` | El alumno pulsa "Darme de baja" | Baja con **≥24h** de antelación: saca al alumno de `classes.students`; si la clase estaba pagada → **clase por recuperar** + solicitud `cancelada_por_alumno`. Si estaba llena, avisa `plaza_libre` a los alumnos del nivel (`_shared/eligibility.js`) |

Claves del diseño:

- **El webhook, no la redirección**, confirma el pago: si el alumno paga y cierra la pestaña, su
  plaza se confirma igual. Su firma se verifica con HMAC-SHA256 sobre el cuerpo **crudo**
  (`constructEvent` en `_shared/stripe.js`).
- **Idempotencia**: `confirmPayment`/`cancelForNonPayment` (`_shared/fulfillment.js`) pueden ejecutarse
  varias veces sin duplicar al alumno. Da igual quién llegue primero, el webhook o `status`, ni que
  Stripe reintente el evento.
- **Zona horaria**: las Functions corren en UTC pero las clases se guardan en hora de pared española.
  `_shared/time.js` hace la conversión Madrid → UTC explícitamente; sin ella, en verano (CEST) todos
  los plazos saldrían desfasados 2 horas.
- **Secretos**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
  y `APP_BASE_URL` viven en variables de entorno (Cloudflare Pages → Settings → Environment variables;
  en local, `.dev.vars`, que está en `.gitignore`). **Jamás en el código ni en el repositorio.**

## Roles de usuario

Los permisos viven en el array `monitors.permissions` (`coordinador` / `monitor` / `recepcion`). El rol `usuario` (alumno) **no** está en `monitors`: se deduce en el login (`resolveUserFromAuth` en `app.js`) cuando el usuario autenticado no tiene fila en `monitors` pero sí en `students` (por `students.auth_user_id`).

- **Coordinador**: ve todos los monitores y sus clases, puede exportar a Excel. Su panel tiene dos pestañas: "Monitores" y "Gestión de clase" (historial de pagos de alumnos y retrasos), ver `switchCoordTab`/`renderGestionClase`.
- **Monitor**: gestiona únicamente sus propias clases y alumnos. Desde el detalle de una clase puede "marcar ausencia" de un alumno (`markAbsence`), que genera una clase por recuperar. En su vista de calendario tiene el botón **"📩 Solicitudes"** (con contador de pendientes) que abre el apartado de solicitudes de inscripción de sus clases: acepta (`acceptRequest`) o rechaza (`rejectRequest`). **Aceptar no inscribe al alumno: genera su link de pago** (Stripe Checkout) y retiene la plaza; el alumno aparece en el calendario cuando paga (aviso en vivo por Realtime). Bajo las solicitudes pendientes, el modal lista las que están "Esperando pago" con su cuenta atrás. El aforo que ve (`2+1/4`) ya incluye las plazas retenidas.
- **Recepción**: gestión de pagos, caja, partidos, categorías y torneos.
- **Usuario (alumno)**: `permissions: ['usuario']`, `currentUser.studentId` = `students.id`. Panel propio (`showStudentView`/`renderStudentDashboard`) con:
  - **Mis clases** (próximas): clases futuras donde el alumno está inscrito. Cada una, si faltan **≥24h**, tiene un botón **"Darme de baja"** (`leaveClass` → `POST /api/enrollment/leave`); con menos de 24h no se puede cancelar. Si la clase estaba pagada, la baja genera una clase por recuperar.
  - Cuotas pagadas y pendientes (tabla `student_payments`).
  - Clases por recuperar (tabla `student_recoveries`, filas con `recovered_at` nulo). Se generan cuando el monitor marca ausencia (`markAbsence`) o cuando el alumno se da de baja de una clase que ya había pagado.
  - Avisos de clases libres que "cuadran" con su nivel: clases no cerradas (`is_completed=false`), que empiecen **a más de 60 minutos vista** (`MIN_LEAD_MINUTES`, para que dé tiempo a cobrar), con 1–3 alumnos (aforo con holds, sin llegar a `max_capacity`) y con el nivel del alumno dentro de ±0,5 del nivel medio de los inscritos (`findFreeClassesForStudent`). El estado "visto" se guarda en `localStorage`. Cada aviso tiene un botón **"Solicitar plaza"** (`requestClassEnrollment`) que crea una solicitud pendiente (tabla `class_requests`) y notifica al monitor.
  - **Mis solicitudes**: estado de las inscripciones pedidas y **donde el alumno paga**. Si el monitor la aceptó, la fila muestra "Pendiente de pago" con el importe, la cuenta atrás del plazo y un botón **"Pagar ahora"** que abre Stripe Checkout. Al pagar pasa a "Confirmada"; si se le pasa el plazo, a "Sin pagar" (la plaza se liberó y puede volver a solicitar). Todos los cambios le llegan en vivo por Supabase Realtime (`pago_pendiente` / `pago_confirmado` / `pago_expirado`).
  - **Bloqueo por impago**: si hay una cuota mensual (`period`, sin `class_id`) sin pagar de un mes anterior, o del mes actual pasado el día 5, se muestra una pantalla de bloqueo en vez del panel (`findBlockingUnpaidQuota`).

## Funcionalidades principales

- Calendario semanal (desktop) y mensual (móvil) con vista de día
- Drag & drop de clases entre slots horarios (snap cada 15 min, de 08:00 a 23:00)
- Copiar semana completa hacia adelante
- Máximo 4 alumnos por clase
- Exportar datos a Excel (SheetJS/xlsx via CDN)
- Login con Supabase Auth (email/contraseña)
- Solicitudes de inscripción a clase (alumno → monitor) con aprobación, notificaciones en ambos sentidos y actualización en vivo vía Supabase Realtime (tablas `class_requests` + `notifications`)
- **Cobro de la plaza con Stripe Checkout** al aceptar el monitor la solicitud (modo test). La plaza queda retenida hasta que el alumno paga; si no paga en plazo, se libera sola. Ver "Pagos con Stripe"
- **Reserva atómica antisobrecupo**: la última plaza nunca se asigna dos veces aunque se acepten dos solicitudes a la vez (RPC `reserve_class_spot`); al que pierde le llega "plaza ya cubierta"
- **Baja del alumno** (≥24h) con conversión a clase por recuperar si estaba pagada, y **aviso de plaza libre** a los alumnos del nivel (reutiliza los "Avisos", sin lista de espera propia)

## Librerías CDN

| Librería | Uso |
|---|---|
| `supabase-js v2` | Cliente Supabase (Auth + DB) |
| `SheetJS (xlsx)` | Exportación a Excel |

No se usa ningún framework frontend (React, Vue, Angular, etc.) ni gestor de paquetes.

## Convenciones de código

- **Sin bundler**: no usar webpack, vite, parcel ni ningún build step. Las Functions de `functions/` también son ESM plano sobre `fetch` (sin SDK de Stripe ni de Supabase): mantenerlo así.
- **Sin npm scripts de build**: el proyecto no tiene `package.json` de producción.
- **Secretos**: nada de claves secretas en el navegador. La clave secreta de Stripe y la `service_role` de Supabase solo existen como variables de entorno de las Functions. En el cliente, únicamente la `anonKey`.
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
