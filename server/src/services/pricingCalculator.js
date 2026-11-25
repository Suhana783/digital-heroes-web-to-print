const MONEY_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
const MAX_QUANTITY = 2_147_483_647;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function pricingConflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  throw error;
}

function decimalToCents(value, name) {
  const match = String(value).match(MONEY_PATTERN);
  if (!match) pricingConflict(`Invalid monetary value in ${name}`);
  const [, sign, whole, fraction = ''] = match;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return sign === '-' ? -cents : cents;
}

function decimalToBasisPoints(value) {
  const match = String(value).match(MONEY_PATTERN);
  if (!match) pricingConflict('Invalid percentage adjustment in catalogue data');
  const [, sign, whole, fraction = ''] = match;
  const points = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return sign === '-' ? -points : points;
}

function centsToDecimal(cents) {
  const sign = cents < 0n ? '-' : '';
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function roundRatioHalfUp(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

function normalizeCustomValue(group, value) {
  if (group.input_type === 'text') {
    if (typeof value !== 'string' || value.length > 1000) badRequest(`Enter a text value of at most 1000 characters for ${group.name}`);
    const normalized = value.trim();
    if (group.is_required && !normalized) badRequest(`${group.name} is required`);
    return normalized;
  }
  if (group.input_type === 'number') {
    if (typeof value !== 'number' && typeof value !== 'string') badRequest(`${group.name} must be a finite number`);
    if (typeof value === 'string' && !value.trim()) badRequest(`${group.name} must be a finite number`);
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) badRequest(`${group.name} must be a finite number`);
    return number;
  }
  if (group.input_type === 'color') {
    if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) badRequest(`${group.name} must be a valid hex color`);
    return value.toUpperCase();
  }
  badRequest(`${group.name} does not accept custom input`);
}

function validateSelections(groups, selectedOptions, customInputs) {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const selectedByGroup = new Map();
  const customByGroup = new Map();

  for (const selection of selectedOptions) {
    const group = groupById.get(selection.optionGroupId);
    if (!group || !['select', 'multi_select'].includes(group.input_type)) badRequest('An option group is invalid for this product');
    if (selectedByGroup.has(group.id)) badRequest(`Submit ${group.name} only once`);
    const valueIds = selection.optionValueIds;
    if (new Set(valueIds).size !== valueIds.length) badRequest(`Duplicate selections are not allowed for ${group.name}`);
    if (group.input_type === 'select' && valueIds.length > 1) badRequest(`${group.name} accepts only one selection`);
    selectedByGroup.set(group.id, valueIds);
  }

  for (const input of customInputs) {
    const group = groupById.get(input.optionGroupId);
    if (!group || !['text', 'number', 'color'].includes(group.input_type)) badRequest('A custom input group is invalid for this product');
    if (customByGroup.has(group.id)) badRequest(`Submit ${group.name} only once`);
    customByGroup.set(group.id, normalizeCustomValue(group, input.value));
  }

  const normalizedCustomInputs = [];
  for (const group of groups) {
    if (['select', 'multi_select'].includes(group.input_type)) {
      const selectedIds = selectedByGroup.get(group.id) || [];
      if (group.is_required && selectedIds.length === 0) badRequest(`${group.name} is required`);
      const byId = new Map((group.product_option_values || []).filter((value) => value.is_active).map((value) => [value.id, value]));
      for (const id of selectedIds) {
        const value = byId.get(id);
        if (!value) badRequest(`A selected value is not available for ${group.name}`);
      }
    } else {
      const value = customByGroup.get(group.id);
      if (group.is_required && (value === undefined || value === '')) badRequest(`${group.name} is required`);
      if (value !== undefined) normalizedCustomInputs.push({ option_group_id: group.id, option_group_name: group.name, input_type: group.input_type, value });
    }
  }
  const chosenValues = [];
  for (const selection of selectedOptions) {
    const group = groupById.get(selection.optionGroupId);
    const activeValues = new Map((group.product_option_values || []).filter((value) => value.is_active).map((value) => [value.id, value]));
    for (const id of selection.optionValueIds) chosenValues.push({ group, value: activeValues.get(id) });
  }
  return { chosenValues, normalizedCustomInputs };
}

function findQuantityTier(tiers, quantity) {
  const sorted = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity);
  let previousMax = 0;
  for (const tier of sorted) {
    if (!Number.isInteger(tier.min_quantity) || tier.min_quantity < 1
      || (tier.max_quantity !== null && (!Number.isInteger(tier.max_quantity) || tier.max_quantity < tier.min_quantity))) {
      pricingConflict('Quantity pricing contains an invalid range. Please contact support.');
    }
    if (tier.min_quantity <= previousMax) pricingConflict('Quantity pricing ranges overlap. Please contact support.');
    if (previousMax === MAX_QUANTITY && tier.min_quantity > MAX_QUANTITY) pricingConflict('Quantity pricing ranges overlap. Please contact support.');
    previousMax = tier.max_quantity ?? MAX_QUANTITY;
  }
  return sorted.find((tier) => quantity >= tier.min_quantity && (tier.max_quantity === null || quantity <= tier.max_quantity)) || null;
}

export function calculateProductPrice({ product, groups, tiers, quantity, selectedOptions, customInputs, currency = 'INR' }) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) badRequest('Quantity must be a positive whole number');
  if (!['base', 'options', 'quantity_tiers', 'combined'].includes(product.pricing_model)) pricingConflict('Product has an unsupported pricing model');
  const { chosenValues, normalizedCustomInputs } = validateSelections(groups, selectedOptions, customInputs);
  const tierApplies = ['quantity_tiers', 'combined'].includes(product.pricing_model)
    ? findQuantityTier(tiers, quantity)
    : null;
  let unitCents = decimalToCents(tierApplies?.unit_price ?? product.base_price, 'product price');
  if (unitCents < 0n) pricingConflict('Product price cannot be negative');
  const startingCents = unitCents;
  const optionAdjustments = [];

  if (['options', 'combined'].includes(product.pricing_model)) {
    for (const { group, value } of chosenValues) {
      const before = unitCents;
      if (!['fixed', 'percentage'].includes(value.adjustment_type)) pricingConflict('An option has an unsupported price adjustment type');
      const adjustment = value.adjustment_type === 'percentage'
        ? (() => {
          const basisPoints = decimalToBasisPoints(value.price_adjustment);
          if (basisPoints < -10_000n) pricingConflict('An option percentage cannot reduce the price below zero');
          return roundRatioHalfUp(before * (10_000n + basisPoints), 10_000n);
        })()
        : before + decimalToCents(value.price_adjustment, 'option adjustment');
      if (adjustment < 0n) badRequest('The selected options would result in a negative price');
      unitCents = adjustment;
      optionAdjustments.push({
        option_group_id: group.id,
        option_group_name: group.name,
        option_value_id: value.id,
        label: value.label,
        adjustment_type: value.adjustment_type,
        configured_adjustment: String(value.price_adjustment),
        unit_price_before: centsToDecimal(before),
        unit_price_after: centsToDecimal(unitCents),
      });
    }
  }

  const subtotalCents = unitCents * BigInt(quantity);
  return {
    product: { id: product.id, name: product.name },
    quantity,
    base_unit_price: centsToDecimal(decimalToCents(product.base_price, 'product base price')),
    starting_unit_price: centsToDecimal(startingCents),
    quantity_tier: tierApplies ? {
      min_quantity: tierApplies.min_quantity,
      max_quantity: tierApplies.max_quantity,
      unit_price: centsToDecimal(decimalToCents(tierApplies.unit_price, 'quantity tier price')),
    } : null,
    option_adjustments: optionAdjustments,
    custom_inputs: normalizedCustomInputs,
    final_unit_price: centsToDecimal(unitCents),
    subtotal: centsToDecimal(subtotalCents),
    currency,
  };
}
