// ==========================================
// SUPABASE CONFIGURATION
// ==========================================

// INSTRUCCIONES:
// 1. Ve a tu proyecto en supabase.com
// 2. En Settings > API, copia:
//    - Project URL
//    - anon/public key
// 3. Reemplaza los valores abajo

const SUPABASE_CONFIG = {
    url: 'TU_SUPABASE_URL',  // Ejemplo: https://abcdefgh.supabase.co
    anonKey: 'TU_SUPABASE_ANON_KEY'  // La clave pública (anon key)
};

// Inicializar cliente de Supabase
// Usaremos el CDN de Supabase que se carga en index.html
let supabase = null;

function initSupabase() {
    if (typeof window.supabase === 'undefined') {
        console.error('Supabase library not loaded. Make sure to include the CDN script in index.html');
        return null;
    }

    try {
        supabase = window.supabase.createClient(
            SUPABASE_CONFIG.url,
            SUPABASE_CONFIG.anonKey
        );
        console.log('✅ Supabase client initialized successfully');
        return supabase;
    } catch (error) {
        console.error('❌ Error initializing Supabase:', error);
        return null;
    }
}

// Auto-inicializar cuando se carga el script
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        initSupabase();
    });
}
