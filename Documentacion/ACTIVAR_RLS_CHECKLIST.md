# Checklist de activación de RLS — orden de ejecución

> Runbook para **salir del "modo pruebas"** (RLS desactivada) y activar la seguridad por
> rol sin romper la app. Se ejecuta **por fases, probando entre cada una**. No lo corras
> entero de golpe. Detalle y motivos en `SEGURIDAD_ROLES_PENDIENTE.md` (los § citados son de ahí).
>
> **Antes de empezar:** hazlo sobre una **copia/staging** o en una franja de poco uso. Ten a mano
> el bloque de *rollback* del final por si algo bloquea a los usuarios.

---

## Fase 0 — Diagnóstico (no cambia nada)

Objetivo: saber quién puede quedar bloqueado. RLS bloquea a cualquiera cuyo `auth_user_id`
sea NULL, porque `current_monitor_id()` / `current_student_id()` devuelven NULL.

```sql
-- 0.1 Monitores/coordinadores sin enlazar a Auth (estos quedarían bloqueados)
SELECT id, name, role FROM monitors WHERE auth_user_id IS NULL ORDER BY role, name;

-- 0.2 Alumnos SIN acceso (informativo: sin auth_user_id no entran, pero tampoco rompen nada)
SELECT id, name FROM students WHERE auth_user_id IS NULL ORDER BY name;

-- 0.3 ⚠️ Cuentas que son personal Y alumno a la vez (rompe el modelo, §6): debe salir vacío
SELECT s.id, s.name FROM students s
JOIN monitors m ON m.auth_user_id = s.auth_user_id;

-- 0.4 ⚠️ Monitores con 'usuario' colado en permisos: debe salir vacío
SELECT id, name, permissions FROM monitors WHERE 'usuario' = ANY(permissions);
```

**Puerta de paso:** 0.3 y 0.4 vacíos. Anota quién sale en 0.1 para la Fase 1.

---

## Fase 1 — Enlazar `auth_user_id` (PRERREQUISITO BLOQUEANTE)

Sin esto, activar RLS bloquea a todo el personal. Para **cada** monitor/coordinador de 0.1
(y cada alumno que deba tener acceso):

1. Crear/localizar su usuario en **Authentication → Users** (Supabase) y copiar su UUID.
2. Enlazarlo:
   ```sql
   UPDATE monitors  SET auth_user_id = '<uuid>' WHERE id = '<monitor_id>';
   -- o, para un alumno con acceso:
   UPDATE students  SET auth_user_id = '<uuid>' WHERE id = '<student_id>';
   ```

**Puerta de paso:** repetir 0.1 hasta que **no quede ningún monitor/coordinador NULL**. Los
alumnos sin `auth_user_id` pueden quedarse así (simplemente no tienen acceso todavía).

---

## Fase 2 — Elegir los 3 usuarios de prueba

De las listas ya enlazadas, elige uno de cada rol y apunta sus credenciales:

- [ ] **Coordinador** — `role='coordinador'`, enlazado.
- [ ] **Monitor** — `role='monitor'`, enlazado y **con clases propias**.
- [ ] **Alumno** — enlazado, **con pagos y alguna clase** (para probar solicitudes, baja y bloqueo por impago).

Ten 3 navegadores/perfiles distintos listos (uno por rol) — ver la nota de `localStorage` por sesión.

---

## Fase 2.5 — Renombrar la tabla `monitors` → `personal`

La tabla `monitors` contiene todo el personal (coordinador/monitor/recepción), así que se
renombró a `personal`. El código nuevo (`db.js`/`app.js`, `?v=` ya subido) usa `.from('personal')`,
y los archivos SQL de la Fase 3 ya referencian `personal` — por eso este paso va **antes** de la Fase 3.

- [ ] Con el **código nuevo desplegado** (recarga el navegador), ejecuta `rename_monitors_to_personal.sql`
      (renombra la tabla y recrea `current_monitor_id()`/`is_coordinator()`/`current_staff_role()` apuntando a `personal`).
- [ ] Comprueba: `SELECT id, name, role FROM public.personal ORDER BY role, name;` devuelve el personal.
- [ ] La app sigue funcionando (login, calendario) tras recargar.

> Se conservan a propósito la columna `monitor_id`, los nombres de función `current_monitor_id()` y el rol `'monitor'`.
> Coordina el `ALTER` con la recarga del navegador: con el código viejo cargado, la app falla hasta recargar.

---

## Fase 3 — RLS de las tablas con políticas ya escritas

Estas migraciones ya existen y están probadas. Aplícalas y **prueba antes de seguir**.

1. Verifica que existen las funciones (deberían, de `student_role.sql`):
   ```sql
   SELECT proname FROM pg_proc
   WHERE proname IN ('current_monitor_id','current_student_id','is_coordinator');
   ```
2. Ejecuta, en este orden:
   - [ ] `rls_security_por_rol.sql`  (personal, students, classes, matches, tournaments*)
   - [ ] `student_role.sql`          (student_payments, student_recoveries + override de classes/students para el alumno)
   - [ ] `rls_recepcion_fix.sql`     (**imprescindible**: corrige las escrituras que quedaban solo-coordinador —
         `students` pasa a "cualquier personal" y `matches`/`tournaments`/`tournament_pairs`/`tournament_matches`
         a **solo recepción**. Sin esto, al activar RLS Recepción no puede gestionar partidos/torneos)
   - [ ] `rls_cleanup_old_policies.sql` (**imprescindible**: borra políticas viejas permisivas —`auth_all_*`,
         `"Acceso total a usuarios logueados"`, etc.— que quedaron de experimentos previos. Las políticas de RLS
         se combinan con **OR**: una política vieja "acceso total a autenticados" **anula** las por rol y Belen
         vería todas las clases. Verifica con `pg_policies` que solo quedan las políticas por rol)
   - [ ] `students_privacy.sql` (privacidad: el alumno solo lee su propia fila de `students`; los demás, nombre/nivel
         vía la vista `students_roster`. Sin esto, un alumno lee email/teléfono de todos)

> **⚠️ Gotcha de orden:** `rls_security_por_rol.sql` **y** `student_role.sql` definen ambos
> `classes_select`. Debe ganar la de `student_role.sql` (la que incluye la rama del alumno).
> Verifícalo: `SELECT qual FROM pg_policies WHERE tablename='classes' AND cmd='SELECT';` — el
> `qual` **tiene que contener `current_student_id()`**. Si no, el alumno ve 0 clases (avisos rotos):
> reaplica el `classes_select` de `student_role.sql`.

**Puerta de paso — checklist del §4, con los 3 usuarios:**
- [ ] El **monitor** solo ve SUS clases (no las de otros), también desde la consola:
      `supabase.from('classes').select('*')` devuelve solo las suyas.
- [ ] El monitor NO ve el panel de coordinador (ni tocando `localStorage`).
- [ ] El **coordinador** ve todos los monitores y todas las clases.
- [ ] El **alumno** ve sus pagos, sus recuperaciones y sus clases; no ve datos de otros.
- [ ] Un usuario de Auth **sin** fila en `monitors`/`students` no entra (mensaje claro + signOut).
- [ ] Sin sesión, un `select` sobre cualquier tabla devuelve 0 filas / error.
- [ ] **Recepción** puede gestionar partidos y torneos (crear/editar) y registrar resultados
      (sube el nivel del alumno → escribe en `students`).
- [ ] **Prueba negativa (clave):** con el **monitor** (Belen) logueado, desde la consola
      `supabase.from('tournaments').insert({ name:'x' })` debe **fallar** (solo recepción escribe torneos/partidos).
- [ ] El **monitor** sí puede gestionar sus alumnos (escritura en `students` permitida a todo el personal).

Si algo falla aquí → **rollback** (final) y revisar antes de continuar.

---

## Fase 4 — RLS de `class_requests` y `notifications` (§7, políticas corregidas)

Estas políticas **todavía no están en un archivo .sql**: cópialas del §7 del documento a un
nuevo `class_requests_rls.sql` y ejecútalo. Recuerda: **`FOR ALL` NO** — van separadas por
operación (alumno solo INSERT 'pendiente' + SELECT; monitor SELECT/UPDATE; notificaciones con
INSERT abierto pero SELECT/UPDATE solo de las propias).

- [ ] Aplicar §7.1 (`class_requests`) y §7.2 (`notifications`).

**Puerta de paso — flujo completo alumno↔monitor:**
- [ ] El alumno **solicita** una clase → al monitor le llega el aviso en tiempo real (prueba que
      el INSERT de notificación dirigido al monitor NO se bloquea).
- [ ] El monitor **rechaza** → el alumno recibe el aviso.
- [ ] El alumno **NO** puede autoconfirmarse desde la consola:
      `supabase.from('class_requests').update({ status:'confirmada_pagada' }).eq('id','<suya>')`
      debe **fallar**.
- [ ] Cada usuario solo ve SUS notificaciones.

> Pendiente opcional de endurecer (§7.1/§7.2): trigger que impida al monitor tocar columnas de
> pago, y/o mover `createNotification` al servidor. No bloquea esta fase.

---

## Fase 5 — Frontend acompasado (§3) y limpieza

Activar RLS deja incoherencias si la UI sigue decidiendo el rol en el cliente. Revisar §3:
- [ ] Quitar/ajustar la pantalla de selección de rol y el modal "Ingresar como Monitor" (§3.1).
- [ ] El rol se deriva de la sesión, no de `localStorage` (§3.2).
- [ ] Borrar archivos muertos: `borrador/` (`app_backup.js`, `migrate.html`), `app_supabase.js`, y decidir `config.js` vs `supabase-init.js` (§3.4).

> Estos son cambios de **código**: al tocarlos, subir el `?v=` de caché en `index.html` y documentar.

---

## Fuera de este runbook (no bloquean la activación de RLS)

- **§8 — Stripe**: bloqueante solo **antes de pasar a dinero real** (modo LIVE), no para activar RLS.
- **§9 — Escapar HTML (XSS)**: cambio de frontend independiente; hacerlo cuando se toque `app.js`.
- **§2.4 — Trigger de `paid`** y **§2.5 — Rotar la anon key**: recomendables, no bloqueantes.

---

## Rollback (si algo bloquea a los usuarios)

Desactiva RLS en la tabla problemática para volver al "modo pruebas" sin perder datos:

```sql
ALTER TABLE <tabla> DISABLE ROW LEVEL SECURITY;
-- Tablas implicadas: monitors, students, classes, matches, tournaments,
-- tournament_pairs, tournament_matches, student_payments, student_recoveries,
-- class_requests, notifications
```

Las políticas quedan creadas pero inertes mientras RLS esté OFF; al volver a activarla siguen ahí.
