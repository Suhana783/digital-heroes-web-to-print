const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateDivisionSlug(request, response, next) {
  if (!slugPattern.test(request.params.divisionSlug || '')) {
    return response.status(400).json({ success: false, message: 'A valid division slug is required' });
  }
  next();
}

export function validateProductSlugs(request, response, next) {
  if (!slugPattern.test(request.params.divisionSlug || '') || !slugPattern.test(request.params.productSlug || '')) {
    return response.status(400).json({ success: false, message: 'Valid division and product slugs are required' });
  }
  next();
}
