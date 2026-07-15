// Resultado del pago: confirmar la plaza o liberarla.
//
// Estas dos funciones son IDEMPOTENTES a propósito: las llaman tanto el webhook
// de Stripe (fuente de verdad) como /api/checkout/status (cuando el alumno
// vuelve a la app antes de que llegue el webhook). Da igual quién llegue primero
// ni cuántas veces se reintente: el alumno no se duplica en la clase.

import { selectOne, select, patch, insert, notify } from './supabase.js';
import { eligibleStudentsForFreeSpot } from './eligibility.js';

const REQUEST_FIELDS = 'id,class_id,student_id,monitor_id,status,price,stripe_session_id,payment_expires_at';

export function findRequestBySession(env, sessionId) {
    return selectOne(env, 'class_requests',
        `stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=${REQUEST_FIELDS}`);
}

// Ocupación real de una clase = alumnos confirmados + plazas retenidas por
// solicitudes con el pago en curso (hold vivo). Una solicitud cuyo plazo ya
// venció no retiene nada: la plaza vuelve a estar libre aunque el webhook de
// expiración todavía no haya llegado.
export async function getOccupancy(env, cls, ignoreRequestId = null) {
    const holds = await select(env, 'class_requests',
        `class_id=eq.${encodeURIComponent(cls.id)}` +
        `&status=eq.aceptada_pendiente_pago` +
        `&payment_expires_at=gt.${new Date().toISOString()}` +
        `&select=id`);

    const active = (holds || []).filter(h => h.id !== ignoreRequestId);
    return (cls.students || []).length + active.length;
}

// Pago confirmado -> el alumno entra en la clase de forma definitiva.
export async function confirmPayment(env, session) {
    const request = await findRequestBySession(env, session.id);
    if (!request) {
        console.warn(`Sesión ${session.id} sin solicitud asociada`);
        return { handled: false };
    }
    // Ya confirmada por el otro camino (webhook o vuelta del alumno): no repetir.
    if (request.status === 'confirmada_pagada') return { handled: true, alreadyDone: true };

    const cls = await selectOne(env, 'classes',
        `id=eq.${encodeURIComponent(request.class_id)}&select=id,students,max_capacity,monitor_id,date,start_time`);

    if (cls) {
        const students = cls.students || [];
        // La plaza estaba retenida para él, así que aquí solo puede faltar por
        // añadir. El includes() evita duplicarlo si el webhook se reintenta.
        if (!students.includes(request.student_id)) {
            await patch(env, 'classes', `id=eq.${encodeURIComponent(cls.id)}`, {
                students: [...students, request.student_id],
            });
        }
    }

    await patch(env, 'class_requests', `id=eq.${request.id}`, {
        status: 'confirmada_pagada',
        reason: null,
        paid_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
    });

    await notify(env, {
        recipientId: request.student_id,
        recipientRole: 'usuario',
        type: 'pago_confirmado',
        requestId: request.id,
        classId: request.class_id,
        message: 'Pago recibido. Tu plaza en la clase está confirmada 🎾',
    });
    await notify(env, {
        recipientId: request.monitor_id,
        recipientRole: 'monitor',
        type: 'solicitud_aceptada',
        requestId: request.id,
        classId: request.class_id,
        message: 'Un alumno ha pagado y ya tiene la plaza confirmada',
    });

    // Si la clase se ha llenado, el resto de solicitudes pendientes ya no caben.
    if (cls) {
        const occupancy = await getOccupancy(env, {
            ...cls,
            students: [...(cls.students || []), request.student_id],
        });
        if (occupancy >= (cls.max_capacity || 4)) {
            await autoRejectRemaining(env, cls.id);
        }
    }

    return { handled: true };
}

// Pago no completado (expirado o fallido) -> se libera la plaza retenida.
// No hay que tocar classes.students: el alumno nunca llegó a entrar.
export async function cancelForNonPayment(env, session, reason = 'pago no completado') {
    const request = await findRequestBySession(env, session.id);
    if (!request) return { handled: false };
    if (request.status !== 'aceptada_pendiente_pago') return { handled: true, alreadyDone: true };

    await patch(env, 'class_requests', `id=eq.${request.id}`, {
        status: 'cancelada_por_impago',
        reason,
        resolved_at: new Date().toISOString(),
    });

    await notify(env, {
        recipientId: request.student_id,
        recipientRole: 'usuario',
        type: 'pago_expirado',
        requestId: request.id,
        classId: request.class_id,
        message: 'No se completó el pago a tiempo, así que tu plaza se ha liberado. Puedes volver a solicitar una clase.',
    });

    return { handled: true };
}

// Equivalente en servidor de autoRejectRemainingRequests() (app.js).
// Al llenarse la clase, las solicitudes que se quedan sin plaza reciben el mismo
// aviso "plaza ya cubierta" que el segundo alumno en la condición de carrera.
async function autoRejectRemaining(env, classId) {
    const pending = await select(env, 'class_requests',
        `class_id=eq.${encodeURIComponent(classId)}&status=eq.pendiente&select=id,student_id`);

    for (const r of pending || []) {
        await patch(env, 'class_requests', `id=eq.${r.id}`, {
            status: 'rechazada',
            reason: 'plaza ya cubierta',
            resolved_at: new Date().toISOString(),
        });
        await notify(env, {
            recipientId: r.student_id,
            recipientRole: 'usuario',
            type: 'solicitud_rechazada',
            requestId: r.id,
            classId,
            message: 'La plaza ya ha sido cubierta',
        });
    }
}

// Aviso de "plaza libre": una plaza se ha liberado en una clase que estaba llena.
// Notifica a los alumnos del nivel para que la clase reaparezca en sus "Avisos".
// `cls` debe reflejar YA el estado con la plaza liberada (students sin el que se fue).
export async function notifyFreeSpot(env, cls, excludeStudentId = null) {
    try {
        const studentIds = await eligibleStudentsForFreeSpot(env, cls, excludeStudentId);
        if (studentIds.length === 0) return;

        const dateStr = cls.start_at ? String(cls.start_at).substring(0, 10) : cls.date;
        const rows = studentIds.map(id => ({
            recipient_id: id,
            recipient_role: 'usuario',
            type: 'plaza_libre',
            request_id: null,
            class_id: cls.id,
            message: `Se ha liberado una plaza en una clase de tu nivel (${String(dateStr).substring(0, 10)} ${String(cls.start_time).substring(0, 5)})`,
        }));
        // Inserción en lote (un solo POST a PostgREST).
        await insert(env, 'notifications', rows);
    } catch (err) {
        console.warn('No se pudo avisar de la plaza libre:', err.message);
    }
}
