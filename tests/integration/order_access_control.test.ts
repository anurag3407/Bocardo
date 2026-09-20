import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { OrderStatus, maskPhoneNumber } from '../../packages/shared-types/src';
import { installPlatformDoubles } from '../harness/db';
import { callers, IDS } from '../harness/trpc';
import { expectTrpcError, Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Order Access Control (BOLA/IDOR)');

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: IDS.order,
    customerId: IDS.customer,
    restaurantId: IDS.restaurant,
    riderId: null as string | null,
    status: OrderStatus.OUT_FOR_DELIVERY,
    deliveryLatitude: 12.9716,
    deliveryLongitude: 77.6408,
    deliveryAddress: 'Indiranagar',
    deliveryOtp: '4819',
    subtotalPaise: 32000,
    totalAmountPaise: 38910,
    customerName: 'Test Customer',
    customerPhone: '+919876543210',
    restaurantName: 'Biryani Bliss',
    restaurantPhone: '+918041234567',
    ...overrides,
  };
}

runSuite(suite, async () => {
  let currentOrder: Record<string, unknown> | null = orderRow();

  installPlatformDoubles()
    // Registered before the generic order lookup so listMyOrders is not shadowed.
    .on(/WHERE o.customer_id = \$1/i, () => ({ rows: [{ id: IDS.order, status: OrderStatus.OUT_FOR_DELIVERY }], rowCount: 1 }))
    .on(/FROM orders o\s+JOIN restaurants r/i, () =>
      currentOrder ? { rows: [currentOrder], rowCount: 1 } : { rows: [], rowCount: 0 }
    )
    .on(/FROM order_items oi/i, () => ({
      rows: [{ id: crypto.randomUUID(), dishId: IDS.dishA, name: 'Biryani', quantity: 2, unitPricePaise: 32000, totalPricePaise: 64000, isVeg: false }],
      rowCount: 1,
    }))
    .on(/FROM orders o\s+JOIN users u/i, () => ({ rows: [{ id: IDS.order, status: OrderStatus.PREPARING }], rowCount: 1 }));

  await suite.test('customer reads their own order with OTP and full phone', async () => {
    currentOrder = orderRow();
    const order = await callers.customer().order.getById({ orderId: IDS.order });
    assert.equal(order.deliveryOtp, '4819');
    assert.equal(order.customerPhone, '+919876543210');
    assert.equal(order.items.length, 1);
  });

  await suite.test('customer cannot read another customer order', async () => {
    currentOrder = orderRow({ customerId: crypto.randomUUID() });
    await expectTrpcError(() => callers.customer().order.getById({ orderId: IDS.order }), 'FORBIDDEN');
  });

  await suite.test('restaurant sees masked OTP and masked phone', async () => {
    currentOrder = orderRow();
    const order = await callers.restaurant().order.getById({ orderId: IDS.order });
    assert.equal(order.deliveryOtp, '****');
    assert.equal(order.customerPhone, maskPhoneNumber('+919876543210'));
  });

  await suite.test('restaurant cannot read a different restaurant order', async () => {
    currentOrder = orderRow({ restaurantId: crypto.randomUUID() });
    await expectTrpcError(() => callers.restaurant().order.getById({ orderId: IDS.order }), 'FORBIDDEN');
  });

  await suite.test('assigned rider sees masked OTP and masked phone', async () => {
    currentOrder = orderRow({ riderId: IDS.rider, status: OrderStatus.OUT_FOR_DELIVERY });
    const order = await callers.rider().order.getById({ orderId: IDS.order });
    assert.equal(order.deliveryOtp, '****');
    assert.equal(order.customerPhone, maskPhoneNumber('+919876543210'));
  });

  await suite.test('unassigned rider cannot read the order', async () => {
    currentOrder = orderRow({ riderId: null });
    await expectTrpcError(() => callers.rider().order.getById({ orderId: IDS.order }), 'FORBIDDEN');
  });

  await suite.test('admin may audit but OTP stays hidden from non-customers', async () => {
    currentOrder = orderRow();
    const order = await callers.admin().order.getById({ orderId: IDS.order });
    assert.equal(order.deliveryOtp, '****');
    assert.equal(order.customerPhone, '+919876543210');
  });

  await suite.test('missing orders produce NOT_FOUND', async () => {
    currentOrder = null;
    await expectTrpcError(() => callers.customer().order.getById({ orderId: IDS.order }), 'NOT_FOUND');
    currentOrder = orderRow();
  });

  await suite.test('anonymous callers cannot read orders', async () => {
    await expectTrpcError(() => callers.anonymous().order.getById({ orderId: IDS.order }), 'UNAUTHORIZED');
  });

  await suite.test('listMyOrders returns the customer history', async () => {
    const orders = await callers.customer().order.listMyOrders();
    assert.equal(orders.length, 1);
    assert.equal(orders[0].id, IDS.order);
  });

  await suite.test('listRestaurantOrders is scoped to the kitchen', async () => {
    const orders = await callers.restaurant().order.listRestaurantOrders();
    assert.equal(orders.length, 1);
  });

  await suite.test('listRestaurantOrders is empty for non-kitchen accounts', async () => {
    const orders = await callers.customer().order.listRestaurantOrders();
    assert.deepEqual(orders, []);
  });
});
