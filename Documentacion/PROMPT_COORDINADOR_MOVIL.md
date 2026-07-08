# PROMPT — Llevar la UX móvil del coordinador al nivel de la del monitor

Eres un diseñador UI/UX y desarrollador frontend experto trabajando sobre
**PadelPro Manager** (App_Reservas_Padel). La vista de MONITOR en móvil ya fue
rediseñada por completo con una navegación estilo calendario de iOS/iCloud, y
está terminada y aprobada. Tu tarea es auditar y mejorar el **apartado de
COORDINADOR (y el panel de Recepción)** en móvil aplicando LOS MISMOS patrones,
**reutilizando la infraestructura ya construida — nunca reimplementándola**.

## Contexto del proyecto (respetar siempre)

- App estática sin bundler ni framework: HTML + CSS + JS vanilla (index.html,
  app.js, styles.css, db.js, tournaments.js). Leer CLAUDE.md y MANTENIMIENTO.md.
- Estado global en `window.appState`; no crear estados locales duplicados.
- `db.js` es el único punto de conversión camelCase ↔ snake_case (Supabase).
- Orden de carga estricto: supabase-init.js → db.js → app.js → tournaments.js.
- Máximo 4 alumnos por clase; la regla debe seguir visible en móvil.
- Roles: coordinador (ve todos los monitores), monitor (solo lo suyo),
  recepción (pestañas Pagos/Caja/Partidos/Categorías/Torneos).
- Tras cada cambio: subir la versión `?v=N` de los archivos tocados en
  index.html y verificar sintaxis con `node --check app.js`.
- Servidor de pruebas: `python serve.py` (envía no-cache; NO usar
  `python -m http.server`). Prueba real en iPhone vía túnel de Cloudflare:
  `cloudflared tunnel --url http://localhost:8000`.

## Infraestructura móvil YA EXISTENTE (reutilizar por nombre)

Todo esto vive en app.js/styles.css y funciona en producción para el monitor:

- **Detección móvil**: `isMobileLayout()` — táctil sin ratón (hover:none +
  pointer:coarse, ≤950px) o ancho ≤768px. Los bloques CSS móviles usan la
  media query equivalente: `@media (max-width: 768px), ((hover: none) and
  (pointer: coarse) and (max-width: 950px))`.
- **Eje temporal único**: `setAnchorDate(date)` / `getAnchorDate()` — única vía
  para escribir fechas (deriva `selectedDayDate`, `currentWeekStart`,
  `currentMonthDate`). PROHIBIDO escribir esas tres a mano.
- **Eje jerárquico móvil**: `mobileViewLevel` ('month'|'day'),
  `openDayView(date)`, `closeDayViewToMonth()`, `navigateDay(delta)`.
- **Calendario mensual virtualizado** (estilo UICollectionView): lienzo de
  posiciones absolutas, `updateVirtualMonths()`, `buildMonthSection()`,
  `scrollToMonthSection(date, smooth)`, rebases de margen superior. El scroll
  de meses ES el scroll de la página (una sola superficie). NO tocar su
  mecánica interna; si el coordinador necesita el calendario mensual, ya lo
  tiene gratis (funciona con `appState.viewingMonitorId` para filtrar por
  monitor — ver `rebuildMonthClassesIndex`).
- **Gestos**: `setupPinchGesture(el, {lockPage?, onZoomIn, onZoomOut,
  onGestureEnd})` (pellizco; los cambios se ENCOLAN y se aplican al soltar los
  dedos), `setupDaySwipe(el)` (swipe horizontal día↔día), long-press 350ms
  para arrastrar clases (en `createClassCard`), long-press 450ms en hueco
  libre para crear a la hora exacta.
- **Transiciones**: `withViewTransition(fn)` (View Transitions API con
  fallback); geometría compartida vía `view-transition-name: day-zoom`.
- **Sheets móviles**: todos los `.modal` suben desde abajo con asa y se
  cierran arrastrando (`setupSheetDragDismiss()`, ya aplicado globalmente).
  Para sheets con lista interna scrolleable, seguir el patrón de
  `.students-sheet` (columna flex: cabecera fija + lista `flex:1; min-height:0;
  overflow-y:auto`) y registrar la lista en el selector de listas internas de
  `setupSheetDragDismiss` para que el gesto de cierre le ceda el paso.
- **Barra superior fija del mes**: `.month-scroll-toolbar` con
  [Hoy] [🔍] [👥] [🏠] (se crea en `renderMonthCalendar`).
- **Vista de día**: barra `[‹ Mes] … [+]`, rejilla 07:00–23:00 con scroll
  interno, tap en hueco crea clase, botones ‹ › y swipe para cambiar de día.

## Lecciones aprendidas (errores que NO debes repetir)

1. **Nunca mutar el DOM bajo un gesto táctil activo**: si el elemento tocado
   desaparece, iOS deja de enviar touchend y el estado queda colgado. Encolar
   y aplicar en `onGestureEnd`.
2. **Nunca hacer `scrollTo` programático durante el momentum**: mata la
   inercia en iOS. Solo con el scroll en reposo.
3. **Evitar dos superficies de scroll anidadas** (contenedor con overflow +
   página): compiten y el gesto se "escapa". Una sola superficie.
4. **No usar `dvh` en alturas que alimenten posiciones cacheadas**: la barra
   de Safari cambia el viewport en pleno scroll. Congelar en px al construir.
5. **El evento resize en iOS salta al ocultarse la barra de Safari**: solo
   tratar como rotación si cambió el ANCHO (`_lastViewportWidth`).
6. **`user-select: none` + `-webkit-touch-callout: none`** en superficies con
   long-press propio, o iOS dispara su selección de texto azul.
7. **Grid de 7 columnas**: usar `minmax(0, 1fr)` + `min-width:0` +
   `overflow:hidden` en celdas, o un texto largo ensancha su columna.
8. **Targets táctiles ≥44px**, sin depender de hover; feedback con `:active`.
9. **Cuidado con reglas CSS heredadas**: p.ej. `.quick-actions .btn
   {width:100%}` rompió un botón de un modal anidado dentro. Ante un layout
   roto, buscar la regla ancestra que se cuela.

## Tu tarea — FASE 1: Diagnóstico (preséntala antes de tocar código)

Audita EN MÓVIL (DevTools responsive y mentalidad táctil) las pantallas del
coordinador/recepción:

1. **Panel de coordinador**: cabecera, tarjetas de monitor (avatar, métricas,
   "Ver detalles" con tabla anual), navegación al calendario de un monitor
   (píldora "‹ Panel") y vuelta.
2. **Recepción — Pagos**: buscador + rejilla de tarjetas de alumno, ficha de
   alumno con pagos (`#studentProfileModal`), alta de pagos.
3. **Recepción — Caja**: toolbar de fechas/filtros, resumen, arqueo, lista.
4. **Recepción — Partidos**: lista de tarjetas de partido, modal de crear
   partido, calendario por pistas (`.matches-calendar`, `.cal-block` — usa
   `touch-action:none` y drag por pointer events: evaluar si en móvil debe
   sustituirse por tap-para-editar como se hizo con las clases).
5. **Recepción — Categorías y Torneos** (tournaments.js): listados, detalle
   de torneo, cuadro (`.t-bracket` con scroll horizontal).

Para cada pantalla identifica: zonas táctiles pequeñas, overflow horizontal,
dependencias de hover, modales que no siguen el patrón sheet, listas cuyo
final queda inalcanzable, navegación sin gesto de vuelta, estados vacíos
ausentes, y cualquier scroll anidado conflictivo. Prioriza (alto/medio/bajo)
con archivo y línea.

## Tu tarea — FASE 2: Corrección

Aplica los arreglos priorizados con el MISMO lenguaje de la vista de monitor:

- Navegación entre pantallas tipo pila con píldora "‹ Volver" (patrón
  `.day-back-btn`) y, si aporta, `withViewTransition`.
- Modales largos → patrón `.students-sheet` (cabecera fija + lista flex).
- Toolbars densas (Caja, Partidos) → apilado limpio en móvil, chips
  scrolleables horizontales si no caben (patrón `.recepcion-tabs`).
- Tablas anchas (arqueo, standings, cuadro) → scroll horizontal contenido en
  su propia caja, nunca de la página.
- Acciones principales accesibles con el pulgar (barras fijas si hace falta).
- Sin duplicar estado: todo sobre `appState` y los helpers listados.
- El escritorio NO debe cambiar: todo dentro de los bloques móviles
  existentes o guardado por `isMobileLayout()`.

## Formato de entrega

1. **Diagnóstico** priorizado con archivo/línea.
2. **Cambios aplicados** (qué y por qué, por problema).
3. **Código ya aplicado** al proyecto (no propuestas), con `?v=` subido y
   `node --check` pasado.
4. **Notas de prueba manual** en iPhone (vía túnel) para ambos roles:
   coordinador y recepción, pantalla por pantalla.
