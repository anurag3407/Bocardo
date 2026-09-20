import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fastify from '../../apps/api/node_modules/fastify';
import { registerRazorpayRoute } from '../../apps/api/src/services/razorpayRoute';
import { verifyWebhookSignature } from '../../apps/api/src/services/webhookSignature';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Razorpay Webhook Route');

const secret = 'test-only-secret';

function signedRequest(
  signedBody: string,
  extraHeaders: Record<string, string> = {},
  payloadBody: string = signedBody
) {
  return {
    method: 'POST' as const,
    url: '/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': crypto.createHmac('sha256', secret).update(signedBody).digest('hex'),
      'x-razorpay-event-id': 'event_test',
      ...extraHeaders,
    },
    payload: payloadBody,
  };
}

runSuite(suite, async () => {
  const captured: Array<{ eventId: string; orderId: string; paymentId: string }> = [];
  const failed: Array<{ eventId: string; orderId: string }> = [];
  let capturedResult: { success: boolean; alreadyProcessed: boolean } = {
    success: true,
    alreadyProcessed: false,
  };

  const server = fastify();
  await registerRazorpayRoute(server, {
    verifyWebhookSignature: (body, signature) => verifyWebhookSignature(body, signature, secret),
    processPaymentCapturedWebhook: async (eventId, orderId, paymentId) => {
      captured.push({ eventId, orderId, paymentId });
      return capturedResult;
    },
    processPaymentFailedWebhook: async (eventId, orderId) => {
      failed.push({ eventId, orderId });
      return { success: true, alreadyProcessed: false };
    },
  });
  server.post('/ordinary-json', async (request) => request.body as object);

  const capturedBody = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: { entity: { id: 'pay_test', order_id: 'order_test', amount: 100, currency: 'INR', status: 'captured' } },
    },
  });
  const failedBody = JSON.stringify({
    event: 'payment.failed',
    payload: { payment: { entity: { id: 'pay_fail', order_id: 'order_fail' } } },
  });

  await suite.test('accepts a signed payment.captured event', async () => {
    const response = await server.inject(signedRequest(capturedBody));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
    assert.deepEqual(captured.at(-1), { eventId: 'event_test', orderId: 'order_test', paymentId: 'pay_test' });
  });

  await suite.test('accepts a signed payment.failed event', async () => {
    const response = await server.inject(signedRequest(failedBody));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(failed.at(-1), { eventId: 'event_test', orderId: 'order_fail' });
  });

  await suite.test('rejects a tampered body (signature mismatch)', async () => {
    const before = captured.length;
    const response = await server.inject(signedRequest(capturedBody, {}, `${capturedBody} `));
    assert.equal(response.statusCode, 400);
    assert.equal(captured.length, before);
  });

  await suite.test('rejects requests missing the signature header', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-event-id': 'event_test' },
      payload: capturedBody,
    });
    assert.equal(response.statusCode, 400);
  });

  await suite.test('rejects invalid JSON even with a valid HMAC', async () => {
    const response = await server.inject(signedRequest('{not json}'));
    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /Invalid JSON/i);
  });

  await suite.test('rejects a non-object JSON event', async () => {
    const response = await server.inject(signedRequest('null'));
    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /Invalid event/i);
  });

  await suite.test('ignores unrelated events without invoking handlers', async () => {
    const before = captured.length + failed.length;
    const response = await server.inject(
      signedRequest(JSON.stringify({ event: 'refund.processed', payload: { payment: { entity: {} } } }))
    );
    assert.equal(response.statusCode, 200);
    assert.equal(captured.length + failed.length, before);
  });

  await suite.test('rejects malformed captured-payment payloads', async () => {
    for (const entity of [
      { id: 'pay', order_id: 'order', amount: 0, currency: 'INR', status: 'captured' },
      { id: 'pay', order_id: 'order', amount: 100, currency: 'USD', status: 'captured' },
      { id: 'pay', order_id: 'order', amount: 100, currency: 'INR', status: 'authorized' },
      { id: 'pay', order_id: 'order', amount: 100.5, currency: 'INR', status: 'captured' },
    ]) {
      const response = await server.inject(
        signedRequest(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity } } }))
      );
      assert.equal(response.statusCode, 400, `accepted ${JSON.stringify(entity)}`);
    }
  });

  await suite.test('rejects malformed payment.failed payloads', async () => {
    for (const entity of [{ id: 'pay_fail' }, { order_id: 'order_fail' }, {}]) {
      const response = await server.inject(
        signedRequest(JSON.stringify({ event: 'payment.failed', payload: { payment: { entity } } }))
      );
      assert.equal(response.statusCode, 400, `accepted ${JSON.stringify(entity)}`);
    }
  });

  await suite.test('rejects a missing or over-long event id header', async () => {
    const noEventId = await server.inject(signedRequest(capturedBody, { 'x-razorpay-event-id': '' }));
    assert.equal(noEventId.statusCode, 400);
    const longEventId = await server.inject(
      signedRequest(capturedBody, { 'x-razorpay-event-id': 'e'.repeat(256) })
    );
    assert.equal(longEventId.statusCode, 400);
  });

  await suite.test('returns 503 when the captured payment needs reconciliation', async () => {
    capturedResult = { success: false, alreadyProcessed: false };
    const response = await server.inject(signedRequest(capturedBody));
    assert.equal(response.statusCode, 503);
    capturedResult = { success: true, alreadyProcessed: false };
  });

  await suite.test('raw parser scoping leaves ordinary JSON routes intact', async () => {
    const response = await server.inject({ method: 'POST', url: '/ordinary-json', payload: { normal: true } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { normal: true });
  });

  await suite.test('enforces the 256KB webhook body limit', async () => {
    const huge = JSON.stringify({ event: 'payment.captured', blob: 'x'.repeat(300 * 1024) });
    const response = await server.inject(signedRequest(huge));
    assert.equal(response.statusCode, 413);
  });

  await server.close();
});
