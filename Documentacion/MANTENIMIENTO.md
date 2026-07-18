# Mantenimiento futuro — PadelPro Manager

Notas de deuda técnica y mejoras aplazadas conscientemente. Ninguna es urgente;
cada entrada indica **cuándo** conviene abordarla y **dónde** tocar.

---

## 1. Carga de clases por rango de fechas (la única que crecerá con el tiempo)

**Estado actual:** al abrir la app, `db.js` descarga **todas** las clases de la
tabla `classes` de Supabase y las guarda en `appState.classes`. Cada clase
recurrente genera 52 filas/año, así que el volumen crece indefinidamente con
los años de actividad de la escuela.

**Qué NO es problema:** el renderizado. El calendario mensual móvil está
virtualizado (solo ~10 meses viven en el DOM, constante para siempre) y usa un
índice `fecha → clases` (`rebuildMonthClassesIndex` en `app.js`), por lo que
pintar un mes cuesta lo mismo con 100 que con 100.000 clases.

**Qué SÍ crecerá:** la descarga inicial (el overlay "Cargando datos...") y la
memoria de `appState.classes`.

**Síntoma que indica que ha llegado el momento:** el spinner inicial tarda
varios segundos en móvil con buena conexión.

**Solución prevista:**
- En `db.js`, cambiar la consulta de clases para pedir solo un rango
  (p. ej. `start_at` entre hoy−6 meses y hoy+12 meses) usando
  `.gte()`/`.lte()` de Supabase.
- Añadir una función `loadClassesRange(desde, hasta)` que traiga meses
  adicionales bajo demanda cuando el usuario navegue fuera del rango cargado
  (engancharla en `updateVirtualMonths`/`onMonthScroll`, que ya sabe qué mes
  está mirando el usuario).
- Mantener la conversión camelCase ↔ snake_case en `db.js` (regla del proyecto).
- Ojo con las funciones que asumen "todas las clases en memoria":
  `getMonitorStats`, `buildMonthRows` (tabla anual del coordinador),
  `hasClassTimeConflict`, la búsqueda por alumno (`getClassesForStudent`) y la
  exportación a Excel. Para coordinador/exportación puede ser mejor una
  consulta específica por año que cargarlo todo.

**Esfuerzo estimado:** medio (un día de trabajo con pruebas).

---

## 2. Poda del mapa de posiciones del calendario virtualizado

**Estado actual:** `monthLayout` (Map `índiceMes → {top, height}` en `app.js`)
crece según el usuario viaja por el calendario. Son solo 2 números por mes
(~50 bytes): recorrer 80 años acumularía ~50KB. Se descarta al recargar.

**Cuándo abordarlo:** probablemente nunca. Solo si se detectara consumo de
memoria anómalo en sesiones extremadamente largas.

**Solución prevista:** en `updateVirtualMonths`, descartar entradas del Map a
más de N años del mes visible (y ajustar `monthLayoutMin/Max`).

---

## 3. Rebase del margen superior con inercia extrema

**Estado actual:** el lienzo del calendario reserva 3 años de pista hacia el
pasado y la repone en cada pausa del scroll (`maybeExtendHeadroom`). Existe un
"rebase de emergencia" (`updateVirtualMonths`) que solo saltaría si alguien
encadena flings sin pausa alguna durante 36+ meses de calendario; en ese caso
corta la inercia una vez (microajuste, no un choque).

**Cuándo abordarlo:** solo si algún usuario reporta el microcorte en uso real.

**Solución prevista:** aumentar la pista inicial/reposición (36 → 60 meses)
o reponer también durante el scroll lento (velocidad < umbral), no solo en
pausas.

---

## 4. Vista semanal táctil en horizontal (descartada por ahora)

**Estado actual:** en móvil, girar el teléfono NO cambia de vista (decisión
deliberada: `isMobileLayout()` decide por tipo de dispositivo, no por ancho).
La vista semanal de escritorio no está adaptada a touch.

**Cuándo abordarlo:** si los monitores piden ver la semana completa en el
móvil girado (patrón iOS: vertical=día, horizontal=semana).

**Requisitos:** adaptar la rejilla semanal a touch (targets 44px, sin hover,
verificar drag táctil con 7 columnas estrechas) manteniendo la misma
`fechaAncla` (`setAnchorDate`).

---

## 5. Búsqueda 🔍: posibles ampliaciones

**Estado actual:** el buscador de la vista de día busca alumnos por
nombre/apellidos (sin tildes) y lista sus clases (próximas primero).

**Ideas aplazadas:** buscar también por día de la semana u hora ("martes 18:00"),
saltar directamente a la vista de día del resultado tocado (hoy abre el modal
de detalles), historial de búsquedas recientes.

---

## 6. Despliegue definitivo

**Estado actual:** pruebas vía servidor local (`python -m http.server 8000`) +
túnel temporal de Cloudflare (`cloudflared tunnel --url http://localhost:8000`,
URL aleatoria en cada arranque).

**Pendiente:** publicar en **Cloudflare Pages** (la cuenta ya existe) para
tener URL fija sin PC encendido. La app es 100% estática; `config.js` con la
anon key de Supabase puede publicarse (la seguridad real es Auth + RLS).
Tras publicar: "Añadir a pantalla de inicio" en los móviles de los monitores.

**Nota de caché (importante al probar en móvil):** el navegador solo coge el
código nuevo si recarga `index.html`. iOS/Safari cachea el propio index, así
que se queda pidiendo el `app.js`/`styles.css` viejos aunque se haya subido el
`?v=N`. Por eso el `<head>` del index lleva metas `Cache-Control: no-cache`.
Para SALIR de un index ya cacheado (la primera vez), abrir la URL con un query
nuevo: `?fresh=1`, `?fresh=2`… Señal de que se está en código nuevo: en
Coordinador → Gestión de clase el buscador está arriba y la tabla scrollea en
su propia caja de altura fija.

---

## 7. Carga de pagos de "Gestión de clase" (crecerá con el histórico)

**Estado actual:** la pestaña **Gestión de clase** del coordinador
(`renderGestionClase` en `app.js`) descarga **todos** los pagos de la tabla
`student_payments` en una sola llamada lógica (`db.getAllPayments`, que pagina
de 1000 en 1000 para superar el límite de Supabase) y los agrupa por alumno en
memoria. Antes se hacía **una consulta por alumno** (N+1); eso ya se corrigió.

**Qué NO es problema:** ni el filtrado del buscador (es en memoria, instantáneo
con miles de alumnos) ni pintar la tabla (string HTML + scroll interno de altura
fija). El coste no depende del nº de alumnos, sino del **nº total de pagos**.

**Qué SÍ crecerá:** `getAllPayments` trae **todo el histórico** de pagos. Para un
club normal (unos miles de registros al año) va sobrado; con decenas de miles
acumulados en varios años, la descarga empezará a notarse al abrir la pestaña.

**Síntoma que indica que ha llegado el momento:** "Cargando historial de
pagos..." tarda varios segundos al entrar en Gestión de clase.

**Solución prevista:** acotar la consulta a lo que de verdad importa para
"al día / retraso" — los **últimos ~12 meses** — en lugar de traerlo todo.
Cambio localizado en `db.getAllPayments` (`.gte('period', <YYYY-MM de hace 12
meses>)` o por `paid_date`/`created_at`). Ojo: la columna "Última cuota pagada"
podría no encontrar una cuota más antigua que el rango; si se quiere exacta,
calcularla con una consulta agregada aparte. Mantener la conversión
camelCase ↔ snake_case en `db.js` (regla del proyecto).

**Esfuerzo estimado:** bajo (un solo punto a tocar).

---

## 8. Notificaciones sin poda + validación de solicitudes solo en cliente

**Estado actual:** el sistema de solicitudes de inscripción (tablas
`class_requests` + `notifications`, ver `class_requests.sql`) funciona bien para
el volumen de una escuela, pero tiene dos deudas conscientes:

1. **`notifications` no se poda nunca.** Cada solicitud genera 1–N filas y no hay
   borrado ni caducidad. `getNotifications`/`getUnreadNotifications` traen todo el
   histórico del usuario. Para un club normal es despreciable; con años de uso,
   crecerá sin límite.
2. **Parte de la lógica de negocio sigue en el cliente.** Con el cobro (ver §9), la
   **aceptación ya se validó en servidor** (`functions/api/checkout/create.js`
   rehace aforo, margen y precio). La validación de nivel (±0,5) al solicitar sigue
   siendo solo de cliente (`requestClassEnrollment` en `app.js`), pero **la carrera de
   aceptación (sobrecupo) YA está resuelta** (jul 2026): el aforo se reserva de forma
   atómica con la función Postgres `reserve_class_spot` (`SELECT ... FOR UPDATE`), así
   que dos aceptaciones simultáneas no pueden pasar de `max_capacity`. Migración en
   `race_and_cancellation.sql`; ver también `CLAUDE.md` → "Reserva atómica".

**Qué NO es problema:** el flujo normal (un monitor por clase, pocas solicitudes
simultáneas). El Realtime es push, no polling, así que no añade carga por sondeo.

**Síntoma que indica que ha llegado el momento:** listas de "Mis solicitudes"
muy largas, o incidencias de clases que superan las 4 plazas.

**Solución prevista:**
- Poda: marcar leídas/archivar notificaciones antiguas (`markAllNotificationsRead`
  ya existe) y/o un borrado periódico de `notifications` con `created_at` > N meses.
- ~~Atomicidad: mover la reserva de plaza a una función RPC de Postgres.~~ ✅ **Hecho**
  (jul 2026): `reserve_class_spot` (`race_and_cancellation.sql`), llamada desde
  `checkout/create.js`. Ya no hay sobrecupo por carrera de aceptación.
- Activar RLS en ambas tablas (políticas ya redactadas en
  `SEGURIDAD_ROLES_PENDIENTE.md`, sección 7).
- Mantener la conversión camelCase ↔ snake_case en `db.js` (regla del proyecto).

**Esfuerzo estimado:** bajo (ya solo queda la poda de notificaciones + activar RLS).

---

## 9. Pagos con Stripe: filas "zombie" y carga de holds

**Estado actual:** el cobro al aceptar una solicitud (ver `stripe_payments.sql` y la
sección "Pagos con Stripe" de `CLAUDE.md`) funciona sin ningún job programado, a
propósito: la plaza la libera el **aforo con holds** (un hold con `payment_expires_at`
vencido deja de contar), y la fila la cierra el webhook `checkout.session.expired`.
De ahí salen dos deudas conscientes:

1. **Filas "zombie" si un webhook nunca llega.** Si Stripe no consigue entregar el
   evento (endpoint caído mucho tiempo, secreto mal configurado), la solicitud se queda
   en `aceptada_pendiente_pago` para siempre. **No afecta al aforo** (el hold caducado
   ya no retiene la plaza) ni al alumno (su panel muestra "El plazo ha terminado"), pero
   ensucia el histórico y la solicitud nunca llega a `cancelada_por_impago`.
2. **`getActiveHolds()` trae los holds de TODA la app**, no los de una clase. Como solo
   existen mientras un pago está en curso (minutos u horas), en la práctica son un puñado
   de filas. Solo crecería si el club llegara a tener muchísimos pagos simultáneos.

**Qué NO es problema:** el doble cobro ni la doble inscripción. `confirmPayment` es
idempotente y la unicidad de `stripe_session_id` lo garantiza aunque Stripe reintente el
evento o el alumno vuelva a la app antes que el webhook.

**Síntoma que indica que ha llegado el momento:** filas viejas en
`aceptada_pendiente_pago` con `payment_expires_at` muy pasado (consulta de control), o el
panel del alumno tardando en cargar.

**Solución prevista:**
- Zombies: un barrido periódico (pg_cron en Supabase, o un `scheduled` handler) que pase a
  `cancelada_por_impago` las solicitudes con `payment_expires_at < now()`. Reutilizar la
  lógica de `cancelForNonPayment` (`functions/_shared/fulfillment.js`), que ya es idempotente.
- Holds: filtrar `getActiveHolds()` por las clases visibles, igual que la §1 hará con las clases.

**Esfuerzo estimado:** bajo (el barrido es una query + reutilizar código existente).

---

## 10. Política de precios de las clases (DECISIÓN PENDIENTE)

**Estado actual:** `classes.precio` (numeric, default **10,00 €**) es un campo **editable a
mano** en el formulario de clase. Es lo que paga el alumno para confirmar su plaza.

**Lo que falta decidir (no es técnico, es de negocio):** si el precio es fijo para todas las
clases, por nivel, por tipo de clase, por duración, o por número de alumnos. Se dejó como campo
manual **a propósito** para no bloquear la implementación del cobro.

**Cuándo abordarlo:** antes de cobrar de verdad (hoy todo está en modo test de Stripe).

**Solución prevista:** según lo que se decida, o bien un precio único en `CONFIG`, o bien
calcularlo al crear la clase. El resto del flujo no cambia: `checkout/create.js` ya lee el
importe de `classes.precio` y lo **congela** en `class_requests.price` al aceptar, así que
cambiar la política no altera los pagos ya acordados.

---

## 11. Renombrado `monitors` → `personal`: solo se hizo la tabla, no las columnas/funciones

**Estado actual:** la tabla `monitors` se renombró a `personal` (contiene todo el personal:
coordinador/monitor/recepción; ver `rename_monitors_to_personal.sql`). Se hizo la **opción A**
(renombrado de la colección): tabla, `.from('personal')`, `appState.personal` y la capa
`db.*Personal*`. Se **conservaron a propósito**: la columna `classes.monitor_id` /
`class_requests.monitor_id`, las funciones RLS `current_monitor_id()` / `is_coordinator()` /
`current_staff_role()` y las variables/funciones JS `monitorId`, `monitorName`, `getMonitorById()`,
`addMonitor/updateMonitor/deleteMonitor` (UI). El valor de rol `'monitor'` sigue siendo un rol válido y NO se toca.

**Qué NO es problema:** funciona y es coherente. `monitor_id` es semánticamente correcto (una
clase la imparte un monitor) y evitó el riesgo alto de renombrar una columna de la que dependen
todas las lecturas/escrituras de clases.

**Qué queda "a medias" (solo estético):** una tabla `personal` con FK `monitor_id` y una función
`current_monitor_id()` que en realidad devuelve un id de `personal`. Puede despistar al leer el código.

**Cuándo abordarlo (renombrado completo, opción B):** solo si molesta la incoherencia, y **después**
de tener RLS activado y estable — nunca a la vez. Implica: `ALTER TABLE ... RENAME COLUMN monitor_id
TO personal_id` en `classes` y `class_requests`, renombrar `current_monitor_id()` → `current_personal_id()`
(cascada a **todas** las políticas de **todos** los `.sql`), y `monitorId`/`monitorName` en `app.js`.
Alto churn y coordinación `ALTER` + despliegue. Mantener el rol `'monitor'` intacto en cualquier caso.

**Esfuerzo estimado:** alto (renombrar columna en producción coordinado con el código + reescribir políticas).

---

## 12. RLS de `classes`: todo el personal lee todas las clases (afinado por monitor aplazado)

**Estado actual:** con `rls_activacion_final.sql`, la política `classes_select` deja **leer
todas las clases a cualquier personal** (coordinador/monitor/recepción); el calendario del
monitor se filtra en cliente (`getClassesForDate` en `app.js`), como siempre. La **escritura**
sí es estricta: solo el coordinador o el monitor dueño (`monitor_id`).

**Por qué se decidió así:** el diseño original "el monitor solo VE las suyas"
(`rls_security_por_rol.sql`) fue parte de lo que rompió el primer intento de RLS, y la app
entera asume todas las clases en memoria (avisos de alumnos, estadísticas, exportación).
Recepción además podría necesitar consultar clases. Es una relajación **solo de lectura**
entre personal del club; los alumnos siguen limitados (futuras no cerradas).

**Cuándo abordarlo:** si algún día se quiere que un monitor no pueda ni ver la agenda de
otros. Implica volver a `monitor_id = current_monitor_id()` en el SELECT y revisar todo lo
que asume la lista completa (mismo inventario que la entrada 1).

**Esfuerzo estimado:** bajo en SQL, medio en revisar la app (solapa con la entrada 1).
