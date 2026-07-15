// Acceso a Supabase desde las Functions vía PostgREST + fetch.
// Usa la SERVICE_ROLE_KEY (solo servidor, nunca en el navegador): salta RLS y
// permite escribir en classes / class_requests / notifications.

async function request(env, path, options = {}) {
    const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
    return text ? JSON.parse(text) : null;
}

// query: string de PostgREST, ej. "id=eq.123&select=*"
export function select(env, table, query) {
    return request(env, `${table}?${query}`);
}

export async function selectOne(env, table, query) {
    const rows = await select(env, table, `${query}&limit=1`);
    return rows && rows.length ? rows[0] : null;
}

export function insert(env, table, row) {
    return request(env, table, {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(row),
    });
}

export function patch(env, table, query, updates) {
    return request(env, `${table}?${query}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(updates),
    });
}

// Llama a una función de Postgres (RPC) vía PostgREST. Se usa para la reserva
// atómica de plaza (reserve_class_spot), que necesita un lock de fila que REST no da.
export function rpc(env, fn, args) {
    return request(env, `rpc/${fn}`, {
        method: 'POST',
        body: JSON.stringify(args || {}),
    });
}

// Notificación al alumno o al monitor: el canal Realtime al que ya está
// suscrita la app (subscribeToNotifications en app.js) la pinta al instante.
export function notify(env, { recipientId, recipientRole, type, requestId, classId, message }) {
    return insert(env, 'notifications', {
        recipient_id: recipientId,
        recipient_role: recipientRole,
        type,
        request_id: requestId || null,
        class_id: classId || null,
        message: message || null,
    }).catch(err => {
        // Una notificación fallida no debe tumbar el cobro ya realizado.
        console.warn('No se pudo crear la notificación:', err.message);
    });
}
