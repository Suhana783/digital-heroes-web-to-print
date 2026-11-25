import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

let supabaseClient;
let serviceRoleClient;

function getSupabaseCredentials() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const placeholderValues = ['https://your-project.supabase.co', 'your_anon_key'];

  if (!url || !anonKey || placeholderValues.includes(url) || placeholderValues.includes(anonKey)) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in server/.env using your project URL and anon key.',
    );
  }

  return { url, anonKey };
}

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const { url, anonKey } = getSupabaseCredentials();
  supabaseClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket },
  });

  return supabaseClient;
}

export function createUserSupabaseClient(accessToken) {
  const { url, anonKey } = getSupabaseCredentials();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    realtime: { transport: WebSocket },
  });
}

export function getServiceRoleSupabaseClient() {
  if (serviceRoleClient) return serviceRoleClient;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || serviceRoleKey === 'your_service_role_key') {
    const error = new Error('Server-side Supabase operations are not configured');
    error.statusCode = 503;
    throw error;
  }
  serviceRoleClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: WebSocket },
  });
  return serviceRoleClient;
}
