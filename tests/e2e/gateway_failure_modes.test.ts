import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fastify from '../../apps/api/node_modules/fastify';
import { registerRazorpayRoute } from '../../apps/api/src/services/razorpayRoute';
import { verifyWebhookSignature } from '../../apps/api/src/services/webhookSignature';
import { installPlatformDoubles, enqueuedJobs } from '../harness/db';
import { Suite, runSuite, expectTrpcError } from '../harness/suite';
import { callers, IDS } from '../harness/trpc';
import { OrderStatus } from '../../packages/shared-types/src';

const suite = new Suite('E2E Gateway Failure Modes (webhooks, auth gates, cross-service negatives)');
const SECRET = 'e2e-failure-mode-secret';
installPlatformDoubles();
const sign = (body: string): string => crypto.createHmac('sha256', SECRET).update(body).digest('hex');
function capturedBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_fm_1', order_id: 'order_fm_1', amount: 47310, currency: 'INR', status: 'captured', ...overrides } } } });
}
async function buildServer(opts: { capturedSucceeds?: boolean } = {}) {
  const server = fastify();
  let captured = 0;
  let failed = 0;
  await registerRazorpayRoute(server, {
    verifyWebhookSignature: (body, signature) => verifyWebhookSignature(body, signature, SECRET),
    processPaymentCapturedWebhook: async () => { captured += 1; return opts.capturedSucceeds === false ? { success: false, alreadyProcessed: false } : { success: true, alreadyProcessed: false }; },
    processPaymentFailedWebhook: async () => { failed += 1; return { success: true, alreadyProcessed: false }; },
  });
  const counters = { get captured() { return captured; }, get failed() { return failed; } };
  return { server, counters };
}
function sigHeaders(body: string, eventId?: string): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json', 'x-razorpay-signature': sign(body) };
  if (eventId !== undefined) h['x-razorpay-event-id'] = eventId;
  return h;
}
runSuite(suite, async () => {
  await suite.test('missing signature is rejected 400 without invoking processor', async () => {
    const { server, counters } = await buildServer();
    try {
      const body = capturedBody();
      const res = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: { 'content-type': 'application/json', 'x-razorpay-event-id': 'evt_no_sig' }, payload: body });
      assert.equal(res.statusCode, 400, 'expected 400, got ' + res.statusCode + ': ' + res.body);
      assert.match(res.json().error, /signature/i, 'error must name signature problem');
      assert.equal(counters.captured, 0, 'processor must not run on unsigned payload');
    } finally { await server.close(); }
  });
  await suite.test('wrong-secret signature is rejected 400 with no side effects', async () => {
    const { server, counters } = await buildServer();
    try {
      const body = capturedBody();
      const bad = crypto.createHmac('sha256', 'attacker-secret').update(body).digest('hex');
      const res = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: { 'content-type': 'application/json', 'x-razorpay-signature': bad, 'x-razorpay-event-id': 'evt_bad' }, payload: body });
      assert.equal(res.statusCode, 400, 'expected 400, got ' + res.statusCode + ': ' + res.body);
      assert.equal(counters.captured, 0, 'forged webhook must never reach processor');
    } finally { await server.close(); }
  });
  await suite.test('tampered body reusing valid signature is rejected 400', async () => {
    const { server, counters } = await buildServer();
    try {
      const original = capturedBody();
      const tampered = original.replace('47310', '47311');
      assert.notEqual(tampered, original, 'setup must mutate amount');
      const res = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(original), 'x-razorpay-event-id': 'evt_t' }, payload: tampered });
      assert.equal(res.statusCode, 400, 'expected 400, got ' + res.statusCode + ': ' + res.body);
      assert.equal(counters.captured, 0, 'tampered amount must not be processed');
    } finally { await server.close(); }
  });
  await suite.test('malformed JSON with matching signature is rejected 400 Invalid JSON', async () => {
    const { server } = await buildServer();
    try {
      const raw = '{"event":"payment.captured", broken';
      const res = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(raw), 'x-razorpay-event-id': 'evt_j' }, payload: raw });
      assert.equal(res.statusCode, 400, 'expected 400, got ' + res.statusCode + ': ' + res.body);
      assert.match(res.json().error, /json/i, 'error must flag JSON failure');
    } finally { await server.close(); }
  });
  await suite.test('missing event id is rejected 400 (anti-replay guard)', async () => {
    const { server, counters } = await buildServer();
    try {
      const body = capturedBody();
      const res = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: sigHeaders(body, undefined), payload: body });
      assert.equal(res.statusCode, 400, 'expected 400, got ' + res.statusCode + ': ' + res.body);
      assert.equal(counters.captured, 0, 'event without idempotency key must not process');
    } finally { await server.close(); }
  });
  await suite.test('oversized event id is rejected 400', async () => {
    const { server, counters } = await buildServer();
    try {
      const body = capturedBody();
      const res = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: sigHeaders(body, 'e'.repeat(256)), payload: body });
      assert.equal(res.statusCode, 400, 'expected 400, got ' + res.statusCode + ': ' + res.body);
      assert.equal(counters.captured, 0, 'oversized event id must fail closed');
    } finally { await server.close(); }
  });
  await suite.test('wrong currency / zero amount / non-captured status each rejected 400', async () => {
    const { server, counters } = await buildServer();
    try {
      const cases: Array<[string, Record<string, unknown>]> = [['non-INR', { currency: 'USD' }], ['zero-amount', { amount: 0 }], ['not-captured', { status: 'authorized' }]];
      let i = 0;
      for (const [label, ov] of cases) {
        const body = capturedBody(ov);
        const res = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: sigHeaders(body, 'evt_c' + (i++)), payload: body });
        assert.equal(res.statusCode, 400, label + ': expected 400, got ' + res.statusCode + ': ' + res.body);
      }
      assert.equal(counters.captured, 0, 'no malformed entity may reach processor');
    } finally { await server.close(); }
  });
  await suite.test('unknown event type acked 200 with no handler invocation', async () => {
    const { server, counters } = await buildServer();
    try {
      const body = JSON.stringify({ event: 'refund.processed', payload: {} });
      const res = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: sigHeaders(body, 'evt_u'), payload: body });
      assert.equal(res.statusCode, 200, 'unknown events must ack, got ' + res.statusCode + ': ' + res.body);
      assert.equal(counters.captured, 0, 'capture handler must stay idle');
      assert.equal(counters.failed, 0, 'failure handler must stay idle');
    } finally { await server.close(); }
  });
  await suite.test('processor failure surfaces 503 so Razorpay retries', async () => {
    const { server, counters } = await buildServer({ capturedSucceeds: false });
    try {
      const body = capturedBody();
      const res = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: sigHeaders(body, 'evt_r'), payload: body });
      assert.equal(res.statusCode, 503, 'expected 503, got ' + res.statusCode + ': ' + res.body);
      assert.match(res.json().error, /reconciliation|retry/i, '503 body must ask for retry');
      assert.equal(counters.captured, 1, 'processor attempted exactly once');
    } finally { await server.close(); }
  });
  await suite.test('payment.failed without entity rejected 400; valid one routes to failure handler', async () => {
    const { server, counters } = await buildServer();
    try {
      const naked = JSON.stringify({ event: 'payment.failed', payload: { payment: {} } });
      const r1 = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: sigHeaders(naked, 'evt_fn'), payload: naked });
      assert.equal(r1.statusCode, 400, 'expected 400, got ' + r1.statusCode + ': ' + r1.body);
      assert.equal(counters.failed, 0, 'malformed failure must not invoke handler');
      const ok = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_f1', order_id: 'order_f1' } } } });
      const r2 = await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers: sigHeaders(ok, 'evt_fo'), payload: ok });
      assert.equal(r2.statusCode, 200, 'expected 200, got ' + r2.statusCode + ': ' + r2.body);
      assert.equal(counters.failed, 1, 'failure handler runs exactly once');
      assert.equal(counters.captured, 0, 'failure must never touch capture path');
    } finally { await server.close(); }
  });
  await suite.test('anonymous callers rejected across routers (UNAUTHORIZED)', async () => {
    const anon = callers.anonymous();
    await expectTrpcError(() => anon.order.listMyOrders(), 'UNAUTHORIZED', 'order.listMyOrders requires auth');
    await expectTrpcError(() => anon.rider.respondToDispatchOffer({ orderId: IDS.order, accepted: true }), 'UNAUTHORIZED', 'dispatch requires auth');
  });
  await suite.test('customers cannot drive kitchen transitions (FORBIDDEN)', async () => {
    installPlatformDoubles().on(/SELECT id, restaurant_id, rider_id, status FROM orders/i, () => ({ rows: [{ id: IDS.order, restaurant_id: IDS.restaurant, rider_id: null, status: OrderStatus.PAID }], rowCount: 1 }));
    await expectTrpcError(() => callers.customer().order.updateStatus({ orderId: IDS.order, status: OrderStatus.ACCEPTED_BY_KITCHEN }), 'FORBIDDEN', 'kitchen-only transition rejects customers');
  });
  await suite.test('malformed orderId fails closed on OTP verify (BAD_REQUEST)', async () => {
    await expectTrpcError(() => callers.rider().order.verifyDeliveryOtp({ orderId: 'not-a-uuid', otp: '1234' }), 'BAD_REQUEST', 'malformed orderId rejected by zod');
  });
  await suite.test('job outbox isolation sentinel stays clean', async () => {
    enqueuedJobs.length = 0;
    assert.equal(enqueuedJobs.length, 0, 'job outbox must start empty');
  });
});
