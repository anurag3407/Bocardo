import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { OrderStatus } from '../../packages/shared-types/src';
import { paymentService } from '../../apps/api/src/services/payment';
import { installPlatformDoubles, MockDb } from '../harness/db';
import { IDS } from '../harness/trpc';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Payment Webhook Processors');

async function expectRejects(operation: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(operation, pattern);
}

runSuite(suite, async () => {
  let processedRowCount = 1;
  let orderRow: any = {
    id: IDS.order,
    restaurant_id: IDS.restaurant,
    status: OrderStatus.PAYMENT_PENDING,
    total_amount_paise: '38910',
  };
  let failedRowCount = 1;

  let mockDb: MockDb;
  mockDb = installPlatformDoubles()
    .on(/INSERT INTO processed_webhooks/i, () => ({
      rows: processedRowCount ? [{ event_id: 'event_x' }] : [],
      rowCount: processedRowCount,
    }))
    .on(/FROM orders WHERE razorpay_order_id = \$1 FOR UPDATE/i, () =>
      orderRow ? { rows: [orderRow], rowCount: 1 } : { rows: [], rowCount: 0 }
    )
    .on(/UPDATE orders\s+SET status = \$1, razorpay_payment_id = \$2/i, () => ({ rows: [], rowCount: 1 }))
    .on(/INSERT INTO realtime_outbox/i, () => ({ rows: [], rowCount: 1 }))
    .on(/UPDATE orders\s+SET status = \$1, cancel_reason = \$2, updated_at = NOW\(\)\s+WHERE razorpay_order_id/i, () => ({
      rows: failedRowCount ? [{ id: IDS.order }] : [],
      rowCount: failedRowCount,
    }));

  const capturedPayload = (overrides: Record<string, unknown> = {}) => ({
    payload: {
      payment: {
        entity: { id: 'pay_x', order_id: 'order_x', amount: 38910, currency: 'INR', status: 'captured', ...overrides },
      },
    },
  });

  // ---------------- payment.captured ----------------
  await suite.test('duplicate captured events are idempotent', async () => {
    processedRowCount = 0;
    mockDb.clearLog();
    const result = await paymentService.processPaymentCapturedWebhook('event_dup', 'order_x', 'pay_x', capturedPayload());
    assert.deepEqual(result, { success: true, alreadyProcessed: true });
    assert.equal(mockDb.calls(/UPDATE orders\s+SET status = \$1, razorpay_payment_id/i).length, 0);
    processedRowCount = 1;
  });

  await suite.test('unknown payment orders raise for reconciliation', async () => {
    orderRow = null;
    await expectRejects(
      () => paymentService.processPaymentCapturedWebhook('event_1', 'order_missing', 'pay_x', capturedPayload()),
      /not available for reconciliation/
    );
    orderRow = { id: IDS.order, restaurant_id: IDS.restaurant, status: OrderStatus.PAYMENT_PENDING, total_amount_paise: '38910' };
  });

  await suite.test('amount, currency and status must match the order', async () => {
    await expectRejects(
      () => paymentService.processPaymentCapturedWebhook('event_2', 'order_x', 'pay_x', capturedPayload({ amount: 1 })),
      /does not match/
    );
    await expectRejects(
      () => paymentService.processPaymentCapturedWebhook('event_3', 'order_x', 'pay_x', capturedPayload({ currency: 'USD' })),
      /does not match/
    );
    await expectRejects(
      () => paymentService.processPaymentCapturedWebhook('event_4', 'order_x', 'pay_x', capturedPayload({ status: 'authorized' })),
      /does not match/
    );
  });

  await suite.test('a captured payment advances PAYMENT_PENDING to PAID and notifies the kitchen', async () => {
    orderRow.status = OrderStatus.PAYMENT_PENDING;
    processedRowCount = 1;
    mockDb.clearLog();
    const result = await paymentService.processPaymentCapturedWebhook('event_ok', 'order_x', 'pay_ok', capturedPayload());
    assert.deepEqual(result, { success: true, alreadyProcessed: false });

    const update = mockDb.calls(/UPDATE orders\s+SET status = \$1, razorpay_payment_id = \$2/i)[0];
    assert.deepEqual(update.params, [OrderStatus.PAID, 'pay_ok', IDS.order]);
    const outbox = mockDb.calls(/INSERT INTO realtime_outbox/i)[0];
    assert.match(outbox.params[0], /^restaurant:/);
    assert.equal(outbox.params[1], 'restaurant:new_order');
  });

  await suite.test('already-paid orders are not double-counted', async () => {
    orderRow.status = OrderStatus.PAID;
    mockDb.clearLog();
    const result = await paymentService.processPaymentCapturedWebhook('event_late', 'order_x', 'pay_ok', capturedPayload());
    assert.deepEqual(result, { success: true, alreadyProcessed: false });
    assert.equal(mockDb.calls(/UPDATE orders\s+SET status = \$1, razorpay_payment_id/i).length, 0);
    assert.equal(mockDb.calls(/INSERT INTO realtime_outbox/i).length, 0);
    orderRow.status = OrderStatus.PAYMENT_PENDING;
  });

  // ---------------- payment.failed ----------------
  await suite.test('duplicate failed events are idempotent', async () => {
    processedRowCount = 0;
    mockDb.clearLog();
    const result = await paymentService.processPaymentFailedWebhook('event_fdup', 'order_x', {});
    assert.deepEqual(result, { success: true, alreadyProcessed: true });
    assert.equal(mockDb.calls(/cancel_reason = \$2, updated_at = NOW\(\)/i).length, 0);
    processedRowCount = 1;
  });

  await suite.test('a failed payment cancels only PAYMENT_PENDING orders', async () => {
    failedRowCount = 1;
    mockDb.clearLog();
    const result = await paymentService.processPaymentFailedWebhook('event_f1', 'order_x', {});
    assert.deepEqual(result, { success: true, alreadyProcessed: false });
    const update = mockDb.calls(/cancel_reason = \$2, updated_at = NOW\(\)/i)[0];
    assert.deepEqual(update.params.slice(0, 2), [OrderStatus.CANCELLED_BY_SYSTEM, 'Payment failed at checkout']);
    assert.ok(mockDb.calls(/INSERT INTO realtime_outbox/i).length > 0);
  });

  await suite.test('a failed payment on an already-advanced order is a no-op', async () => {
    failedRowCount = 0;
    mockDb.clearLog();
    const result = await paymentService.processPaymentFailedWebhook('event_f2', 'order_x', {});
    assert.deepEqual(result, { success: true, alreadyProcessed: false });
    assert.equal(mockDb.calls(/INSERT INTO realtime_outbox/i).length, 0);
    failedRowCount = 1;
  });

  // ---------------- refunds ----------------
  await suite.test('refunds are issued through Razorpay in the mock/dev flow', async () => {
    const refund = await paymentService.refundPayment('pay_captured', 38910, { reason: 'Restaurant non-responsive within 120 seconds' });
    assert.equal(refund.status, 'processed');
    assert.equal(refund.amount, 38910);
  });

  await suite.test('refunds require a captured payment id', async () => {
    await assert.rejects(() => paymentService.refundPayment('', 1000, { reason: 'x' }), /captured payment is required/);
  });

  // ---------------- signature wrapper ----------------
  await suite.test('verifyWebhookSignature uses the configured webhook secret', () => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    assert.ok(secret, 'RAZORPAY_WEBHOOK_SECRET must be set for tests');
    const body = '{"event":"payment.captured"}';
    assert.equal(
      paymentService.verifyWebhookSignature(body, crypto.createHmac('sha256', secret!).update(body).digest('hex')),
      true
    );
    assert.equal(paymentService.verifyWebhookSignature(body, 'a'.repeat(64)), false);
    assert.equal(paymentService.verifyWebhookSignature(body, 'not-a-signature'), false);
  });
});
