// GET /api/checkout/status?requestId=...
//
// Red de seguridad para la vuelta del alumno desde Stripe (?pago=ok): el webhook
// puede tardar unos segundos, y sin esto el alumno vería su plaza aún "pendiente
// de pago" justo después de pagar.
//
// Pregunta a Stripe el estado real de la sesión y aplica la MISMA lógica que el
// webhook. Al ser idempotente, da igual cuál de los dos llegue primero.

import { selectOne } from '../../_shared/supabase.js';
import { retrieveCheckoutSession } from '../../_shared/stripe.js';
import { confirmPayment, cancelForNonPayment } from '../../_shared/fulfillment.js';

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

export async function onRequestGet({ request, env }) {
    const requestId = new URL(request.url).searchParams.get('requestId');
    if (!requestId) return json({ error: 'Falta requestId' }, 400);

    try {
        const solicitud = await selectOne(env, 'class_requests',
            `id=eq.${encodeURIComponent(requestId)}&select=id,status,stripe_session_id`);

        if (!solicitud) return json({ error: 'La solicitud no existe' }, 404);
        // Ya resuelta (el webhook llegó antes): nada que hacer.
        if (solicitud.status !== 'aceptada_pendiente_pago') {
            return json({ status: solicitud.status });
        }
        if (!solicitud.stripe_session_id) return json({ status: solicitud.status });

        const session = await retrieveCheckoutSession(env, solicitud.stripe_session_id);

        if (session.payment_status === 'paid') {
            await confirmPayment(env, session);
            return json({ status: 'confirmada_pagada' });
        }
        if (session.status === 'expired') {
            await cancelForNonPayment(env, session, 'pago no completado a tiempo');
            return json({ status: 'cancelada_por_impago' });
        }

        // Sesión aún abierta: el alumno canceló o cerró sin pagar. Su plaza sigue
        // retenida y puede reintentar con el mismo link hasta que expire.
        return json({ status: 'aceptada_pendiente_pago' });
    } catch (error) {
        console.error('Error consultando el estado del pago:', error);
        return json({ error: 'No se pudo consultar el estado del pago' }, 500);
    }
}
