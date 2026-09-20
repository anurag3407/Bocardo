import assert from 'node:assert/strict';
import { OrderStatus } from '../../packages/shared-types/src';
import { redisService } from '../../apps/api/src/services/redis';
import { installPlatformDoubles, MockDb } from '../harness/db';
import { callers, IDS } from '../harness/trpc';
import { expectTrpcError, Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Order Lifecycle Rules');

runSuite(suite, async () => {
  // --- Configurable fake state ---
  let statusRow: any = {
    id: IDS.order,
    restaurant_id: IDS.restaurant,
    rider_id: null,
    status: OrderStatus.PAID,
  };
  let updateRowCount = 1;

  let otpRow: any = {
    id: IDS.order,
    status: OrderStatus.OUT_FOR_DELIVERY,
    delivery_otp: '4819',
    rider_id: IDS.rider,
    otp_attempts: 0,
  };
  let arrived = true;
  let attemptRowCount = 1;

  let cancelRow: any = {
    id: IDS.order,
    customerId: IDS.customer,
    restaurantId: IDS.restaurant,
    riderId: null,
    status: OrderStatus.PAID,
    totalAmountPaise: 38910,
    razorpayPaymentId: 'pay_captured',
  };
  let cancelRowCount = 1;

  let mockDb: MockDb;
  mockDb = installPlatformDoubles()
    .on(/SELECT id, status, delivery_otp, rider_id, otp_attempts FROM orders/i, () =>
      otpRow ? { rows: [otpRow], rowCount: 1 } : { rows: [], rowCount: 0 }
    )
    .on(/SELECT id, restaurant_id, rider_id, status FROM orders/i, () =>
      statusRow ? { rows: [statusRow], rowCount: 1 } : { rows: [], rowCount: 0 }
    )
    .on(/SELECT id, customer_id as "customerId"/i, () =>
      cancelRow ? { rows: [cancelRow], rowCount: 1 } : { rows: [], rowCount: 0 }
    )
    .on(/SELECT ST_DWithin/i, () => ({ rows: [{ arrived }], rowCount: 1 }))
    .on(/UPDATE orders SET otp_attempts/i, () => ({ rows: attemptRowCount ? [{ id: IDS.order }] : [], rowCount: attemptRowCount }))
    .on(/delivered_at = NOW\(\)/i, () => ({ rows: [], rowCount: 1 }))
    .on(/UPDATE rider_profiles/i, () => ({ rows: [], rowCount: 1 }))
    .on(/UPDATE orders SET status = \$1, cancel_reason/i, () => ({
      rows: cancelRowCount ? [{ id: IDS.order }] : [],
      rowCount: cancelRowCount,
    }))
    .on(/UPDATE orders SET status = \$1, updated_at = NOW\(\) WHERE id = \$2 AND status = \$3/i, () => ({
      rows: updateRowCount ? [{ id: IDS.order }] : [],
      rowCount: updateRowCount,
    }));

  const riderLocationKey = `rider:loc:${IDS.rider}`;
  async function setRiderLocation(overrides: Record<string, unknown> = {}) {
    await redisService.set(
      riderLocationKey,
      JSON.stringify({ longitude: 77.6408, latitude: 12.9716, updatedAt: Date.now(), accuracy: 10, ...overrides })
    );
  }

  // ---------------- updateStatus ----------------
  await suite.test('kitchen advances PAID -> ACCEPTED_BY_KITCHEN', async () => {
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: null, status: OrderStatus.PAID };
    updateRowCount = 1;
    mockDb.clearLog();
    const result = await callers.restaurant().order.updateStatus({ orderId: IDS.order, status: OrderStatus.ACCEPTED_BY_KITCHEN });
    assert.equal(result.status, OrderStatus.ACCEPTED_BY_KITCHEN);
    const update = mockDb.calls(/UPDATE orders SET status = \$1, updated_at/i)[0];
    assert.deepEqual(update.params, [OrderStatus.ACCEPTED_BY_KITCHEN, IDS.order, OrderStatus.PAID]);
  });

  await suite.test('kitchen cannot skip lifecycle stages', async () => {
    statusRow.status = OrderStatus.PAID;
    await expectTrpcError(
      () => callers.restaurant().order.updateStatus({ orderId: IDS.order, status: OrderStatus.DELIVERED }),
      'FORBIDDEN'
    );
  });

  await suite.test('kitchen cannot mutate another restaurant order', async () => {
    statusRow = { id: IDS.order, restaurant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', rider_id: null, status: OrderStatus.PAID };
    await expectTrpcError(
      () => callers.restaurant().order.updateStatus({ orderId: IDS.order, status: OrderStatus.ACCEPTED_BY_KITCHEN }),
      'FORBIDDEN'
    );
  });

  await suite.test('unknown orders produce NOT_FOUND', async () => {
    statusRow = null;
    await expectTrpcError(
      () => callers.restaurant().order.updateStatus({ orderId: IDS.order, status: OrderStatus.ACCEPTED_BY_KITCHEN }),
      'NOT_FOUND'
    );
  });

  await suite.test('concurrent status change produces CONFLICT', async () => {
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: null, status: OrderStatus.PAID };
    updateRowCount = 0;
    await expectTrpcError(
      () => callers.restaurant().order.updateStatus({ orderId: IDS.order, status: OrderStatus.ACCEPTED_BY_KITCHEN }),
      'CONFLICT'
    );
    updateRowCount = 1;
  });

  await suite.test('assigned rider accepts pickup', async () => {
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: IDS.rider, status: OrderStatus.READY_FOR_PICKUP };
    const result = await callers.rider().order.updateStatus({ orderId: IDS.order, status: OrderStatus.RIDER_ASSIGNED });
    assert.equal(result.success, true);
  });

  await suite.test('unassigned rider cannot accept pickup', async () => {
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: null, status: OrderStatus.READY_FOR_PICKUP };
    await expectTrpcError(
      () => callers.rider().order.updateStatus({ orderId: IDS.order, status: OrderStatus.RIDER_ASSIGNED }),
      'FORBIDDEN'
    );
  });

  await suite.test('rider cannot self-mark DELIVERED through updateStatus', async () => {
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: IDS.rider, status: OrderStatus.OUT_FOR_DELIVERY };
    await expectTrpcError(
      () => callers.rider().order.updateStatus({ orderId: IDS.order, status: OrderStatus.DELIVERED }),
      'FORBIDDEN'
    );
  });

  await suite.test('admin can recover stalled orders', async () => {
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: null, status: OrderStatus.PREPARING };
    const result = await callers.admin().order.updateStatus({ orderId: IDS.order, status: OrderStatus.READY_FOR_PICKUP });
    assert.equal(result.success, true);
  });

  await suite.test('invalid target statuses are rejected by input validation', async () => {
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: null, status: OrderStatus.PAID };
    await expectTrpcError(
      () => callers.restaurant().order.updateStatus({ orderId: IDS.order, status: 'NOT_A_STATUS' as any }),
      'BAD_REQUEST'
    );
  });

  // ---------------- verifyDeliveryOtp ----------------
  await suite.test('only riders may verify the handover OTP', async () => {
    await expectTrpcError(
      () => callers.customer().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }),
      'FORBIDDEN'
    );
  });

  await suite.test('unknown order fails OTP verification', async () => {
    otpRow = null;
    await expectTrpcError(
      () => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }),
      'NOT_FOUND'
    );
    otpRow = { id: IDS.order, status: OrderStatus.OUT_FOR_DELIVERY, delivery_otp: '4819', rider_id: IDS.rider, otp_attempts: 0 };
  });

  await suite.test('a different rider cannot complete the delivery', async () => {
    await redisService.del(riderLocationKey);
    await expectTrpcError(
      () => callers.rider({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }).order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }),
      'FORBIDDEN'
    );
  });

  await suite.test('already delivered orders are idempotent', async () => {
    otpRow.status = OrderStatus.DELIVERED;
    const result = await callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '0000' });
    assert.equal(result.success, true);
    assert.match(result.message, /already verified/i);
    otpRow.status = OrderStatus.OUT_FOR_DELIVERY;
  });

  await suite.test('orders not out for delivery are rejected', async () => {
    otpRow.status = OrderStatus.RIDER_ASSIGNED;
    await expectTrpcError(
      () => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }),
      'PRECONDITION_FAILED'
    );
    otpRow.status = OrderStatus.OUT_FOR_DELIVERY;
  });

  await suite.test('fresh GPS is required', async () => {
    await redisService.del(riderLocationKey);
    await expectTrpcError(
      () => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }),
      'PRECONDITION_FAILED'
    );
  });

  await suite.test('stale GPS is rejected', async () => {
    await setRiderLocation({ updatedAt: Date.now() - 60000 });
    await expectTrpcError(
      () => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }),
      'PRECONDITION_FAILED'
    );
  });

  await suite.test('low-accuracy GPS is rejected', async () => {
    await setRiderLocation({ accuracy: 200 });
    await expectTrpcError(
      () => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }),
      'PRECONDITION_FAILED'
    );
  });

  await suite.test('geofence requires arrival within 100m', async () => {
    await setRiderLocation();
    arrived = false;
    await expectTrpcError(
      () => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }),
      'PRECONDITION_FAILED'
    );
    arrived = true;
  });

  await suite.test('exhausted OTP attempts are throttled', async () => {
    await setRiderLocation();
    attemptRowCount = 0;
    await expectTrpcError(
      () => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }),
      'TOO_MANY_REQUESTS'
    );
    attemptRowCount = 1;
  });

  await suite.test('wrong OTP is rejected', async () => {
    await setRiderLocation();
    await expectTrpcError(
      () => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '0001' }),
      'BAD_REQUEST'
    );
  });

  await suite.test('correct OTP completes and releases the rider', async () => {
    await setRiderLocation();
    mockDb.clearLog();
    const result = await callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' });
    assert.equal(result.success, true);
    assert.ok(mockDb.calls(/delivered_at = NOW\(\)/i).length > 0);
    assert.ok(mockDb.calls(/UPDATE rider_profiles/i).length > 0);
  });

  // ---------------- cancelOrder ----------------
  await suite.test('customer cancels before kitchen acceptance and gets a refund', async () => {
    cancelRow = { ...cancelRow, status: OrderStatus.PAID, razorpayPaymentId: 'pay_captured' };
    cancelRowCount = 1;
    mockDb.clearLog();
    const result = await callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'Ordered by mistake' });
    assert.equal(result.status, OrderStatus.CANCELLED_BY_CUSTOMER);
    assert.equal(result.refundInitiated, true);
    const update = mockDb.calls(/UPDATE orders SET status = \$1, cancel_reason/i)[0];
    assert.deepEqual(update.params, [OrderStatus.CANCELLED_BY_CUSTOMER, 'Ordered by mistake', IDS.order, OrderStatus.PAID]);
  });

  await suite.test('customer cannot cancel once the kitchen started cooking', async () => {
    cancelRow = { ...cancelRow, status: OrderStatus.ACCEPTED_BY_KITCHEN };
    await expectTrpcError(
      () => callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'Changed my mind' }),
      'PRECONDITION_FAILED'
    );
  });

  await suite.test('customer cannot cancel another customer order', async () => {
    cancelRow = { ...cancelRow, customerId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', status: OrderStatus.PAID };
    await expectTrpcError(
      () => callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'Not mine' }),
      'FORBIDDEN'
    );
    cancelRow = { ...cancelRow, customerId: IDS.customer };
  });

  await suite.test('kitchen can cancel while preparing', async () => {
    cancelRow = { ...cancelRow, status: OrderStatus.PREPARING };
    cancelRowCount = 1;
    const result = await callers.restaurant().order.cancelOrder({ orderId: IDS.order, reason: 'Ingredients unavailable' });
    assert.equal(result.status, OrderStatus.CANCELLED_BY_KITCHEN);
  });

  await suite.test('kitchen cannot cancel another restaurant order', async () => {
    cancelRow = { ...cancelRow, restaurantId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' };
    await expectTrpcError(
      () => callers.restaurant().order.cancelOrder({ orderId: IDS.order, reason: 'Not ours' }),
      'FORBIDDEN'
    );
    cancelRow = { ...cancelRow, restaurantId: IDS.restaurant };
  });

  await suite.test('kitchen cannot cancel after dispatch', async () => {
    cancelRow = { ...cancelRow, status: OrderStatus.OUT_FOR_DELIVERY };
    await expectTrpcError(
      () => callers.restaurant().order.cancelOrder({ orderId: IDS.order, reason: 'Too late' }),
      'PRECONDITION_FAILED'
    );
  });

  await suite.test('admin can force-cancel active orders as SYSTEM', async () => {
    cancelRow = { ...cancelRow, status: OrderStatus.PREPARING };
    const result = await callers.admin().order.cancelOrder({ orderId: IDS.order, reason: 'Ops intervention' });
    assert.equal(result.status, OrderStatus.CANCELLED_BY_SYSTEM);
  });

  await suite.test('admin cannot cancel finalized orders', async () => {
    cancelRow = { ...cancelRow, status: OrderStatus.DELIVERED };
    await expectTrpcError(
      () => callers.admin().order.cancelOrder({ orderId: IDS.order, reason: 'Too late' }),
      'PRECONDITION_FAILED'
    );
    cancelRow = { ...cancelRow, status: OrderStatus.CANCELLED_BY_SYSTEM };
    await expectTrpcError(
      () => callers.admin().order.cancelOrder({ orderId: IDS.order, reason: 'Again' }),
      'PRECONDITION_FAILED'
    );
  });

  await suite.test('riders cannot cancel orders', async () => {
    cancelRow = { ...cancelRow, status: OrderStatus.RIDER_ASSIGNED };
    await expectTrpcError(
      () => callers.rider().order.cancelOrder({ orderId: IDS.order, reason: 'Cannot deliver' }),
      'FORBIDDEN'
    );
  });

  await suite.test('double-cancel race produces CONFLICT', async () => {
    cancelRow = { ...cancelRow, status: OrderStatus.PAID };
    cancelRowCount = 0;
    await expectTrpcError(
      () => callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'Race' }),
      'CONFLICT'
    );
    cancelRowCount = 1;
  });

  await suite.test('cancelling releases the assigned rider', async () => {
    cancelRow = { ...cancelRow, status: OrderStatus.RIDER_ASSIGNED, riderId: IDS.rider };
    mockDb.clearLog();
    await callers.admin().order.cancelOrder({ orderId: IDS.order, reason: 'Ops release' });
    assert.ok(mockDb.calls(/UPDATE rider_profiles/i).length > 0);
  });

  await suite.test('unknown orders cannot be cancelled', async () => {
    cancelRow = null;
    await expectTrpcError(
      () => callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'Missing' }),
      'NOT_FOUND'
    );
    cancelRow = { ...cancelRow, status: OrderStatus.PAID };
  });
});
