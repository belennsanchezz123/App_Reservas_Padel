// POST /api/enrollment/leave  { classId, studentId }
//
// El alumno se da de baja de una clase en la que está inscrito.
// Reglas (decididas con la usuaria):
//  - Solo con >= 24h de antelación. Con menos margen, no se permite.
//  - Si la clase estaba PAGADA, en vez de perder el dinero se le genera una
//    "clase por recuperar" (student_recoveries).
//  - Al liberar la plaza, si la clase estaba llena, se avisa a los alumnos del
//    nivel (notifyFreeSpot) para que la clase reaparezca en sus "Avisos".
//
// Va por el servidor (service_role) porque el alumno no tiene permiso de escritura
// sobre classes / student_recoveries (RLS), y para hacerlo de forma consistente.

import { selectOne, select, patch, insert, notify } from '../../_shared/supabase.js';
import { getOccupancy, notifyFreeSpot } from '../../_shared/fulfillment.js';
import { classStartMs } from '../../_shared/time.js';

const LEAVE_CUTOFF_MS = 24 * 60 * 60 * 1000; // 24h

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return json({ error: 'Cuerpo de la petición no válido' }, 400);
    }

    const { classId, studentId } = body || {};
    if (!classId || !studentId) return json({ error: 'Faltan datos' }, 400);

    try {
        const cls = await selectOne(env, 'classes',
            `id=eq.${encodeURIComponent(classId)}&select=*`);
        if (!cls) return json({ error: 'La clase no existe' }, 404);

        const students = cls.students || [];
        if (!students.includes(studentId)) {
            return json({ error: 'No estás inscrito en esta clase' }, 409);
        }

        // Corte de 24h: sin margen suficiente, no se permite la baja.
        const startMs = classStartMs(cls);
        if (!Number.isFinite(startMs) || startMs - Date.now() < LEAVE_CUTOFF_MS) {
            return json({ error: 'No puedes darte de baja con menos de 24 horas de antelación.' }, 422);
        }

        // ¿La clase estaba llena antes de la baja? (para decidir si avisar plaza libre)
        const wasFull = await getOccupancy(env, cls) >= (cls.max_capacity || 4);

        // 1) Quitar al alumno de la clase (libera la plaza).
        const newStudents = students.filter(id => id !== studentId);
        await patch(env, 'classes', `id=eq.${encodeURIComponent(classId)}`, {
            students: newStudents,
        });

        // 2) ¿Había pagado? -> generar clase por recuperar y cerrar su solicitud.
        const paidReq = await selectOne(env, 'class_requests',
            `class_id=eq.${encodeURIComponent(classId)}` +
            `&student_id=eq.${encodeURIComponent(studentId)}` +
            `&status=eq.confirmada_pagada&select=id`);

        let recovery = false;
        if (paidReq) {
            const originDate = cls.start_at ? String(cls.start_at).substring(0, 10) : cls.date;
            await insert(env, 'student_recoveries', {
                student_id: studentId,
                origin_class_id: classId,
                origin_date: originDate,
                notes: `Baja voluntaria de la clase del ${String(originDate).substring(0, 10)}`,
            });
            await patch(env, 'class_requests', `id=eq.${paidReq.id}`, {
                status: 'cancelada_por_alumno',
                reason: 'baja voluntaria',
                resolved_at: new Date().toISOString(),
            });
            recovery = true;
        }

        // 3) Avisar al monitor (para que su calendario se refresque sin recargar).
        //    Al alumno NO le mandamos notificación: el cliente que inició la baja
        //    ya le muestra el resultado y refresca su panel.
        if (cls.monitor_id) {
            await notify(env, {
                recipientId: cls.monitor_id,
                recipientRole: 'monitor',
                type: 'solicitud_rechazada', // el panel del monitor lo trata como "baja de un alumno"
                classId,
                message: 'Un alumno se ha dado de baja de una de tus clases.',
            });
        }

        // 4) Si la clase estaba llena, avisar a los alumnos del nivel de la plaza libre
        //    (excluyendo al que se acaba de ir). Pasamos la clase YA con la plaza liberada.
        if (wasFull) {
            await notifyFreeSpot(env, { ...cls, students: newStudents }, studentId);
        }

        return json({ ok: true, recovery });
    } catch (error) {
        console.error('Error en la baja de la clase:', error);
        return json({ error: 'No se pudo procesar la baja' }, 500);
    }
}
