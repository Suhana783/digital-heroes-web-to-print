const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message) {
  return { success: false, message };
}

export function validatePricingRequest(request, response, next) {
  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json(invalid('A JSON request body is required'));
  }
  if (typeof body.productId !== 'string' || !uuidPattern.test(body.productId)) {
    return response.status(400).json(invalid('A valid productId is required'));
  }
  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 2_147_483_647) {
    return response.status(400).json(invalid('Quantity must be a positive whole number'));
  }
  if (body.selectedOptions !== undefined && !Array.isArray(body.selectedOptions)) {
    return response.status(400).json(invalid('selectedOptions must be an array'));
  }
  if (body.customInputs !== undefined && !Array.isArray(body.customInputs)) {
    return response.status(400).json(invalid('customInputs must be an array'));
  }

  const selectedOptions = body.selectedOptions || [];
  for (const selection of selectedOptions) {
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)
      || !uuidPattern.test(selection.optionGroupId || '') || !Array.isArray(selection.optionValueIds)
      || selection.optionValueIds.some((id) => typeof id !== 'string' || !uuidPattern.test(id))) {
      return response.status(400).json(invalid('Each option selection needs an optionGroupId and optionValueIds array'));
    }
  }

  const customInputs = body.customInputs || [];
  for (const input of customInputs) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || !uuidPattern.test(input.optionGroupId || '') || !Object.hasOwn(input, 'value')) {
      return response.status(400).json(invalid('Each custom input needs an optionGroupId and value'));
    }
  }

  request.pricingInput = {
    productId: body.productId,
    quantity: body.quantity,
    selectedOptions,
    customInputs,
  };
  next();
}
