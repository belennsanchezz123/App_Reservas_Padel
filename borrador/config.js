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
    url: 'https://jfpitfzaluyppxkgmjdt.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmcGl0ZnphbHV5cHB4a2dtamR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODc2OTEsImV4cCI6MjA4NTI2MzY5MX0.fD1g51KL2YbSm3Dy4hbH_TPWmqb9dBN2WX5_lBcEH58'
};

// Verificar que la biblioteca de Supabase esté cargada
if (typeof window.supabase === 'undefined') {
    console.error('❌ ERROR: Supabase library not loaded from CDN!');
    console.error('Make sure index.html includes the Supabase CDN script.');
} else {
    console.log('✅ Supabase library loaded from CDN');
}

// Inicializar cliente de Supabase GLOBALMENTE
// Esta variable debe ser accesible desde db.js y app.js
var supabase = null;

try {
    if (typeof window.supabase !== 'undefined') {
        supabase = window.supabase.createClient(
            SUPABASE_CONFIG.url,
            SUPABASE_CONFIG.anonKey
        );
        console.log('✅ Supabase client initialized successfully');
        console.log('   URL:', SUPABASE_CONFIG.url);
    }
} catch (error) {
    console.error('❌ Error initializing Supabase client:', error);
}
