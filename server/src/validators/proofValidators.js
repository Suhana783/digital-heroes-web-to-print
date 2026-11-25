const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateProofId(request, response, next) {
  if (!UUID.test(request.params.proofId || '')) return response.status(400).json({ success: false, message: 'A valid proof ID is required' });
  next();
}

export function validateOrderItemId(request, response, next) {
  if (!UUID.test(request.params.orderItemId || '')) return response.status(400).json({ success: false, message: 'A valid order item ID is required' });
  next();
}

export function validatePrintFileId(request, response, next) {
  if (!UUID.test(request.params.printFileId || '')) return response.status(400).json({ success: false, message: 'A valid print file ID is required' });
  next();
}

export function validateProofResponse(request, response, next) {
  const { decision, feedback } = request.body || {};
  if (!['approved', 'changes_requested'].includes(decision)) return response.status(400).json({ success: false, message: 'Choose approve or request changes' });
  if (feedback !== undefined && (typeof feedback !== 'string' || feedback.length > 4000)) return response.status(400).json({ success: false, message: 'Feedback must be 4,000 characters or fewer' });
  if (decision === 'changes_requested' && !feedback?.trim()) return response.status(400).json({ success: false, message: 'Describe the changes you need' });
  next();
}
