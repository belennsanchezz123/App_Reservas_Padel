// Autenticación de los endpoints de /api con el JWT de Supabase.
//
// Hasta ahora los endpoints se fiaban del studentId/monitorId que mandaba el
// navegador: cualquiera, SIN login, podía dar de baja a un alumno o aceptar una
// solicitud. Ahora el cliente manda su token de sesión en la cabecera
// `Authorization: Bearer <jwt>` y aquí se valida contra Supabase Auth
// (GET /auth/v1/user). La identidad (alumno o personal) se deriva SIEMPRE del
// token; los ids que vengan en el body son informativos y no se confía en ellos.
//
// Se valida llamando a Supabase en vez de verificar la firma localmente para no
// depender del JWT secret (que Supabase está migrando a claves asimétricas) y
// para respetar revocaciones de sesión. Coste: una llamada extra (~50 ms) por
// petición, irrelevante en estos endpoints de baja frecuencia.

import { selectOne } from './supabase.js';

// Devuelve el usuario de Supabase Auth ({ id, email, ... }) o null si el token
// falta, es inválido o la sesión fue revocada.
export async function getAuthUser(env, request) {
    const header = request.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) return null;

    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${token}`,
        },
    });
    if (!res.ok) return null;

    const user = await res.json();
    return user && user.id ? user : null;
}

// Fila de `students` del usuario autenticado (o null si no es alumno).
export function getStudentFromAuth(env, authUserId) {
    return selectOne(env, 'students',
        `auth_user_id=eq.${encodeURIComponent(authUserId)}&select=id,name,email`);
}

// Fila de `personal` del usuario autenticado (o null si no es personal).
export function getStaffFromAuth(env, authUserId) {
    return selectOne(env, 'personal',
        `auth_user_id=eq.${encodeURIComponent(authUserId)}&select=id,name,role`);
}
