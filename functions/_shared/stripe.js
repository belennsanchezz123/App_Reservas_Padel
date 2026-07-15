// Cliente mínimo de Stripe sobre fetch + WebCrypto.
// No usamos el SDK de npm: el proyecto es bundler-free y la API REST de Stripe
// es form-encoded, así que basta con fetch. Menos dependencias que mantener.

const STRIPE_API = 'https://api.stripe.com/v1';

// Stripe espera x-www-form-urlencoded con claves anidadas del tipo
// line_items[0][price_data][unit_amount]. Aplanamos el objeto a ese formato.
function toFormBody(params, prefix = '', form = new URLSearchParams()) {
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        const field = prefix ? `${prefix}[${key}]` : key;

        if (Array.isArray(value)) {
            value.forEach((item, i) => {
                if (item !== null && typeof item === 'object') {
                    toFormBody(item, `${field}[${i}]`, form);
                } else {
                    form.append(`${field}[${i}]`, String(item));
                }
            });
        } else if (typeof value === 'object') {
            toFormBody(value, field, form);
        } else {
            form.append(field, String(value));
        }
    }
    return form;
}

export async function stripeFetch(env, path, method = 'GET', params = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    };
    if (params) options.body = toFormBody(params).toString();

    const res = await fetch(`${STRIPE_API}${path}`, options);
    const data = await res.json();
    if (!res.ok) {
        const message = data?.error?.message || `Stripe respondió ${res.status}`;
        throw new Error(`Stripe: ${message}`);
    }
    return data;
}

export function createCheckoutSession(env, params) {
    return stripeFetch(env, '/checkout/sessions', 'POST', params);
}

export function retrieveCheckoutSession(env, sessionId) {
    return stripeFetch(env, `/checkout/sessions/${encodeURIComponent(sessionId)}`, 'GET');
}

// ---- Verificación de la firma del webhook ----
// Stripe firma `${timestamp}.${rawBody}` con HMAC-SHA256 y el whsec_. Hay que
// verificarlo sobre el cuerpo CRUDO (sin parsear), o la firma no cuadra.

const TOLERANCE_SECONDS = 5 * 60; // rechaza eventos reenviados mucho después

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function hmacSha256Hex(secret, payload) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return [...new Uint8Array(signature)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Devuelve el evento parseado, o lanza si la firma no es válida.
export async function constructEvent(rawBody, signatureHeader, secret) {
    if (!signatureHeader) throw new Error('Falta la cabecera Stripe-Signature');

    let timestamp = null;
    const signatures = [];
    for (const part of signatureHeader.split(',')) {
        const [k, v] = part.split('=');
        if (k === 't') timestamp = v;
        if (k === 'v1') signatures.push(v);
    }
    if (!timestamp || signatures.length === 0) throw new Error('Cabecera Stripe-Signature malformada');

    const age = Math.floor(Date.now() / 1000) - Number(timestamp);
    if (!Number.isFinite(age) || Math.abs(age) > TOLERANCE_SECONDS) {
        throw new Error('Timestamp de la firma fuera de tolerancia');
    }

    const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    if (!signatures.some(sig => timingSafeEqual(sig, expected))) {
        throw new Error('Firma del webhook no válida');
    }

    return JSON.parse(rawBody);
}
