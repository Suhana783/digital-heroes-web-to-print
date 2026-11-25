const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reject(response, message) {
  return response.status(400).json({ success: false, message });
}

function validString(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

export function validateCreateOrder(request, response, next) {
  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reject(response, 'A JSON order body is required');
  const allowed = ['idempotencyKey', 'items', 'deliveryAddress', 'contact'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return reject(response, 'Order totals and prices are calculated by the server');
  if (!uuidPattern.test(body.idempotencyKey || '')) return reject(response, 'A valid idempotencyKey is required');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) return reject(response, 'An order must contain between 1 and 30 items');

  const items = [];
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).some((key) => !['productId', 'quantity', 'selectedOptions', 'customInputs', 'designId'].includes(key))) {
      return reject(response, 'Each cart item must contain only product configuration and quantity');
    }
    if (!uuidPattern.test(item.productId || '') || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 2_147_483_647) {
      return reject(response, 'Each cart item needs a valid product and positive whole-number quantity');
    }
    if (item.designId != null && !uuidPattern.test(item.designId)) return reject(response, 'Each saved design ID must be valid');
    const selectedOptions = item.selectedOptions ?? [];
    const customInputs = item.customInputs ?? [];
    if (!Array.isArray(selectedOptions) || !Array.isArray(customInputs)) return reject(response, 'Cart option selections must be arrays');
    if (selectedOptions.some((selection) => !selection || typeof selection !== 'object' || Array.isArray(selection)
      || !uuidPattern.test(selection.optionGroupId || '') || !Array.isArray(selection.optionValueIds)
      || selection.optionValueIds.some((id) => typeof id !== 'string' || !uuidPattern.test(id)))) {
      return reject(response, 'Each selected option needs a valid group ID and option value IDs');
    }
    if (customInputs.some((input) => !input || typeof input !== 'object' || Array.isArray(input)
      || !uuidPattern.test(input.optionGroupId || '') || !Object.hasOwn(input, 'value'))) {
      return reject(response, 'Each custom input needs a valid group ID and value');
    }
    items.push({ productId: item.productId, quantity: item.quantity, selectedOptions, customInputs, designId: item.designId || null });
  }

  const address = body.deliveryAddress;
  if (!address || typeof address !== 'object' || Array.isArray(address)
    || Object.keys(address).some((key) => !['addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'].includes(key))
    || !validString(address.addressLine1, 3, 200)
    || (address.addressLine2 != null && !validString(address.addressLine2, 1, 200))
    || !validString(address.city, 1, 100) || !validString(address.state, 1, 100)
    || !validString(address.postalCode, 2, 20) || !validString(address.country, 2, 80)) {
    return reject(response, 'Enter a valid delivery address');
  }

  const contact = body.contact;
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)
    || Object.keys(contact).some((key) => !['fullName', 'phone'].includes(key))
    || !validString(contact.fullName, 1, 120)
    || (contact.phone != null && (typeof contact.phone !== 'string' || contact.phone.trim().length > 30))) {
    return reject(response, 'Enter valid customer contact information');
  }

  request.orderInput = {
    idempotencyKey: body.idempotencyKey,
    items,
    deliveryAddress: {
      address_line_1: address.addressLine1.trim(),
      address_line_2: address.addressLine2?.trim() || null,
      city: address.city.trim(), state: address.state.trim(),
      postal_code: address.postalCode.trim(), country: address.country.trim(),
    },
    contact: { full_name: contact.fullName.trim(), phone: contact.phone?.trim() || null },
  };
  next();
}

export function validateOrderId(request, response, next) {
  if (!uuidPattern.test(request.params.orderId || '')) return reject(response, 'A valid order ID is required');
  next();
}

export function validateRazorpayVerification(request, response, next) {
  const body = request.body;
  const fields = ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((field) => !fields.includes(field))
    || typeof body.razorpay_order_id !== 'string' || !/^order_[A-Za-z0-9]+$/.test(body.razorpay_order_id)
    || typeof body.razorpay_payment_id !== 'string' || !/^pay_[A-Za-z0-9]+$/.test(body.razorpay_payment_id)
    || typeof body.razorpay_signature !== 'string' || !/^[a-f0-9]{64}$/i.test(body.razorpay_signature)) {
    return reject(response, 'A valid Razorpay payment response is required');
  }
  next();
}

export function validateRazorpayFailure(request, response, next) {
  const body = request.body;
  const allowedReasons = ['checkout_dismissed', 'payment_failed', 'checkout_unavailable'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((field) => field !== 'reason')
    || !allowedReasons.includes(body.reason)) {
    return reject(response, 'A valid payment attempt status is required');
  }
  next();
}
