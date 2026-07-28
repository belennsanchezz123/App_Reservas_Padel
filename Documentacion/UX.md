# UX — Patrones de interacción (scroll, sheets, gestos)

Catálogo de los mecanismos de interacción implementados en PadelPro Manager, pensado
para **replicarlos en otras pantallas o proyectos**. Cada patrón describe: el problema
que resuelve, cómo funciona, dónde está en el código y cómo reutilizarlo.

Filosofía general: imitar el tacto del **Calendar de iOS**. Tres sistemas de navegación
independientes (ortogonales) que nunca se mezclan:

1. **Jerárquico / zoom semántico** — Año ↔ Mes ↔ Día (pellizco y toque).
2. **Temporal** — desplazarse por fechas dentro de un mismo nivel (scroll infinito).
3. **Modal** — crear / editar / ver, en una capa que flota por encima (sheets).

---

## 0. Detección de layout móvil — `isMobileLayout()`

Todos los patrones táctiles se activan solo en móvil. Es la guarda que usan casi todos.

```js
function isMobileLayout() {
    const coarseTouch = window.matchMedia('(hover: none) and (pointer: coarse) and (max-width: 950px)').matches;
    return coarseTouch || window.innerWidth <= 768;
}
```

- Código: [app.js](../app.js) → `isMobileLayout` (≈ línea 286).
- **Replicar:** llama a esta función antes de enganchar cualquier gesto táctil. Combina
  puntero grueso (dedo) + ancho, para no activar gestos con ratón en pantallas pequeñas.

---

## 1. Bloqueo del scroll de fondo con un modal abierto ⭐

**Problema (scroll chaining / scroll bleed):** con un modal abierto, al hacer scroll
dentro del formulario y llegar a su borde, el gesto "se desbordaba" y movía el calendario
de fondo. Un modal debe mover **solo su contenido**.

**Solución — dos capas de defensa:**

### 1a. Bloqueo de fondo unificado y robusto (`lockBackgroundScroll` / `unlockBackgroundScroll`)

Un **único** mecanismo bloquea el fondo para **modales y vista de día** (§7). Dos
decisiones lo hacen robusto:

- **`position: fixed` + guardar/restaurar `scrollY`**, no solo `overflow: hidden`. En
  Safari iOS `overflow:hidden` NO frena el scroll táctil; fijando el body y desplazándolo
  con `top: -scrollY` el fondo queda realmente inmóvil. Al liberar se restaura la posición
  exacta con `window.scrollTo`.
- **Propietarios en un `Set`, no un contador numérico.** Cada bloqueo se pide con un
  identificador (el `modalId`, o `'day-view'`). Ventajas:
  - **Idempotente:** pedir el mismo bloqueo dos veces no descuadra nada (p. ej.
    `renderDayClassesPanel` se llama en cada refresco de datos).
  - **Anidamiento correcto:** un modal sobre la vista de día → dos propietarios; el fondo
    solo se libera cuando **todos** sueltan.

```js
// app.js
const scrollLockOwners = new Set();
let scrollLockSavedY = 0;

function lockBackgroundScroll(owner) {
    if (scrollLockOwners.has(owner)) return;          // idempotente
    const firstLock = scrollLockOwners.size === 0;
    scrollLockOwners.add(owner);
    if (!firstLock) return;                           // ya bloqueado: solo registrar
    scrollLockSavedY = window.scrollY;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`; // sin salto en escritorio
    document.body.style.top = `-${scrollLockSavedY}px`;
    document.body.classList.add('scroll-locked');
}

function unlockBackgroundScroll(owner) {
    if (!scrollLockOwners.has(owner)) return;
    scrollLockOwners.delete(owner);
    if (scrollLockOwners.size > 0) return;            // quedan propietarios → seguir bloqueado
    document.body.classList.remove('scroll-locked');
    document.body.style.top = '';
    document.body.style.paddingRight = '';
    window.scrollTo(0, scrollLockSavedY);             // restaurar posición exacta
}
```
```css
/* styles.css — global (funciona en escritorio y móvil) */
body.scroll-locked { position: fixed; left: 0; right: 0; width: 100%; overflow: hidden; }
```

`openModal(id)` llama a `lockBackgroundScroll(id)` y `closeModal(id)` a
`unlockBackgroundScroll(id)`. La vista de día usa el propietario `'day-view'` (§7).

**Por qué no salta el fondo:** al fijar el body en `top: -scrollY`, el contenido que
estaba bajo el modal se queda en el MISMO sitio visual (el backdrop semitransparente
sigue mostrando lo mismo). La compensación de `padding-right` evita el salto al
desaparecer la barra de scroll en escritorio.

### 1b. Contener el scroll interno (defensa en profundidad)

Aunque el fondo ya está bloqueado, se contiene también el scroll del propio panel para
que no rebote raro al llegar al borde:

```css
.modal-content { overflow-y: auto; overscroll-behavior: contain; }
```

- Código: [app.js](../app.js) → `lockBackgroundScroll`/`unlockBackgroundScroll`,
  `openModal`/`closeModal`; [styles.css](../styles.css) → `body.scroll-locked`, `.modal-content`.
- **Reglas de oro:**
  - **Todo** cierre de modal debe pasar por `closeModal()` (incluido el clic en el fondo),
    o el propietario se queda en el `Set` y el fondo no vuelve a scrollear.
  - Cada bloqueo debe tener su liberación con el **mismo `owner`**. Si un flujo puede
    llamar a `lock` varias veces (refrescos), no pasa nada: es idempotente.
- **Replicar en otro proyecto:** copia el par `lock/unlockBackgroundScroll` + la clase
  `body.scroll-locked`. Cualquier superficie (modal, sheet, panel a pantalla completa)
  pide el bloqueo con su propio identificador. Una sola implementación, válida en iOS,
  Android y escritorio.

---

## 2. Sheets estilo iOS: arrastrar hacia abajo para cerrar — `setupSheetDragDismiss()`

**Problema:** en móvil, los modales deben comportarse como *sheets* de iOS: se pueden
arrastrar hacia abajo y, si superas un umbral, se cierran; si no, rebotan a su sitio.

**Cómo funciona (lógica de cesión del gesto):**
- Solo se activa en móvil y **solo si el contenido está scrolleado arriba del todo**
  (`content.scrollTop === 0`). Si hay scroll interno pendiente, el gesto es scroll, no cierre.
- Si el dedo está sobre una **lista con scroll propio** (alumnos, resultados de búsqueda…)
  y esa lista está scrolleada, el gesto le pertenece a la lista, no al sheet.
- Durante el arrastre hacia abajo: `translateY(dy)` en tiempo real + `preventDefault()`
  para matar el rebote nativo del navegador.
- Al soltar: umbral = `min(alto × 0.3, 160px)`.
  - Superado → `translateY(100%)` y `closeModal()`.
  - No → `transform: ''` (rebota) con transición `cubic-bezier(0.32, 0.72, 0, 1)` (la curva de iOS).

- Código: [app.js](../app.js) → `setupSheetDragDismiss` (≈ línea 3549).
- **Detalle clave:** solo dispara hacia abajo (`dy > 0`); hacia arriba cede el gesto para
  scrollear con normalidad. Las alertas centradas (`.modal-center`) se excluyen: no son sheets.
- **Replicar:** el patrón reutilizable es **"decidir de quién es el gesto al empezar"**
  mirando `scrollTop` del contenedor y de sus listas internas, y ceder en cuanto una lista
  interna empieza a moverse.

### 2b. Sheets EXPANDIBLES con anclajes (detents) — `setupExpandableSheet()`

**Problema:** algunos paneles (Avisos, Buscar clases) deben poder **agrandarse** tirando
de la barra de arriba, como los sheets de iOS con *detents*: un tamaño medio por defecto
y uno grande casi a pantalla completa.

**Cómo funciona:**
- Se aplica solo a modales marcados con la clase `.sheet-expandable` (el resto sigue con
  el arrastre-para-cerrar simple de §2). El enrutado está en `setupSheetDragDismiss`.
- **Dos anclajes** calculados sobre `window.innerHeight`: medio (`0.6`) y grande (`0.92`).
- **El gesto arranca SOLO desde la barra de arriba** (el asa `e.target === content` o la
  `.modal-header`); la lista interna scrollea con normalidad. El botón `✕` se excluye para
  que su tap funcione.
- Durante el arrastre se cambia la **altura** (`content.style.height`), no un `translateY`:
  - Arrastrar arriba → `height` crece hasta el anclaje grande.
  - Arrastrar abajo → `height` encoge hasta el medio; **por debajo del medio** se cambia a
    **modo cierre** (`translateY` creciente) y, pasado el umbral (`min(medio×0.25, 120px)`),
    `closeModal()`.
- Al soltar (`resize`): se ajusta al anclaje más cercano (medio o grande) con transición iOS.
- Layout CSS: `.sheet-expandable .modal-content` es `flex-column` con `height` fija y
  `overflow:hidden`; la **cabecera queda fija** (`flex-shrink:0`) y la **lista interna**
  (`.solicitudes-list` / `.search-classes-results`) es `flex:1; min-height:0; overflow-y:auto`.
  `openModal` limpia la altura para reabrir siempre en el anclaje medio.

- Código: [app.js](../app.js) → `setupExpandableSheet`, constantes `SHEET_MEDIUM_RATIO` /
  `SHEET_LARGE_RATIO`; [styles.css](../styles.css) → `.modal.sheet-expandable …`;
  [index.html](../index.html) → clase `sheet-expandable` en `#notifModal` y `#searchClassesModal`.
- **Diferencia con §2:** aquí el gesto **redimensiona con `height`** (no desliza), y solo
  se dispara desde la barra superior. Cerrar es el mismo final (`translateY` + umbral) pero
  solo tras cruzar el anclaje medio.
- **Replicar:** marca el panel con `.sheet-expandable`, dale un layout flex-column
  (cabecera fija + lista `flex:1` scrolleable) y engancha `setupExpandableSheet`. Para más
  anclajes, amplía la lista de ratios y el ajuste "al más cercano" al soltar.

---

## 3. Apariencia de sheet (CSS móvil)

Lo visual que acompaña al patrón 2, dentro del `@media` móvil:

```css
.modal { padding: 0; align-items: flex-end; }          /* anclado abajo */
.modal-content {
    width: 100%; max-height: calc(100dvh - 2.5rem);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    animation: sheetUp 0.28s cubic-bezier(0.32, 0.72, 0, 1);
    padding-bottom: env(safe-area-inset-bottom);         /* respeta el notch/home bar */
    will-change: transform;
}
.modal-content::before {                                 /* asa gris de arrastre */
    content: ''; width: 40px; height: 4px; border-radius: 999px;
    background: var(--gray-300); margin: 8px auto 0;
}
```

- Código: [styles.css](../styles.css) (≈ línea 2456).
- **Claves para el tacto iOS:** `100dvh` (no `100vh`, que se rompe con la barra del
  navegador móvil), `env(safe-area-inset-bottom)`, el asa con `::before`, y la curva
  `cubic-bezier(0.32, 0.72, 0, 1)` repetida en todas las animaciones.
- **Excepción `.modal-center`:** confirmaciones rápidas = alerta centrada (no sheet),
  con `align-items:center` y animación `alertPop`.

---

## 4. Zoom semántico con pellizco — `setupPinchGesture(el, handlers)`

**Problema:** replicar el gesto del Calendar donde **separar dos dedos = más detalle**
(Mes → Día) y **juntarlos = menos detalle** (Día → Mes). No es escalar píxeles, es
cambiar de nivel de información (*zoom semántico*).

**Cómo funciona:**
- Con 2 dedos (`touchstart`, `touches.length === 2`): guarda distancia inicial y centro.
- En `touchmove`: `ratio = distanciaActual / distanciaInicial`.
  - `ratio > 1.25` → `handlers.onZoomIn(cx, cy)` (entra un nivel).
  - `ratio < 0.8` → `handlers.onZoomOut(cx, cy)` (sale un nivel).
- `fired` asegura **un solo disparo por gesto** (no encadena zooms mientras no sueltes).
- Los cambios de vista pesados (re-render) se **encolan** y se aplican en `onGestureEnd`,
  cuando ya no hay dedos sobre el DOM (evita reflows a media animación).

- Código: [app.js](../app.js) → `setupPinchGesture` (≈ línea 1020), enganchado a
  `onZoomIn`/`onZoomOut`/`onGestureEnd` del calendario.
- **Replicar:** pásale un elemento y un objeto de handlers. La firma es genérica; sirve
  para cualquier "zoom de niveles", no solo el calendario.

### 4b. Candado de scroll durante el pellizco (workaround iOS)

**Problema iOS:** Safari sigue desplazando un scroll ya iniciado aunque cambies `overflow`
o llames a `preventDefault()`. Durante un pellizco, el fondo "se colaba".

**Solución:** mientras el pellizco está activo se registra un listener de `scroll` que
**revierte al instante** cualquier desplazamiento a la posición bloqueada (`lockTop`):

```js
const lockScroll = () => { if (getScrollPos() !== lockTop) setScrollPos(lockTop); };
```
- Al soltar, el candado se mantiene **250 ms extra** para absorber la inercia residual
  que iOS suelta al final del gesto, y luego se libera.
- Si un dedo vuelve a tocar antes (el usuario quiere scrollear), se libera al instante
  para no pisarle el gesto. También hay recuperación si iOS "pierde" el `touchend`.
- Código: [app.js](../app.js) `lockScroll` / `resetPinch` (≈ líneas 1043–1124).
- **Replicar:** cuando necesites congelar el scroll durante un gesto en iOS, no confíes
  en `overflow:hidden`; añade este candado que revierte la posición + ventana de inercia.

---

## 5. Scroll temporal infinito y virtualizado (lista de meses)

**Problema:** desplazarse por meses sin fin, como iOS, sin renderizar miles de meses ni
provocar tirones.

**Decisiones clave:**
- **Una sola superficie de scroll = el scroll de la PÁGINA** (`window`), no un contenedor
  con scroll propio. Igual que iOS: el calendario y la página son el mismo scroll.
  El listener vive en `window`: `window.addEventListener('scroll', onMonthScroll, {passive:true})`.
- **Virtualización por posición:** `updateVirtualMonths()` materializa solo los meses dentro
  de la ventana visible ± `MONTH_VIEW_BUFFER` y desmaterializa el resto. El lienzo tiene
  altura calculada; los meses se colocan por `top` absoluto.
- **Histéresis al desmaterializar:** los meses recién salidos se conservan un buffer extra,
  para que invertir el sentido del scroll no obligue a reconstruirlos (evita el tirón).
- **Rebase invisible del lienzo:** cuando el scroll está en calma (`setTimeout` de 180 ms),
  se repone "pista" hacia arriba (`rebaseCanvas`). **Nunca durante el gesto**, para no matar
  la inercia. Crecer por abajo no mueve nada; reponer arriba solo cuando está quieto.
- **Guarda de elemento oculto:** si `container.offsetParent === null` (un ancestro en
  `display:none`), se aborta: con rect 0 el rebase daría un salto ("pum").

- Código: [app.js](../app.js) → `updateVirtualMonths` (≈ 1415), `onMonthScroll` (≈ 1486),
  `maybeExtendHeadroom` (≈ 1509), `scrollToMonthSection` (≈ 1525).
- **Replicar:** para cualquier lista infinita con tacto nativo → usa el scroll de la
  página, virtualiza por posición absoluta, aplica histéresis y haz los reajustes de
  layout **solo cuando el scroll está quieto**, jamás durante el gesto.

---

## 6. Transiciones de vista animadas — `withViewTransition(update)`

**Problema:** al cambiar de nivel (Mes ↔ Día) el cambio debe tener continuidad visual,
no un salto seco.

```js
function withViewTransition(update) {
    if (document.startViewTransition && isMobileLayout()) {
        document.startViewTransition(update);   // View Transitions API
    } else {
        update();                               // fallback: cambio directo
    }
}
```
- Código: [app.js](../app.js) (≈ línea 293). Usado en `openDayView` / `closeDayViewToMonth`.
- **Replicar:** envuelve cualquier mutación de DOM que cambie de vista en `withViewTransition`.
  Degrada con elegancia donde no hay soporte (escritorio o navegadores antiguos).

---

## 7. Bloqueo de fondo en la vista de día — mismo helper unificado

La vista de día a pantalla completa usa **el mismo** `lockBackgroundScroll` / `unlockBackgroundScroll`
del §1, con el propietario `'day-view'`:

```js
// Al abrir el panel (renderDayClassesPanel) — idempotente en cada refresco de datos
lockBackgroundScroll('day-view');
// Al cerrar (closeDayViewToMonth) — scrollToMonthSection recoloca justo después
unlockBackgroundScroll('day-view');
```
- Código: [app.js](../app.js) → `renderDayClassesPanel`, `closeDayViewToMonth`.
- **Anidamiento resuelto:** desde la vista de día se puede abrir un modal (editar clase).
  Entonces hay dos propietarios en el `Set` (`'day-view'` + el `modalId`); cerrar el modal
  **no** libera el fondo porque `'day-view'` sigue activo. Antes esto funcionaba "de
  casualidad" con dos clases que hacían lo mismo; ahora es correcto por diseño.
- **Detalle vista de día:** al cerrar, `unlockBackgroundScroll` restaura el `scrollY`
  guardado y acto seguido `scrollToMonthSection` recoloca la página en el mes del día que
  veías — la recolocación explícita manda sobre la posición restaurada.

> **Histórico:** antes había dos clases separadas (`body.modal-open` global y
> `body.day-view-open` en el `@media` móvil), ambas con `overflow:hidden`. Se unificaron en
> `body.scroll-locked` (§1a) con la técnica `position:fixed` para arreglar el scroll táctil
> del fondo en iOS y manejar el anidamiento con un contador de propietarios.

---

## Resumen para replicar en otro caso

| Necesito… | Patrón | Pieza reutilizable |
|---|---|---|
| Bloquear el fondo (modal o panel) sin fallos en iOS | §1 | `lock/unlockBackgroundScroll(owner)` + `body.scroll-locked` (position:fixed) |
| Que un modal no arrastre el fondo | §1 | lo anterior + `overscroll-behavior:contain` + centralizar el cierre |
| Cerrar un panel arrastrándolo | §2 | `setupSheetDragDismiss` (decidir de quién es el gesto por `scrollTop`) |
| Agrandar un panel tirando de la barra (detents) | §2b | `.sheet-expandable` + `setupExpandableSheet` (redimensiona `height`) |
| Aspecto de sheet iOS | §3 | anclar abajo, `100dvh`, `safe-area`, asa `::before`, curva iOS |
| Gesto de pellizco por niveles | §4 | `setupPinchGesture(el, handlers)` |
| Congelar scroll en un gesto (iOS) | §4b | candado que revierte posición + ventana de inercia 250 ms |
| Lista infinita con tacto nativo | §5 | scroll de página + virtualización por posición + histéresis + rebase en calma |
| Cambio de vista con continuidad | §6 | `withViewTransition` |

**Principio transversal:** los reajustes de layout y los bloqueos se hacen **al empezar
o al terminar** el gesto, nunca en mitad del movimiento — ahí está el secreto de que
"se sienta" como iOS.
