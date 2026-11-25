import { apiRequest } from '../../services/api.js';

export async function repriceCart(items) {
  return Promise.all(items.map(async (item) => {
    try {
      const pricing = await apiRequest('/pricing/calculate', {
        method: 'POST',
        body: {
          productId: item.productId,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
          customInputs: item.customInputs,
        },
      });
      return { ...item, pricing, error: null };
    } catch (error) {
      return { ...item, pricing: null, error };
    }
  }));
}

export function toCents(value) {
  const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0')) : 0n;
}

export function fromCents(value) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

export function formatCurrency(value, currency = 'INR') {
  const amount = Number(value);
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${value}`; }
}

export function cartSubtotal(pricedItems) {
  const cents = pricedItems.reduce((total, item) => total + (item.pricing ? toCents(item.pricing.subtotal) : 0n), 0n);
  return fromCents(cents);
}

export function selectedConfiguration(pricing) {
  return [
    ...pricing.option_adjustments.map((item) => `${item.option_group_name}: ${item.label}`),
    ...pricing.custom_inputs.map((item) => `${item.option_group_name}: ${item.value}`),
  ];
}
