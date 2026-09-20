import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { OrderStatus } from '../../packages/shared-types/src';
import { paymentService } from '../../apps/api/src/services/payment';
import { redisService } from '../../apps/api/src/services/redis';
import { installPlatformDoubles, MockDb } from '../harness/db';
import { callers, IDS } from '../harness/trpc';
import { expectTrpcError, Suite, runSuite } from '../harness/suite';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.ALLOW_MOCK_PAYMENTS = process.env.ALLOW_MOCK_PAYMENTS || 'true';

const suite = new Suite('Integration Hardening errors access-control lifecycle payments');

const DISH = { id: IDS.dishA, name: 'Hardening Biryani', price_paise: 32000, is_available: true, restaurant_id: IDS.restaurant };

function checkoutInput(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId: IDS.restaurant,
    items: [{ dishId: IDS.dishA, quantity: 1 }],
    deliveryLatitude: 12.9716,
    deliveryLongitude: 77.6408,
    deliveryAddress: '42, 100 Feet Road, Indiranagar, Bengaluru',
    ...overrides,
  };
}
runSuite(suite, async () => {
  let restaurantActive = { is_active: true, is_accepting_orders: true };
  let failRazorpayCreate = false;
  let statusRow: any = null;
  let statusUpdateCount = 1;
  let otpRow: any = null;
  let attemptCount = 1;
  let cancelRow: any = null;
  let cancelUpdateCount = 1;
  let refundShouldThrow = false;
  let getByIdRow: any = null;
  let capturedOrderRow: any = { id: IDS.order, restaurant_id: IDS.restaurant, status: OrderStatus.PAYMENT_PENDING, total_amount_paise: '38910' };
  let capturedDedup = 1;
  let profileRow: any = null;
  let reconcileCount = 1;
  let ledgerAgg: any[] = [];

  const mockDb: MockDb = installPlatformDoubles()
    .on(/JOIN users u ON o\.customer_id/i, () => (getByIdRow ? { rows: [getByIdRow], rowCount: 1 } : { rows: [], rowCount: 0 }))
    .on(/SELECT id, status, delivery_otp, rider_id, otp_attempts FROM orders/i, () => (otpRow ? { rows: [otpRow], rowCount: 1 } : { rows: [], rowCount: 0 }))
    .on(/SELECT id, restaurant_id, rider_id, status FROM orders/i, () => (statusRow ? { rows: [statusRow], rowCount: 1 } : { rows: [], rowCount: 0 }))
    .on(/SELECT id, customer_id as "customerId"/i, () => (cancelRow ? { rows: [cancelRow], rowCount: 1 } : { rows: [], rowCount: 0 }))
    .on(/WHERE o\.customer_id = \$1/i, () => ({ rows: [{ id: IDS.order, status: OrderStatus.PAID }], rowCount: 1 }))
    .on(/is_active, is_accepting_orders FROM restaurants/i, () => ({ rows: [restaurantActive], rowCount: 1 }))
    .on(/FROM dishes\s+WHERE id = ANY/i, () => ({ rows: [{ ...DISH }], rowCount: 1 }))
    .on(/INSERT INTO orders/i, () => ({ rows: [{ id: IDS.order }], rowCount: 1 }))
    .on(/INSERT INTO order_items/i, () => ({ rows: [], rowCount: 1 }))
    .on(/dish_pair_associations|FROM order_items oi1/i, () => ({ rows: [], rowCount: 0 }))
    .on(/UPDATE orders\s+SET razorpay_order_id/i, () => ({ rows: [], rowCount: 1 }))
    .on(/UPDATE orders SET status = \$1, updated_at = NOW\(\) WHERE id = \$2 AND status = \$3/i, () => ({ rows: statusUpdateCount ? [{ id: IDS.order }] : [], rowCount: statusUpdateCount }))
    .on(/SELECT ST_DWithin/i, () => ({ rows: [{ arrived: true }], rowCount: 1 }))
    .on(/UPDATE orders SET otp_attempts/i, () => ({ rows: attemptCount ? [{ id: IDS.order }] : [], rowCount: attemptCount }))
    .on(/delivered_at = NOW\(\)/i, () => ({ rows: [], rowCount: 1 }))
    .on(/UPDATE orders SET status = \$1, cancel_reason/i, () => ({ rows: cancelUpdateCount ? [{ id: IDS.order }] : [], rowCount: cancelUpdateCount }))
    .on(/INSERT INTO processed_webhooks/i, () => ({ rows: capturedDedup ? [{ event_id: 'evt' }] : [], rowCount: capturedDedup }))
    .on(/FROM orders WHERE razorpay_order_id = \$1 FOR UPDATE/i, () => (capturedOrderRow ? { rows: [capturedOrderRow], rowCount: 1 } : { rows: [], rowCount: 0 }))
    .on(/UPDATE orders\s+SET status = \$1, razorpay_payment_id = \$2/i, () => ({ rows: [], rowCount: 1 }))
    .on(/INSERT INTO realtime_outbox/i, () => ({ rows: [], rowCount: 1 }))
    .on(/INSERT INTO rider_profiles/i, () => ({ rows: [{ userId: "r", isOnline: false, rating: 5 }], rowCount: 1 }))
    .on(/UPDATE rider_profiles/i, () => ({ rows: [], rowCount: 1 }))
    .on(/FROM rider_profiles rp\s+JOIN users u/i, () => (profileRow ? { rows: [profileRow], rowCount: 1 } : { rows: [], rowCount: 0 }))
    .on(/FROM restaurants r\s+WHERE r\.is_active/i, () => ({ rows: [{ id: IDS.restaurant, name: 'K' }], rowCount: 1 }))
    .on(/UPDATE restaurants SET is_accepting_orders/i, () => ({ rows: [], rowCount: 1 }))
    .on(/SUM\(o\.subtotal_paise\) as total_subtotal_paise/i, () => ({ rows: ledgerAgg, rowCount: ledgerAgg.length }))
    .on(/INSERT INTO settlements/i, () => ({ rows: [{ id: crypto.randomUUID() }], rowCount: 1 }))
    .on(/UPDATE settlements\s+SET status = 'PAID'/i, () => ({ rows: reconcileCount ? [{ id: IDS.settlement }] : [], rowCount: reconcileCount }))
    .on(/FROM settlements s\s+LEFT JOIN restaurants r/i, () => ({ rows: [], rowCount: 0 }));
  const realCreateOrder = paymentService.createOrder;
  const realRefund = paymentService.refundPayment;
  (paymentService as any).createOrder = async (orderId: string, amount: number) => {
    if (failRazorpayCreate) throw new Error('Razorpay gateway unavailable');
    return realCreateOrder(orderId, amount);
  };
  (paymentService as any).refundPayment = async (paymentId: string, amount: number, notes: any) => {
    if (refundShouldThrow) throw new Error('Refund gateway exploded');
    return realRefund(paymentId, amount, notes);
  };

  const riderLocKey = `rider:loc:${IDS.rider}`;
  async function freshGps() {
    await redisService.set(riderLocKey, JSON.stringify({ longitude: 77.6408, latitude: 12.9716, updatedAt: Date.now(), accuracy: 10 }));
  }

  await suite.test('checkout rejects empty carts bad coords and bad quantities', async () => {
    await expectTrpcError(() => callers.customer().order.create(checkoutInput({ items: [] })), 'BAD_REQUEST');
    await expectTrpcError(() => callers.customer().order.create(checkoutInput({ deliveryLatitude: 91 })), 'BAD_REQUEST');
    await expectTrpcError(() => callers.customer().order.create(checkoutInput({ items: [{ dishId: IDS.dishA, quantity: 0 }] })), 'BAD_REQUEST');
    await expectTrpcError(() => callers.customer().order.create(checkoutInput({ items: [{ dishId: IDS.dishA, quantity: 51 }] })), 'BAD_REQUEST');
    await expectTrpcError(() => callers.customer().order.create(checkoutInput({ deliveryAddress: 'ab' })), 'BAD_REQUEST');
    await expectTrpcError(() => callers.customer().order.create(checkoutInput({ specialInstructions: 'x'.repeat(251) })), 'BAD_REQUEST');
    await expectTrpcError(() => callers.customer().order.create(checkoutInput({ restaurantId: 'nope' as any })), 'BAD_REQUEST');
  });

  await suite.test('checkout releases cart lock when Razorpay create fails', async () => {
    failRazorpayCreate = true;
    try {
      await expectTrpcError(() => callers.customer().order.create(checkoutInput()), 'INTERNAL_SERVER_ERROR');
      assert.equal(await redisService.get(`lock:cart:${IDS.customer}`), null);
    } finally {
      failRazorpayCreate = false;
      await redisService.releaseLock(`lock:cart:${IDS.customer}`);
    }
  });

  await suite.test('checkout surfaces missing restaurant as failed precondition', async () => {
    restaurantActive = { is_active: false, is_accepting_orders: false };
    await expectTrpcError(() => callers.customer().order.create(checkoutInput()), 'PRECONDITION_FAILED');
    restaurantActive = { is_active: true, is_accepting_orders: true };
  });

  await suite.test('anonymous callers rejected on protected mutations', async () => {
    await expectTrpcError(() => callers.anonymous().order.create(checkoutInput()), 'UNAUTHORIZED');
    await expectTrpcError(() => callers.anonymous().order.cancelOrder({ orderId: IDS.order, reason: 'nope nope' }), 'UNAUTHORIZED');
    await expectTrpcError(() => callers.anonymous().rider.getProfile(), 'UNAUTHORIZED');
  });

  await suite.test('auth.me echoes identity and role gates hold', async () => {
    const me = await callers.customer().auth.me();
    assert.equal(me.id, IDS.customer);
    await expectTrpcError(() => callers.customer().rider.toggleDuty({ isOnline: true }), 'FORBIDDEN');
    await expectTrpcError(() => callers.customer().settlement.listSettlements({}), 'FORBIDDEN');
    await expectTrpcError(() => callers.rider().settlement.listSettlements({}), 'FORBIDDEN');
  });
  await suite.test('updateStatus rejects unknown orders and invalid enums', async () => {
    statusRow = null;
    await expectTrpcError(() => callers.restaurant().order.updateStatus({ orderId: IDS.order, status: OrderStatus.ACCEPTED_BY_KITCHEN }), 'NOT_FOUND');
    await expectTrpcError(() => callers.restaurant().order.updateStatus({ orderId: IDS.order, status: 'NOPE' as any }), 'BAD_REQUEST');
    await expectTrpcError(() => callers.restaurant().order.updateStatus({ orderId: 'bad' as any, status: OrderStatus.PAID }), 'BAD_REQUEST');
  });

  await suite.test('customers can never drive the state machine', async () => {
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: null, status: OrderStatus.PAID };
    await expectTrpcError(() => callers.customer().order.updateStatus({ orderId: IDS.order, status: OrderStatus.ACCEPTED_BY_KITCHEN }), 'FORBIDDEN');
  });

  await suite.test('rider pickup requires assignment to calling rider', async () => {
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: OrderStatus.READY_FOR_PICKUP };
    await expectTrpcError(() => callers.rider().order.updateStatus({ orderId: IDS.order, status: OrderStatus.RIDER_ASSIGNED }), 'FORBIDDEN');
  });

  await suite.test('READY_FOR_PICKUP fans out to dispatch', async () => {
    const { sequentialDispatchWorker } = await import('../../apps/api/src/workers/sequentialDispatchWorker');
    statusRow = { id: IDS.order, restaurant_id: IDS.restaurant, rider_id: null, status: OrderStatus.PREPARING };
    statusUpdateCount = 1;
    let dispatched = 0;
    const orig = sequentialDispatchWorker.dispatchNextRider;
    (sequentialDispatchWorker as any).dispatchNextRider = async (...a: any[]) => { dispatched += 1; return orig(...(a as [string])); };
    try {
      const res = await callers.restaurant().order.updateStatus({ orderId: IDS.order, status: OrderStatus.READY_FOR_PICKUP });
      assert.equal(res.status, OrderStatus.READY_FOR_PICKUP);
      assert.equal(dispatched, 1);
    } finally {
      (sequentialDispatchWorker as any).dispatchNextRider = orig;
    }
  });

  await suite.test('OTP schema rejects malformed codes before database work', async () => {
    mockDb.clearLog();
    await expectTrpcError(() => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '12' }), 'BAD_REQUEST');
    await expectTrpcError(() => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: 'abcd' }), 'BAD_REQUEST');
    await expectTrpcError(() => callers.customer().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '1234' }), 'FORBIDDEN');
    assert.equal(mockDb.calls(/delivery_otp/i).length, 0);
  });

  await suite.test('corrupt rider GPS payloads fail closed', async () => {
    otpRow = { id: IDS.order, status: OrderStatus.OUT_FOR_DELIVERY, delivery_otp: '4819', rider_id: IDS.rider, otp_attempts: 0 };
    attemptCount = 1;
    await redisService.set(riderLocKey, 'not-json{{{');
    try {
      let threw = false;
      try { await callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }); } catch { threw = true; }
      assert.equal(threw, true);
    } finally { await redisService.del(riderLocKey); }
  });

  await suite.test('missing GPS accuracy treated as untrusted', async () => {
    otpRow = { id: IDS.order, status: OrderStatus.OUT_FOR_DELIVERY, delivery_otp: '4819', rider_id: IDS.rider, otp_attempts: 0 };
    attemptCount = 1;
    await redisService.set(riderLocKey, JSON.stringify({ longitude: 77.6408, latitude: 12.9716, updatedAt: Date.now() }));
    try {
      await expectTrpcError(() => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }), 'PRECONDITION_FAILED');
    } finally { await redisService.del(riderLocKey); }
  });

  await suite.test('OTP exhaustion surfaces TOO_MANY_REQUESTS', async () => {
    otpRow = { id: IDS.order, status: OrderStatus.OUT_FOR_DELIVERY, delivery_otp: '4819', rider_id: IDS.rider, otp_attempts: 5 };
    attemptCount = 0;
    await freshGps();
    try {
      await expectTrpcError(() => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '4819' }), 'TOO_MANY_REQUESTS');
    } finally { attemptCount = 1; await redisService.del(riderLocKey); }
  });

  await suite.test('wrong OTP is BAD_REQUEST', async () => {
    otpRow = { id: IDS.order, status: OrderStatus.OUT_FOR_DELIVERY, delivery_otp: '4819', rider_id: IDS.rider, otp_attempts: 0 };
    attemptCount = 1;
    await freshGps();
    try {
      const err = await expectTrpcError(() => callers.rider().order.verifyDeliveryOtp({ orderId: IDS.order, otp: '0000' }), 'BAD_REQUEST');
      assert.match(err.message, /OTP/i);
    } finally { await redisService.del(riderLocKey); }
  });
  await suite.test('cancel reason length validated', async () => {
    await expectTrpcError(() => callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'x' }), 'BAD_REQUEST');
    await expectTrpcError(() => callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'x'.repeat(251) }), 'BAD_REQUEST');
  });

  await suite.test('cancel on missing order is NOT_FOUND', async () => {
    cancelRow = null;
    await expectTrpcError(() => callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'changed mind ok' }), 'NOT_FOUND');
  });

  await suite.test('refund gateway failure surfaces INTERNAL_SERVER_ERROR', async () => {
    cancelRow = { id: IDS.order, customerId: IDS.customer, restaurantId: IDS.restaurant, riderId: null, status: OrderStatus.PAID, totalAmountPaise: 38910, razorpayPaymentId: 'pay_ok' };
    cancelUpdateCount = 1;
    refundShouldThrow = true;
    try {
      const err = await expectTrpcError(() => callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'changed mind ok' }), 'INTERNAL_SERVER_ERROR');
      assert.match(err.message, /refund/i);
    } finally { refundShouldThrow = false; }
  });

  await suite.test('cancel without captured payment skips refund', async () => {
    cancelRow = { id: IDS.order, customerId: IDS.customer, restaurantId: IDS.restaurant, riderId: null, status: OrderStatus.PAID, totalAmountPaise: 38910, razorpayPaymentId: null };
    cancelUpdateCount = 1;
    const res = await callers.customer().order.cancelOrder({ orderId: IDS.order, reason: 'changed mind ok' });
    assert.equal(res.refundInitiated, false);
  });

  await suite.test('getById missing is NOT_FOUND and lists are scoped', async () => {
    getByIdRow = null;
    await expectTrpcError(() => callers.customer().order.getById({ orderId: IDS.order }), 'NOT_FOUND');
    mockDb.clearLog();
    await callers.customer().order.listMyOrders();
    const mine = mockDb.calls(/WHERE o\.customer_id = \$1/i)[0];
    assert.equal(mine.params[0], IDS.customer);
    const scoped = await callers.restaurant({ restaurantId: null }).order.listRestaurantOrders();
    assert.deepEqual(scoped, []);
  });

  await suite.test('captured webhook rejects amount currency status mismatches', async () => {
    capturedOrderRow = { id: IDS.order, restaurant_id: IDS.restaurant, status: OrderStatus.PAYMENT_PENDING, total_amount_paise: '38910' };
    capturedDedup = 1;
    const base = { id: 'pay_x', order_id: 'order_x', currency: 'INR', status: 'captured' };
    await assert.rejects(() => paymentService.processPaymentCapturedWebhook('e1', 'order_x', 'pay_x', { payload: { payment: { entity: { ...base, amount: 1 } } } }), /does not match/);
    await assert.rejects(() => paymentService.processPaymentCapturedWebhook('e2', 'order_x', 'pay_x', { payload: { payment: { entity: { ...base, amount: 38910, currency: 'USD' } } } }), /does not match/);
    await assert.rejects(() => paymentService.processPaymentCapturedWebhook('e3', 'order_x', 'pay_x', { payload: { payment: { entity: { ...base, amount: 38910, status: 'authorized' } } } }), /does not match/);
  });

  await suite.test('failed webhook idempotent path short-circuits', async () => {
    capturedDedup = 0;
    mockDb.clearLog();
    const dup = await paymentService.processPaymentFailedWebhook('e-dup', 'order_x', {});
    assert.deepEqual(dup, { success: true, alreadyProcessed: true });
    capturedDedup = 1;
  });

  await suite.test('rider profile auto-creates and duty toggle writes flag', async () => {
    profileRow = null;
    const created = await callers.rider().rider.getProfile();
    assert.equal(created.isOnline ?? false, false);
    mockDb.clearLog();
    const toggled = await callers.rider().rider.toggleDuty({ isOnline: true });
    assert.deepEqual(toggled, { success: true, isOnline: true });
    assert.ok(mockDb.calls(/UPDATE rider_profiles/i).length > 0);
  });

  await suite.test('restaurant search and list validation rejects weak input', async () => {
    await expectTrpcError(() => callers.anonymous().restaurant.search({ query: 'x' }), 'BAD_REQUEST');
    await expectTrpcError(() => callers.anonymous().restaurant.listNearby({ latitude: 95, longitude: 0 }), 'BAD_REQUEST');
    await expectTrpcError(() => callers.restaurant({ restaurantId: null }).restaurant.toggleAcceptingOrders({ restaurantId: IDS.restaurant, isAcceptingOrders: true }), 'FORBIDDEN');
  });

  await suite.test('weekly ledger empty is no-op without inserts', async () => {
    ledgerAgg = [];
    mockDb.clearLog();
    const res = await callers.admin().settlement.generateWeeklyLedger();
    assert.equal(res.generatedCount, 0);
    assert.equal(mockDb.calls(/INSERT INTO settlements/i).length, 0);
  });

  await suite.test('settlement reconcile validates UTR and unknown ids', async () => {
    await expectTrpcError(() => callers.admin().settlement.reconcileWithUtr({ settlementId: IDS.settlement, bankUtrReference: 'x' }), 'BAD_REQUEST');
    reconcileCount = 0;
    await expectTrpcError(() => callers.admin().settlement.reconcileWithUtr({ settlementId: IDS.settlement, bankUtrReference: 'UTR123456' }), 'NOT_FOUND');
    reconcileCount = 1;
    await expectTrpcError(() => callers.customer().settlement.reconcileWithUtr({ settlementId: IDS.settlement, bankUtrReference: 'UTR123456' }), 'FORBIDDEN');
  });

  await suite.test('recommendation inputs reject malformed shapes', async () => {
    await expectTrpcError(() => callers.anonymous().recommendations.trendingNearYou({ latitude: 12.9, longitude: 77.6, limit: 99 as any }), 'BAD_REQUEST');
    await expectTrpcError(() => callers.anonymous().recommendations.frequentlyBoughtTogether({ dishIds: [], restaurantId: IDS.restaurant }), 'BAD_REQUEST');
    await expectTrpcError(() => callers.anonymous().recommendations.frequentlyBoughtTogether({ dishIds: ['bad' as any] }), 'BAD_REQUEST');
  });

  await redisService.del(riderLocKey);
  await redisService.del(`lock:cart:${IDS.customer}`);
});
