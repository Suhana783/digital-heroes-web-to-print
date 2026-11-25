export async function requireAdmin(request, response, next) {
  if (!request.user?.id || !request.userSupabase) {
    return response.status(401).json({ success: false, message: 'Sign in to access this admin resource' });
  }

  try {
    const { data, error } = await request.userSupabase.from('user_roles')
      .select('role')
      .eq('user_id', request.user.id)
      .maybeSingle();
    if (error) {
      const failure = new Error('Admin authorization is temporarily unavailable');
      failure.statusCode = 503;
      failure.cause = error;
      throw failure;
    }
    if (data?.role !== 'admin') {
      return response.status(403).json({ success: false, message: 'Admin access is required' });
    }

    request.user.role = 'admin';
    next();
  } catch (error) {
    next(error);
  }
}
