// Elegibilidad por nivel para el aviso de "plaza libre".
//
// Replica en el servidor la regla que el cliente ya usa en findFreeClassesForStudent
// (app.js): un alumno "cuadra" con una clase si su nivel está dentro de ±0,5 del
// nivel MEDIO de los alumnos ya inscritos.

import { select } from './supabase.js';

const LEVEL_TOLERANCE = 0.5;

// Nivel medio de una clase a partir de los niveles de sus alumnos inscritos.
export async function classAvgLevel(env, studentIds) {
    if (!studentIds || studentIds.length === 0) return null;
    const ids = studentIds.map(id => `"${id}"`).join(',');
    const rows = await select(env, 'students', `id=in.(${ids})&select=level`);
    const levels = (rows || [])
        .map(r => (r.level !== null && r.level !== undefined ? Number(r.level) : null))
        .filter(l => l !== null && !Number.isNaN(l));
    if (levels.length === 0) return null;
    return levels.reduce((a, b) => a + b, 0) / levels.length;
}

// Alumnos a los que avisar de que se ha liberado una plaza en `cls`:
// nivel dentro de ±0,5 de la media, activos, NO inscritos ya, SIN una solicitud
// viva (pendiente o con el pago en curso) para esa clase, y distintos de
// `excludeId` (p. ej. el alumno que acaba de irse: no avisarle de "su" plaza).
export async function eligibleStudentsForFreeSpot(env, cls, excludeId = null) {
    const enrolled = cls.students || [];
    const avg = await classAvgLevel(env, enrolled);
    if (avg === null) return []; // sin referencia de nivel, no avisamos a nadie

    // Alumnos activos dentro del rango de nivel.
    const lo = (avg - LEVEL_TOLERANCE).toFixed(2);
    const hi = (avg + LEVEL_TOLERANCE).toFixed(2);
    const candidates = await select(env, 'students',
        `active=eq.true&level=gte.${lo}&level=lte.${hi}&select=id`);

    // Ids con una solicitud viva para esta clase (no volver a avisarles).
    const live = await select(env, 'class_requests',
        `class_id=eq.${encodeURIComponent(cls.id)}` +
        `&status=in.(pendiente,aceptada_pendiente_pago)&select=student_id`);
    const liveIds = new Set((live || []).map(r => r.student_id));
    const enrolledIds = new Set(enrolled);

    return (candidates || [])
        .map(s => s.id)
        .filter(id => id !== excludeId && !enrolledIds.has(id) && !liveIds.has(id));
}
