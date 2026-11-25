import test from 'node:test';
import assert from 'node:assert/strict';
import { createArtworkDownloadUrl, uploadOrderArtwork } from './artworkService.js';

function userClient(results) {
  return {
    from(table) {
      const query = {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve(results[table]); },
      };
      return query;
    },
  };
}

test('artwork upload rejects an order that is not visible to the customer before storage', async () => {
  await assert.rejects(uploadOrderArtwork({
    userClient: userClient({ orders: { data: null, error: null } }),
    customerId: 'a47ac10b-58cc-4372-a567-0e02b2c3d479',
    orderId: 'b47ac10b-58cc-4372-a567-0e02b2c3d479',
    input: {},
  }), { statusCode: 404, message: 'Order not found' });
});

test('artwork upload rejects an item that does not belong to the owned order', async () => {
  await assert.rejects(uploadOrderArtwork({
    userClient: userClient({
      orders: { data: { id: 'b47ac10b-58cc-4372-a567-0e02b2c3d479' }, error: null },
      order_items: { data: null, error: null },
    }),
    customerId: 'a47ac10b-58cc-4372-a567-0e02b2c3d479',
    orderId: 'b47ac10b-58cc-4372-a567-0e02b2c3d479',
    input: { orderItemId: 'c47ac10b-58cc-4372-a567-0e02b2c3d479' },
  }), { statusCode: 400, message: 'Choose an item that belongs to this order' });
});

test('artwork download rejects metadata hidden by customer RLS', async () => {
  await assert.rejects(createArtworkDownloadUrl(
    userClient({ artwork_files: { data: null, error: null } }),
    'a47ac10b-58cc-4372-a567-0e02b2c3d479',
    'b47ac10b-58cc-4372-a567-0e02b2c3d479',
  ), { statusCode: 404, message: 'Artwork file not found' });
});
