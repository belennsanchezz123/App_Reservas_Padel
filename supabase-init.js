// Simplified Supabase initialization
// This file uses a bundler-free approach with window.supabase

console.log('🔵 Loading Supabase initialization...');

// Configuration
const SUPABASE_URL = 'https://jfpitfzaluyppxkgmjdt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmcGl0ZnphbHV5cHB4a2dtamR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODc2OTEsImV4cCI6MjA4NTI2MzY5MX0.fD1g51KL2YbSm3Dy4hbH_TPWmqb9dBN2WX5_lBcEH58';

// Initialize Supabase client
var supabase;

// Wait for Supabase library to be available
(function initializeSupabase() {
    console.log('🔍 Checking for Supabase library...');
    console.log('window.supabase:', typeof window.supabase);

    if (typeof window.supabase !== 'undefined' && window.supabase !== null) {
        console.log('✅ Supabase library found!');
        console.log('window.supabase.createClient:', typeof window.supabase.createClient);

        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase client initialized successfully!');
            console.log('Supabase client:', supabase);

            // Make it globally available
            window.supabaseClient = supabase;
        } catch (error) {
            console.error('❌ Error creating Supabase client:', error);
            supabase = null;
        }
    } else {
        console.error('❌ Supabase library not available');
        console.error('window.supabase is:', window.supabase);
        supabase = null;
    }
})();
