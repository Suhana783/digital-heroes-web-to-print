import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureOrderDesignLinkSchema, validateOwnedDesignForProduct } from './orderService.js';

const customerId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const otherCustomerId = 'a47ac10b-58cc-4372-a567-0e02b2c3d479';
const productId = 'b47ac10b-58cc-4372-a567-0e02b2c3d479';
const designId = 'c47ac10b-58cc-4372-a567-0e02b2c3d479';

function clientReturning(result) {
  return {
    from(table) {
      assert.equal(table, 'customer_designs');
      const filters = [];
      const query = {
        select() { return this; },
        eq(column, value) { filters.push([column, value]); return this; },
        maybeSingle() {
          assert.deepEqual(filters, [['id', designId], ['customer_id', customerId]]);
          return Promise.resolve(result);
        },
      };
      return query;
    },
  };
}

test('optional order designs are checked against authenticated ownership and product', async () => {
  assert.equal(await validateOwnedDesignForProduct({}, customerId, null, productId), null);
  assert.equal(await validateOwnedDesignForProduct(clientReturning({
    data: { id: designId, customer_id: customerId, product_id: productId }, error: null,
  }), customerId, designId, productId), designId);
});

test('order creation rejects another customer’s design and a design for another product', async () => {
  await assert.rejects(
    validateOwnedDesignForProduct(clientReturning({ data: null, error: null }), customerId, designId, productId),
    { statusCode: 400 },
  );
  await assert.rejects(
    validateOwnedDesignForProduct(clientReturning({
      data: { id: designId, customer_id: otherCustomerId, product_id: productId }, error: null,
    }), customerId, designId, productId),
    { statusCode: 400 },
  );
  await assert.rejects(
    validateOwnedDesignForProduct(clientReturning({
      data: { id: designId, customer_id: customerId, product_id: otherCustomerId }, error: null,
    }), customerId, designId, productId),
    { statusCode: 400 },
  );
});

test('order creation fails clearly instead of dropping a design link before its migration exists', async () => {
  const client = {
    from(table) {
      assert.equal(table, 'order_items');
      return {
        select(column) {
          assert.equal(column, 'customer_design_id');
          return this;
        },
        limit(count) {
          assert.equal(count, 0);
          return Promise.resolve({ error: { code: '42703' } });
        },
      };
    },
  };
  await assert.rejects(ensureOrderDesignLinkSchema(client), /migration is applied/);
});
