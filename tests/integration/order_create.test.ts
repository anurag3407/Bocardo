import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { calculateOrderTaxBreakdown, OrderStatus } from '../../packages/shared-types/src';
import { redisService } from '../../apps/api/src/services/redis';
import { installPlatformDoubles, MockDb } from '../harness/db';
import { callers, IDS } from '../harness/trpc';
import { expectTrpcError, Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Order Checkout Pipeline');

const DISH_A = {
  id: IDS.dishA,
  name: 'Hyderabadi Dum Biryani',
  price_paise: 32000,
  is_available: true,
  restaurant_id: IDS.restaurant,
};
const DISH_B = {
  id: IDS.dishB,
  name: 'Burani Garlic Raita',
  price_paise: 6000,
  is_available: true,
  restaurant_id: IDS.restaurant,
};

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId: IDS.restaurant,
    items: [
      { dishId: IDS.dishA, quantity: 2 },
      { dishId: IDS.dishB, quantity: 1 },
    ],
    deliveryLatitude: 12.9716,
    deliveryLongitude: 77.6408,
    deliveryAddress: '42, 100 Feet Road, Indiranagar, Bengaluru',
    ...overrides,
  };
}

runSuite(suite, async () => {
  let restaurantState: { is_active: boolean; is_accepting_orders: boolean } = {
    is_active: true,
    is_accepting_orders: true,
  };
  const soldOut = new Set<string>();

  let mockDb: MockDb;
  mockDb = installPlatformDoubles()
    .on(/is_active, is_accepting_orders FROM restaurants/i, () =>
      restaurantState.is_active
        ? { rows: [restaurantState], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    )
    .on(/FROM dishes\s+WHERE id = ANY/i, (params) => {
      const ids: string[] = params[0] ?? [];
      const rows = ids
        .map((id) => [DISH_A, DISH_B].find((dish) => dish.id === id))
        .filter((dish): dish is typeof DISH_A => Boolean(dish))
        .map((dish) => ({ ...dish, is_available: !soldOut.has(dish.id) }));
      return { rows, rowCount: rows.length };
    })
    .on(/INSERT INTO orders/i, () => ({ rows: [{ id: IDS.order }], rowCount: 1 }))
    .on(/INSERT INTO order_items/i, () => ({ rows: [], rowCount: 1 }))
    .on(/UPDATE orders\s+SET razorpay_order_id/i, () => ({ rows: [], rowCount: 1 }));

  await suite.test('creates a tamper-proof PAYMENT_PENDING order', async () => {
    mockDb.clearLog();
    const result = await callers.customer().order.create(validInput());

    const expectedTax = calculateOrderTaxBreakdown(32000 * 2 + 6000);
    assert.equal(result.orderId, IDS.order);
    assert.equal(result.totalAmountPaise, expectedTax.totalAmountPaise);
    assert.deepEqual(result.taxBreakdown, expectedTax);
    assert.match(result.deliveryOtp, /^\d{4}$/);
    assert.match(result.razorpayOrderId, /^order_mock_/);

    const orderInsert = mockDb.calls(/INSERT INTO orders/i)[0];
    assert.ok(orderInsert, 'orders insert missing');
    const params = orderInsert.params;
    assert.equal(params[0], IDS.customer);
    assert.equal(params[1], IDS.restaurant);
    assert.equal(params[2], OrderStatus.PAYMENT_PENDING);
    assert.equal(params[6], result.deliveryOtp);
    assert.equal(params[7], expectedTax.subtotalPaise);
    assert.equal(params[8], expectedTax.foodGstPaise);
    assert.equal(params[9], expectedTax.deliveryFeePaise);
    assert.equal(params[10], expectedTax.platformFeePaise);
    assert.equal(params[11], expectedTax.serviceGstPaise);
    assert.equal(params[12], expectedTax.totalAmountPaise);

    assert.equal(mockDb.calls(/INSERT INTO order_items/i).length, 2);
    assert.equal(mockDb.calls(/UPDATE orders\s+SET razorpay_order_id/i).length, 1);
  });

  await suite.test('server-side prices override any client cart total', async () => {
    mockDb.clearLog();
    const result = await callers.customer().order.create(validInput({ tipPaise: 5000 }));
    // Tip is validated by the schema but the server bill is still authoritative
    // for food + taxes; the returned total never trusts client-supplied prices.
    assert.equal(result.totalAmountPaise, calculateOrderTaxBreakdown(70000).totalAmountPaise);
  });

  await suite.test('releases the cart lock after checkout', async () => {
    await callers.customer().order.create(validInput());
    assert.equal(await redisService.get(`lock:cart:${IDS.customer}`), null);
  });

  await suite.test('rejects a second concurrent checkout for the same cart', async () => {
    const acquired = await redisService.acquireLock(`lock:cart:${IDS.customer}`, 8);
    assert.equal(acquired, true);
    await expectTrpcError(() => callers.customer().order.create(validInput()), 'CONFLICT');
    await redisService.releaseLock(`lock:cart:${IDS.customer}`);
  });

  await suite.test('blocks orders when the kitchen is closed', async () => {
    restaurantState = { is_active: true, is_accepting_orders: false };
    await expectTrpcError(() => callers.customer().order.create(validInput()), 'PRECONDITION_FAILED');
    restaurantState = { is_active: true, is_accepting_orders: true };
  });

  await suite.test('blocks orders from deactivated restaurants', async () => {
    restaurantState = { is_active: false, is_accepting_orders: true };
    await expectTrpcError(() => callers.customer().order.create(validInput()), 'PRECONDITION_FAILED');
    restaurantState = { is_active: true, is_accepting_orders: true };
  });

  await suite.test('rejects unknown or cross-restaurant dishes', async () => {
    await expectTrpcError(
      () => callers.customer().order.create(validInput({ items: [{ dishId: crypto.randomUUID(), quantity: 1 }] })),
      'BAD_REQUEST'
    );
  });

  await suite.test('rejects 86-ed (sold out) dishes by name', async () => {
    soldOut.add(IDS.dishB);
    const error = await expectTrpcError(
      () => callers.customer().order.create(validInput({ items: [{ dishId: IDS.dishB, quantity: 1 }] })),
      'PRECONDITION_FAILED'
    );
    assert.match(error.message, /Burani Garlic Raita/);
    soldOut.delete(IDS.dishB);
  });

  await suite.test('collapses duplicate dish lines for pricing integrity', async () => {
    mockDb.clearLog();
    const result = await callers.customer().order.create(
      validInput({ items: [{ dishId: IDS.dishA, quantity: 1 }, { dishId: IDS.dishA, quantity: 2 }] })
    );
    assert.equal(result.totalAmountPaise, calculateOrderTaxBreakdown(96000).totalAmountPaise);
    const dishLookup = mockDb.calls(/FROM dishes\s+WHERE id = ANY/i)[0];
    assert.equal((dishLookup.params[0] as string[]).length, 1);
    assert.equal(mockDb.calls(/INSERT INTO order_items/i).length, 2);
  });

  await suite.test('only CUSTOMER accounts can start checkout', async () => {
    await expectTrpcError(() => callers.restaurant().order.create(validInput()), 'FORBIDDEN');
    await expectTrpcError(() => callers.rider().order.create(validInput()), 'FORBIDDEN');
    await expectTrpcError(() => callers.anonymous().order.create(validInput()), 'UNAUTHORIZED');
  });
});
