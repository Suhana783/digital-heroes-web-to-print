export function validateProfileUpdate(request, response, next) {
  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ success: false, message: 'A JSON request body is required' });
  }
  const allowedKeys = new Set(['full_name', 'phone']);
  const keys = Object.keys(body);
  if (!keys.length || keys.some((key) => !allowedKeys.has(key))) {
    return response.status(400).json({ success: false, message: 'Only full_name and phone can be updated' });
  }

  const updates = {};
  if (Object.hasOwn(body, 'full_name')) {
    if (typeof body.full_name !== 'string' || !body.full_name.trim() || body.full_name.trim().length > 120) {
      return response.status(400).json({ success: false, message: 'Full name must be between 1 and 120 characters' });
    }
    updates.full_name = body.full_name.trim();
  }
  if (Object.hasOwn(body, 'phone')) {
    if (body.phone !== null && (typeof body.phone !== 'string' || body.phone.trim().length > 30)) {
      return response.status(400).json({ success: false, message: 'Phone must be 30 characters or fewer' });
    }
    updates.phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;
  }
  request.profileUpdates = updates;
  next();
}
