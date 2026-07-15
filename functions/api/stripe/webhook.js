// POST /api/stripe/webhook  — Stripe nos avisa del resultado del pago.
//
// ESTA es la fuente de verdad del cobro, no la redirección del navegador: si el
// alumno paga y cierra la pestaña sin volver a la app, la plaza se confirma
// igualmente porque este webhook llega de todas formas.
//
// Stripe reintenta los eventos que no responden 200, y puede enviar el mismo
// evento más de una vez. confirmPayment/cancelForNonPayment son idempotentes,
// así que reprocesar un evento no duplica al alumno ni revierte nada.

import { constructEvent } from '../../_shared/stripe.js';
import { confirmPayment, cancelForNonPayment } from '../../_shared/fulfillment.js';

export async function onRequestPost({ request, env }) {
    // El cuerpo CRUDO, sin parsear: la firma se calcula sobre estos bytes exactos.
    const rawBody = await request.text();
    const signature = request.headers.get('Stripe-Signature');

    let event;
    try {
        event = await constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
        console.error('Webhook rechazado:', error.message);
        return new Response(`Webhook Error: ${error.message}`, { status: 400 });
    }

    const session = event.data?.object;

    try {
        switch (event.type) {
            // Pago completado -> plaza confirmada y alumno dentro de la clase.
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                if (session?.payment_status === 'paid') {
                    await confirmPayment(env, session);
                } else {
                    // Métodos de pago diferidos: aún no está cobrado, esperamos al
                    // async_payment_succeeded / async_payment_failed.
                    console.log(`Sesión ${session?.id} completada pero sin pagar (${session?.payment_status})`);
                }
                break;

            // El plazo de pago venció -> se libera la plaza retenida.
            case 'checkout.session.expired':
                await cancelForNonPayment(env, session, 'pago no completado a tiempo');
                break;

            case 'checkout.session.async_payment_failed':
                await cancelForNonPayment(env, session, 'el pago fue rechazado');
                break;

            default:
                break; // el resto de eventos no nos afectan
        }
    } catch (error) {
        // 500 -> Stripe reintentará más tarde, que es lo que queremos si Supabase falló.
        console.error(`Error procesando ${event.type}:`, error);
        return new Response('Error procesando el evento', { status: 500 });
    }

    return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
