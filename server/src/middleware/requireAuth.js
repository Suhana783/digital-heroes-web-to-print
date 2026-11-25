import { getSupabaseClient, createUserSupabaseClient } from '../config/supabase.js';

export async function requireAuth(request, response, next) {
  const authorization = request.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    return response.status(401).json({ success: false, message: 'Sign in to access this account resource' });
  }

  try {
    const { data, error } = await getSupabaseClient().auth.getUser(match[1]);
    if (error?.status >= 500) {
      const serviceError = new Error('Authentication verification is temporarily unavailable');
      serviceError.statusCode = 503;
      throw serviceError;
    }
    if (error || !data.user) {
      return response.status(401).json({ success: false, message: 'Your session is invalid or has expired. Please sign in again.' });
    }
    request.user = { id: data.user.id, email: data.user.email };
    request.userSupabase = createUserSupabaseClient(match[1]);
    next();
  } catch (error) {
    next(error);
  }
}
