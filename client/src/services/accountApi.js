import { apiRequest } from './api.js';
import { getSupabaseClient } from './supabase.js';

export async function accountRequest(path, options = {}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    await supabase.auth.signOut();
    throw new Error('Your session has expired. Please sign in again.');
  }
  try {
    return await apiRequest(path, { ...options, accessToken: data.session.access_token });
  } catch (requestError) {
    if (requestError.status === 401) {
      await supabase.auth.signOut();
      throw new Error('Your session has expired. Please sign in again.');
    }
    throw requestError;
  }
}

export function signUpCustomer({ fullName, email, password }) {
  return getSupabaseClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName.trim() } },
  });
}

export function signInCustomer({ email, password }) {
  return getSupabaseClient().auth.signInWithPassword({ email, password });
}
