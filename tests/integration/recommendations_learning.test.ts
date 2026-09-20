import assert from 'node:assert/strict';
import { redisService } from '../../apps/api/src/services/redis';
import { installPlatformDoubles, MockDb } from '../harness/db';
import { callers, IDS } from '../harness/trpc';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Recommendation Continuous Learning');

runSuite(suite, async () => {
  let mockDb: MockDb;
  mockDb = installPlatformDoubles()
    .on(/FROM restaurants\s+WHERE id = \$1/i, () => ({
      rows: [{ id: IDS.restaurant, is_active: true, is_accepting_orders: true }],
      rowCount: 1,
    }))
    .on(/FROM dishes\s+WHERE id = ANY/i, (params) => {
      const ids: string[] = params[0] ?? [];
      const rows = ids.map((id) => ({
        id,
        name: 'Dish ' + id,
        price_paise: 10000,
        is_available: true,
        restaurant_id: IDS.restaurant,
      }));
      return { rows, rowCount: rows.length };
    })
    .on(/INSERT INTO orders/i, () => ({ rows: [{ id: IDS.order }], rowCount: 1 }))
    .on(/INSERT INTO order_items/i, () => ({ rows: [], rowCount: 1 }))
    .on(/UPDATE orders\s+SET razorpay_order_id/i, () => ({ rows: [], rowCount: 1 }))
    .on(/INSERT INTO dish_pair_associations/i, () => ({
      rows: [],
      rowCount: 2,
    }))
    .on(/SELECT id, status, delivery_otp, rider_id, otp_attempts FROM orders/i, () => ({
      rows: [
        {
          id: IDS.order,
          status: 'OUT_FOR_DELIVERY',
          delivery_otp: '1234',
          rider_id: IDS.rider,
          otp_attempts: 0,
        },
      ],
      rowCount: 1,
    }))
    .on(/SELECT ST_DWithin\(delivery_location/i, () => ({
      rows: [{ arrived: true }],
      rowCount: 1,
    }))
    .on(/UPDATE orders SET otp_attempts/i, () => ({
      rows: [{ id: IDS.order }],
      rowCount: 1,
    }))
    .on(/UPDATE orders.*SET status = \$1/i, () => ({
      rows: [],
      rowCount: 1,
    }))
    .on(/UPDATE rider_profiles.*SET active_order_id = NULL/i, () => ({
      rows: [],
      rowCount: 1,
    }))
    .on(/SELECT customer_id FROM orders/i, () => ({
      rows: [{ customer_id: IDS.customer }],
      rowCount: 1,
    }));

  await suite.test('order creation updates dish_pair_associations for multi-dish carts', async () => {
    mockDb.clearLog();

    const result = await callers.customer().order.create({
      restaurantId: IDS.restaurant,
      items: [
        { dishId: IDS.dishA, quantity: 1 },
        { dishId: IDS.dishB, quantity: 1 },
      ],
      deliveryLatitude: 12.9716,
      deliveryLongitude: 77.6408,
      deliveryAddress: '100ft Rd, Indiranagar, Bengaluru',
    });

    assert.ok(result.orderId);
    // Verify co-occurrence matrix upsert query was executed
    const coOccurrenceCalls = mockDb.calls(/INSERT INTO dish_pair_associations/i);
    assert.equal(coOccurrenceCalls.length, 1);
  });

  await suite.test('order delivery OTP verification invalidates rec:user:<id>:again cache', async () => {
    // Prime the user's recommendation cache
    const cacheKey = `rec:user:${IDS.customer}:again`;
    await redisService.set(cacheKey, JSON.stringify([{ id: IDS.dishA }]));
    assert.ok(await redisService.get(cacheKey));

    // Rider verifies delivery OTP
    await redisService.set(
      `rider:loc:${IDS.rider}`,
      JSON.stringify({
        latitude: 12.9716,
        longitude: 77.6408,
        accuracy: 10,
        updatedAt: Date.now(),
      })
    );

    mockDb.clearLog();
    const result = await callers.rider().order.verifyDeliveryOtp({
      orderId: IDS.order,
      otp: '1234',
    });

    assert.equal(result.success, true);
    // Verify customer's recommendation cache was invalidated
    const cachedAfter = await redisService.get(cacheKey);
    assert.equal(cachedAfter, null);
  });
});
