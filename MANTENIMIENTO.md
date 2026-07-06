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
