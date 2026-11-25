import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProductPrice } from './pricingCalculator.js';

const product = (overrides = {}) => ({ id: 'p-1', name: 'Test product', base_price: '10.00', pricing_model: 'base', ...overrides });
const group = (overrides = {}) => ({ id: 'g-1', name: 'Finish', input_type: 'select', is_required: true, product_option_values: [], ...overrides });
const value = (overrides = {}) => ({ id: 'v-1', label: 'Gloss', adjustment_type: 'fixed', price_adjustment: '2.50', is_active: true, ...overrides });
const calculate = (overrides = {}) => calculateProductPrice({
  product: product(), groups: [], tiers: [], quantity: 1, selectedOptions: [], customInputs: [], ...overrides,
});

test('base pricing returns base unit and quantity total exactly', () => {
  const result = calculate({ product: product({ base_price: '0.10' }), quantity: 3 });
  assert.equal(result.final_unit_price, '0.10');
  assert.equal(result.subtotal, '0.30');
});

test('fixed options are added in selection order', () => {
  const options = [{ optionGroupId: 'g-1', optionValueIds: ['v-1'] }];
  const result = calculate({
    product: product({ pricing_model: 'options' }),
    groups: [group({ product_option_values: [value()] })],
    selectedOptions: options,
  });
  assert.equal(result.final_unit_price, '12.50');
  assert.equal(result.option_adjustments[0].unit_price_after, '12.50');
});

test('multi-select groups accept multiple distinct values and apply them in submitted order', () => {
  const multi = group({
    input_type: 'multi_select',
    product_option_values: [value({ id: 'v-a', label: 'One', price_adjustment: '1.00' }), value({ id: 'v-b', label: 'Two', price_adjustment: '2.00' })],
  });
  const result = calculate({
    product: product({ pricing_model: 'options' }), groups: [multi],
    selectedOptions: [{ optionGroupId: 'g-1', optionValueIds: ['v-b', 'v-a'] }],
  });
  assert.deepEqual(result.option_adjustments.map((item) => item.option_value_id), ['v-b', 'v-a']);
  assert.equal(result.final_unit_price, '13.00');
});

test('base pricing model ignores stored option and tier prices', () => {
  const result = calculate({
    product: product({ pricing_model: 'base' }),
    groups: [group({ product_option_values: [value()] })],
    tiers: [{ min_quantity: 1, max_quantity: 99, unit_price: '2.00' }, { min_quantity: 50, max_quantity: null, unit_price: '1.00' }],
    selectedOptions: [{ optionGroupId: 'g-1', optionValueIds: ['v-1'] }],
  });
  assert.equal(result.final_unit_price, '10.00');
  assert.equal(result.quantity_tier, null);
});

test('percentage adjustments are sequential and rounded to cents each time', () => {
  const groups = [
    group({ id: 'g-1', name: 'Increase', product_option_values: [value({ id: 'v-1', adjustment_type: 'percentage', price_adjustment: '10.00' })] }),
    group({ id: 'g-2', name: 'Discount', product_option_values: [value({ id: 'v-2', adjustment_type: 'percentage', price_adjustment: '-10.00' })] }),
  ];
  const result = calculate({
    product: product({ pricing_model: 'options' }), groups,
    selectedOptions: [{ optionGroupId: 'g-1', optionValueIds: ['v-1'] }, { optionGroupId: 'g-2', optionValueIds: ['v-2'] }],
  });
  assert.equal(result.final_unit_price, '9.90');
});

test('quantity tiers replace base price and are multiplied by quantity', () => {
  const result = calculate({
    product: product({ base_price: '10.00', pricing_model: 'quantity_tiers' }), quantity: 100,
    tiers: [{ min_quantity: 100, max_quantity: 499, unit_price: '8.25' }],
  });
  assert.equal(result.base_unit_price, '10.00');
  assert.equal(result.starting_unit_price, '8.25');
  assert.equal(result.subtotal, '825.00');
});

test('combined pricing applies options to a matching tier price', () => {
  const result = calculate({
    product: product({ pricing_model: 'combined' }), quantity: 25,
    tiers: [{ min_quantity: 25, max_quantity: 99, unit_price: '6.50' }],
    groups: [group({ product_option_values: [value()] })],
    selectedOptions: [{ optionGroupId: 'g-1', optionValueIds: ['v-1'] }],
  });
  assert.equal(result.final_unit_price, '9.00');
  assert.equal(result.subtotal, '225.00');
});

test('no matching tier falls back to the base price', () => {
  const result = calculate({
    product: product({ pricing_model: 'quantity_tiers' }), quantity: 100,
    tiers: [{ min_quantity: 1, max_quantity: 50, unit_price: '7.00' }],
  });
  assert.equal(result.quantity_tier, null);
  assert.equal(result.final_unit_price, '10.00');
});

test('products without options and tiers still calculate', () => {
  const result = calculate({ product: product({ pricing_model: 'combined' }), quantity: 2 });
  assert.equal(result.subtotal, '20.00');
});

test('required selection, invalid ownership, inactive values, and single-select multiplicity are rejected', () => {
  const groups = [group({ product_option_values: [value(), value({ id: 'v-2', is_active: false })] })];
  assert.throws(() => calculate({ product: product({ pricing_model: 'options' }), groups }), /Finish is required/);
  assert.throws(() => calculate({ product: product({ pricing_model: 'options' }), groups, selectedOptions: [{ optionGroupId: 'g-other', optionValueIds: ['v-1'] }] }), /invalid for this product/);
  assert.throws(() => calculate({ product: product({ pricing_model: 'options' }), groups, selectedOptions: [{ optionGroupId: 'g-1', optionValueIds: ['v-2'] }] }), /not available/);
  assert.throws(() => calculate({ product: product({ pricing_model: 'options' }), groups, selectedOptions: [{ optionGroupId: 'g-1', optionValueIds: ['v-1', 'v-3'] }] }), /only one selection/);
});

test('a value from another product group and duplicate option IDs are rejected', () => {
  const groups = [
    group({ id: 'g-1', name: 'Finish', product_option_values: [value({ id: 'v-1' })] }),
    group({ id: 'g-2', name: 'Size', product_option_values: [value({ id: 'v-2' })] }),
  ];
  assert.throws(() => calculate({ product: product({ pricing_model: 'options' }), groups, selectedOptions: [{ optionGroupId: 'g-1', optionValueIds: ['v-2'] }, { optionGroupId: 'g-2', optionValueIds: ['v-2'] }] }), /not available/);
  assert.throws(() => calculate({ product: product({ pricing_model: 'options' }), groups, selectedOptions: [{ optionGroupId: 'g-1', optionValueIds: ['v-1', 'v-1'] }, { optionGroupId: 'g-2', optionValueIds: ['v-2'] }] }), /Duplicate selections/);
});

test('custom values are validated but do not affect price', () => {
  const customGroup = group({ id: 'g-text', name: 'Engraving', input_type: 'text' });
  const result = calculate({
    product: product({ pricing_model: 'options' }), groups: [customGroup],
    customInputs: [{ optionGroupId: 'g-text', value: '  HELLO  ' }],
  });
  assert.equal(result.custom_inputs[0].value, 'HELLO');
  assert.equal(result.final_unit_price, '10.00');
  assert.throws(() => calculate({ groups: [group({ id: 'g-number', input_type: 'number' })], customInputs: [{ optionGroupId: 'g-number', value: 'NaN' }] }), /finite number/);
  assert.throws(() => calculate({ groups: [group({ id: 'g-color', input_type: 'color' })], customInputs: [{ optionGroupId: 'g-color', value: 'red' }] }), /hex color/);
});

test('quantity must be a positive integer', () => {
  assert.throws(() => calculate({ quantity: 0 }), /positive whole number/);
  assert.throws(() => calculate({ quantity: 1.5 }), /positive whole number/);
});

test('overlapping tiers are rejected instead of choosing one arbitrarily', () => {
  assert.throws(() => calculate({
    product: product({ pricing_model: 'quantity_tiers' }), quantity: 20,
    tiers: [{ min_quantity: 1, max_quantity: 25, unit_price: '8.00' }, { min_quantity: 20, max_quantity: null, unit_price: '6.00' }],
  }), /ranges overlap/);
});

test('custom inputs on a select group and options causing negative prices are rejected', () => {
  assert.throws(() => calculate({ groups: [group()], customInputs: [{ optionGroupId: 'g-1', value: 'unexpected' }] }), /invalid for this product/);
  assert.throws(() => calculate({
    product: product({ pricing_model: 'options' }),
    groups: [group({ product_option_values: [value({ price_adjustment: '-20.00' })] })],
    selectedOptions: [{ optionGroupId: 'g-1', optionValueIds: ['v-1'] }],
  }), /negative price/);
});
