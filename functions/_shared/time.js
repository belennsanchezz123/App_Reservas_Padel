// Fechas de clase: la app guarda hora de pared (classes.date = YYYY-MM-DD y
// classes.start_time = "HH:MM") sin zona horaria, y el navegador de la escuela
// las interpreta en hora local española. Las Functions corren en UTC, así que
// aquí la conversión Madrid -> UTC es EXPLÍCITA: si no, en verano (CEST) todos
// los plazos saldrían desplazados 2 horas.

export const CLUB_TIMEZONE = 'Europe/Madrid';

export const MINUTE_MS = 60 * 1000;
export const SAFETY_MARGIN_MS = 30 * MINUTE_MS;   // margen antes del inicio de la clase
export const STANDARD_WINDOW_MS = 2 * 60 * MINUTE_MS;  // plazo estándar de pago (tope para clases lejanas)
export const STRIPE_MIN_WINDOW_MS = 30 * MINUTE_MS;    // mínimo que Stripe admite en expires_at

// Desfase de la zona horaria (en ms) en un instante UTC dado.
function timezoneOffsetMs(utcMs, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(utcMs)).reduce((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = Number(p.value);
        return acc;
    }, {});

    const asIfUtc = Date.UTC(
        parts.year, parts.month - 1, parts.day,
        parts.hour % 24, parts.minute, parts.second
    );
    return asIfUtc - utcMs;
}

// Instante UTC (ms) de una hora de pared de Madrid. Doble pasada para clavar los
// días de cambio de hora, donde el desfase de la primera estimación no aplica.
export function madridWallClockToUtcMs(dateStr, timeStr) {
    const [year, month, day] = String(dateStr).substring(0, 10).split('-').map(Number);
    const [hour, minute] = String(timeStr || '00:00').substring(0, 5).split(':').map(Number);
    if (!year || !month || !day || !Number.isFinite(hour)) return NaN;

    const naive = Date.UTC(year, month - 1, day, hour, minute);
    const firstGuess = naive - timezoneOffsetMs(naive, CLUB_TIMEZONE);
    return naive - timezoneOffsetMs(firstGuess, CLUB_TIMEZONE);
}

// Instante de inicio de una clase (fila cruda de Supabase).
// La fecha fiable es la parte de fecha de start_at (día local con el que se creó la
// clase); el campo `date` puede estar un día desfasado si la clase se guardó a
// medianoche local (su representación UTC cae en el día anterior). Ver convertClassFromDB.
export function classStartMs(cls) {
    const dateStr = cls.start_at ? String(cls.start_at).substring(0, 10) : cls.date;
    return madridWallClockToUtcMs(dateStr, cls.start_time);
}

// Plazo de pago dinámico: el mínimo entre el plazo estándar (2h) y el tiempo
// que queda hasta la clase menos el margen de seguridad (30 min).
// El corte de 60 min al solicitar garantiza que nunca baje del mínimo de Stripe,
// pero acotamos igualmente por si una clase se reprograma más cerca.
export function paymentDeadlineMs(classStart, now = Date.now()) {
    const untilClass = classStart - now;
    const dynamic = Math.min(STANDARD_WINDOW_MS, untilClass - SAFETY_MARGIN_MS);
    return now + Math.max(STRIPE_MIN_WINDOW_MS, dynamic);
}
