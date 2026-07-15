// POST /api/checkout/create  { requestId, monitorId }
//
// Lo llama el monitor al pulsar "Aceptar" en el modal de Solicitudes. Genera la
// sesión de Stripe Checkout y deja la solicitud en 'aceptada_pendiente_pago'
// (la plaza queda RETENIDA, pero el alumno todavía NO entra en la clase).
//
// Toda la validación se rehace aquí: el cliente no es fuente de verdad.

import { selectOne, patch, notify, rpc } from '../../_shared/supabase.js';
import { createCheckoutSession } from '../../_shared/stripe.js';
import {
    classStartMs, paymentDeadlineMs,
    SAFETY_MARGIN_MS, STRIPE_MIN_WINDOW_MS,
} from '../../_shared/time.js';

// Antelación mínima para poder cobrar: 30 min de margen antes de la clase
// + los 30 min mínimos que Stripe exige que viva una sesión de Checkout.
const MIN_LEAD_MS = SAFETY_MARGIN_MS + STRIPE_MIN_WINDOW_MS; // 60 min

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

// Rechaza la solicitud dejando constancia del motivo (el alumno lo ve en su panel).
async function rejectRequest(env, request, reason) {
    await patch(env, 'class_requests', `id=eq.${request.id}`, {
        status: 'rechazada',
        reason,
        resolved_at: new Date().toISOString(),
    });
    await notify(env, {
        recipientId: request.student_id,
        recipientRole: 'usuario',
        type: 'solicitud_rechazada',
        requestId: request.id,
        classId: request.class_id,
        message: reason,
    });
}

export async function onRequestPost({ request, env }) {
    let body;
    try {
        body = await request.json();
    } catch (e) {
        return json({ error: 'Cuerpo de la petición no válido' }, 400);
    }

    const { requestId, monitorId } = body || {};
    if (!requestId) return json({ error: 'Falta requestId' }, 400);

    try {
        const solicitud = await selectOne(env, 'class_requests',
            `id=eq.${encodeURIComponent(requestId)}&select=*`);

        if (!solicitud) return json({ error: 'La solicitud no existe' }, 404);

        // Si ya tiene sesión activa, devolvemos la misma en vez de crear otra
        // (doble clic del monitor, reintento tras un error de red...).
        if (solicitud.status === 'aceptada_pendiente_pago' && solicitud.checkout_url) {
            return json({
                checkoutUrl: solicitud.checkout_url,
                expiresAt: solicitud.payment_expires_at,
                price: solicitud.price,
                reused: true,
            });
        }
        if (solicitud.status !== 'pendiente') {
            return json({ error: 'La solicitud ya está resuelta' }, 409);
        }
        // El monitor que acepta debe ser el responsable de la solicitud.
        if (monitorId && solicitud.monitor_id && solicitud.monitor_id !== monitorId) {
            return json({ error: 'Esta solicitud no es tuya' }, 403);
        }

        const cls = await selectOne(env, 'classes',
            `id=eq.${encodeURIComponent(solicitud.class_id)}&select=*`);
        if (!cls) return json({ error: 'La clase ya no existe' }, 404);

        // 1) Margen suficiente para procesar el pago.
        const now = Date.now();
        const startMs = classStartMs(cls);
        if (!Number.isFinite(startMs) || startMs - now < MIN_LEAD_MS) {
            await rejectRequest(env, solicitud, 'sin margen para procesar el pago');
            return json({ error: 'No queda margen suficiente para cobrar la clase (mínimo 1 hora antes).' }, 422);
        }

        // 2) Precio válido (antes de reservar la plaza).
        const price = Number(cls.precio);
        if (!Number.isFinite(price) || price <= 0) {
            return json({ error: 'La clase no tiene un precio válido.' }, 422);
        }

        // 3) Plazo dinámico: min(2h, tiempo hasta la clase - 30 min de margen).
        //    Ese mismo plazo ES la expiración de la sesión de Stripe (expires_at),
        //    así que es Stripe quien caduca el pago; no hace falta temporizador aparte.
        const expiresAtMs = paymentDeadlineMs(startMs, now);
        const expiresAtIso = new Date(expiresAtMs).toISOString();

        // 4) RESERVA ATÓMICA de la plaza (cierra la condición de carrera).
        //    reserve_class_spot bloquea la fila de la clase y solo marca el hold si
        //    hay hueco de verdad. Dos aceptaciones simultáneas NO pueden sobrepasar
        //    el aforo: la segunda recibe 'full'.
        const reservation = await rpc(env, 'reserve_class_spot', {
            p_request_id: solicitud.id,
            p_expires_at: expiresAtIso,
        });
        // PostgREST devuelve el escalar de la función (string) directamente.
        const outcome = Array.isArray(reservation) ? reservation[0] : reservation;

        if (outcome === 'gone') {
            return json({ error: 'La solicitud ya está resuelta' }, 409);
        }
        if (outcome === 'full') {
            // El "segundo que llega": la plaza ya se la llevó otra solicitud.
            await rejectRequest(env, solicitud, 'plaza ya cubierta');
            return json({ error: 'La plaza ya ha sido cubierta.' }, 409);
        }
        // outcome === 'ok' → la plaza está retenida (status=aceptada_pendiente_pago).

        const student = await selectOne(env, 'students',
            `id=eq.${encodeURIComponent(solicitud.student_id)}&select=id,name,email`);

        const origin = env.APP_BASE_URL || new URL(request.url).origin;
        const fechaDia = cls.start_at ? String(cls.start_at).substring(0, 10) : String(cls.date).substring(0, 10);
        const fechaLabel = `${fechaDia} ${String(cls.start_time).substring(0, 5)}`;

        // 5) Crear la sesión de Stripe. Si falla, hay que LIBERAR la plaza que la
        //    reserva atómica ya retuvo (si no, quedaría bloqueada sin link de pago).
        let session;
        try {
            session = await createCheckoutSession(env, {
                mode: 'payment',
                expires_at: Math.floor(expiresAtMs / 1000),
                client_reference_id: solicitud.id,
                customer_email: student?.email || undefined,
                line_items: [{
                    quantity: 1,
                    price_data: {
                        currency: 'eur',
                        unit_amount: Math.round(price * 100), // Stripe cobra en céntimos
                        product_data: { name: `Clase de pádel · ${fechaLabel}` },
                    },
                }],
                metadata: {
                    request_id: solicitud.id,
                    class_id: solicitud.class_id,
                    student_id: solicitud.student_id,
                },
                success_url: `${origin}/?pago=ok&request=${solicitud.id}`,
                cancel_url: `${origin}/?pago=cancelado&request=${solicitud.id}`,
            });
        } catch (stripeErr) {
            // Revertir el hold: la solicitud vuelve a estar pendiente y la plaza libre.
            await patch(env, 'class_requests', `id=eq.${solicitud.id}`, {
                status: 'pendiente',
                payment_expires_at: null,
            });
            throw stripeErr;
        }

        // 6) Guardar los datos de la sesión (el estado y el plazo ya los puso la RPC).
        await patch(env, 'class_requests', `id=eq.${solicitud.id}`, {
            price,
            stripe_session_id: session.id,
            checkout_url: session.url,
        });

        // 7) Aviso al alumno con el link de pago (le llega por Realtime al instante).
        await notify(env, {
            recipientId: solicitud.student_id,
            recipientRole: 'usuario',
            type: 'pago_pendiente',
            requestId: solicitud.id,
            classId: solicitud.class_id,
            message: `Tu solicitud ha sido aceptada. Paga ${price.toFixed(2)} € para confirmar tu plaza.`,
        });

        return json({
            checkoutUrl: session.url,
            expiresAt: new Date(expiresAtMs).toISOString(),
            price,
        });
    } catch (error) {
        console.error('Error creando la sesión de pago:', error);
        return json({ error: 'No se pudo generar el link de pago' }, 500);
    }
}
