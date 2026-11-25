import { createClient } from '@supabase/supabase-js';

let supabaseClient;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || url.includes('your-project') || anonKey === 'your_anon_key') {
    throw new Error('Supabase Auth is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env.');
  }

  supabaseClient = createClient(url, anonKey);
  return supabaseClient;
}

export function isSupabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    && !import.meta.env.VITE_SUPABASE_URL.includes('your-project')
    && import.meta.env.VITE_SUPABASE_ANON_KEY !== 'your_anon_key');
}
