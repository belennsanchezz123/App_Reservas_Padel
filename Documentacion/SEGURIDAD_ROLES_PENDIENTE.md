# Seguridad y roles — Cambios pendientes

> **Estado actual (julio 2026):** el proyecto está en fase de pruebas. En algún momento se
> aplicaron las políticas RLS **por rol** (paso 2), pero eso rompía el uso normal: los alumnos
> no veían clases de otros monitores y los monitores **no enlazados a Auth** no podían escribir
> (ver "⚠️ Síntoma" abajo). Por eso, para seguir probando, **se ha vuelto a desactivar RLS**
> en las tablas implicadas: `classes`, `students`, `class_requests`, `notifications` (y, según
> se necesite, el resto). Este documento recoge **todo lo que hay que hacer** para activar la
> seguridad real más adelante.
>
> **⚠️ Síntoma clave detectado:** si una cuenta actúa como un monitor cuya fila en `monitors`
> **no tiene `auth_user_id`** enlazado al usuario de Auth con el que se ha hecho login, entonces
> `current_monitor_id()` devuelve NULL y **RLS le deniega escribir** (crear/editar clases). La app
> lo captura y guarda **solo en localStorage**, mostrando el toast naranja
> *"Clase actualizada localmente (sin conexión)"* — el cambio **no llega a Supabase** y los demás
> (p. ej. el alumno) nunca lo ven. **Pendiente obligatorio antes de reactivar RLS:** enlazar cada
> monitor con su usuario de Auth (`UPDATE monitors SET auth_user_id = '<uuid>' WHERE id = '<monitor_id>';`,
> ver §2.1) y cada alumno con acceso (§6).

---

## 1. Problemas que esto resuelve

| # | Problema actual | Riesgo |
|---|---|---|
| 1 | La pantalla de selección de rol (`#loginScreen` en `index.html`) deja a cualquiera entrar como coordinador o como cualquier monitor | Cualquier usuario autenticado ve y edita todo |
| 2 | El rol se guarda en `localStorage` (`padelApp_currentUser`), editable desde la consola del navegador | Escalada de rol trivial |
| 3 | RLS deshabilitado (ver `SETUP_SUPABASE.md`) + `anonKey` pública en el repositorio | Cualquiera con la URL y la key puede leer/escribir la base de datos **sin pasar por la app** |
| 4 | Los monitores no están vinculados a usuarios de Supabase Auth (`monitors.id` es un id generado en el cliente) | Imposible escribir políticas RLS por usuario |
| 5 | Código de login duplicado: `db.js:392-445` define un segundo `handleLogin()`, `mostrarApp()` y `checkSession()` que pisan/duplican los de `app.js` | Comportamiento impredecible al cambiar el flujo de login |
| 6 | Credenciales duplicadas: `config.js` (no se carga en `index.html`) y `supabase-init.js` (el que se usa de verdad) | Confusión al rotar claves |

---

## 2. Cambios en Supabase (SQL)

### 2.1 Vincular monitores a usuarios de Auth

```sql
-- Columna que enlaza cada monitor con su usuario de Supabase Auth
ALTER TABLE monitors
    ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id);

-- El rol vive en la base de datos, nunca en el cliente
-- (la columna role ya existe: 'monitor' | 'coordinador')
```

Después, para cada monitor/coordinador real:
1. Crear su usuario en **Authentication → Users** (email + contraseña o invitación).
2. Copiar el UUID del usuario y asignarlo: `UPDATE monitors SET auth_user_id = '<uuid>' WHERE id = '<monitor_id>';`

### 2.2 Función auxiliar para las políticas

```sql
-- Devuelve el rol del usuario autenticado consultando monitors
CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT role FROM public.monitors WHERE auth_user_id = auth.uid();
$$;

-- Devuelve el id de monitor del usuario autenticado
CREATE OR REPLACE FUNCTION public.current_monitor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT id FROM public.monitors WHERE auth_user_id = auth.uid();
$$;
```

> Nota: si `monitors.id` no es de tipo `uuid` real (hoy la app genera ids tipo `_abc123` con
> `generateId()` en `app.js:115`), cambiar el tipo de retorno a `text` o migrar los ids a UUID
> con `crypto.randomUUID()` en el cliente. **Recomendado: migrar a UUID.**

### 2.3 Activar RLS y políticas

```sql
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes  ENABLE ROW LEVEL SECURITY;

-- ---------- MONITORS ----------
-- Todos los autenticados pueden ver la lista de monitores (necesario para la UI)
CREATE POLICY monitors_select ON monitors
    FOR SELECT TO authenticated USING (true);

-- Solo el coordinador crea/edita/borra monitores
CREATE POLICY monitors_write ON monitors
    FOR ALL TO authenticated
    USING (public.current_role() = 'coordinador')
    WITH CHECK (public.current_role() = 'coordinador');

-- ---------- STUDENTS ----------
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
      .from('monitors')
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
- [ ] Un usuario de Auth sin fila en `monitors` no puede entrar (mensaje claro + signOut).
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
`monitors.permissions`: se deduce en el login (`resolveUserFromAuth` en `app.js`)
cuando el usuario autenticado **no** tiene fila en `monitors` pero **sí** en
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
a la vez como personal (fila en `monitors`) y como alumno (`students.auth_user_id`),
ni metas `'usuario'` en `monitors.permissions`. Si una cuenta acumula varios roles,
`showMainApp` da **prioridad al personal** (coordinador → recepción → monitor →
alumno), pero el dato queda ambiguo. Diagnóstico rápido:
```sql
-- ¿algún usuario es personal Y alumno a la vez?
SELECT s.id, s.name FROM students s
JOIN monitors m ON m.auth_user_id = s.auth_user_id;
-- ¿algún monitor tiene 'usuario' colado en permisos?
SELECT id, name, permissions FROM monitors WHERE 'usuario' = ANY(permissions);
```

**Bloqueo por impago:** al entrar, si el alumno tiene una cuota mensual sin pagar de
un mes anterior (o del mes actual pasado el día 5), ve una pantalla de bloqueo en
vez del panel (`findBlockingUnpaidQuota` en `app.js`).

---

## 7. Solicitudes de inscripción + notificaciones — RLS PENDIENTE

`class_requests.sql` crea `class_requests` y `notifications` con **RLS deshabilitado**
("modo simple", igual que el resto). Al activar RLS habrá que añadir políticas
(hoy la validación de nivel/aforo/duplicados vive solo en el cliente, `app.js`):

```sql
ALTER TABLE class_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications  ENABLE ROW LEVEL SECURITY;

-- El alumno crea/lee SUS solicitudes; el monitor lee/resuelve las de SUS clases.
CREATE POLICY class_requests_student ON class_requests
    FOR ALL TO authenticated
    USING (student_id = public.current_student_id())
    WITH CHECK (student_id = public.current_student_id());
CREATE POLICY class_requests_monitor ON class_requests
    FOR ALL TO authenticated
    USING (monitor_id = public.current_monitor_id());

-- Cada usuario solo ve/actualiza sus notificaciones.
CREATE POLICY notifications_own ON notifications
    FOR ALL TO authenticated
    USING (recipient_id = public.current_student_id()
        OR recipient_id = public.current_monitor_id());
```

**Nota Realtime:** ambas tablas están en la publicación `supabase_realtime`. Con RLS
activo, Supabase Realtime respeta las políticas (cada quien solo recibe sus filas),
lo que refuerza el modelo. `subscribeToNotifications` filtra además por
`recipient_id` en el cliente.
