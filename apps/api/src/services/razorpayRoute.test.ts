import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fastify from 'fastify';
import { registerRazorpayRoute } from './razorpayRoute';
import { verifyWebhookSignature } from './webhookSignature';

async function run() {
  const server = fastify();
  const secret = 'test-only-secret';
  let processed = 0;
  let failedProcessed = 0;
  await registerRazorpayRoute(server, {
    verifyWebhookSignature: (body, signature) => verifyWebhookSignature(body, signature, secret),
    processPaymentCapturedWebhook: async () => { processed += 1; return { success: true, alreadyProcessed: false }; },
    processPaymentFailedWebhook: async () => { failedProcessed += 1; return { success: true, alreadyProcessed: false }; },
  });
  server.post('/ordinary-json', async (request) => request.body);
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: {
    id: 'pay_test', order_id: 'order_test', amount: 100, currency: 'INR', status: 'captured',
  } } } }, null, 2);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const headers = { 'content-type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'event_test' };
  try {
    assert.equal((await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers, payload: body })).statusCode, 200);
    assert.equal(processed, 1);
    assert.equal((await server.inject({ method: 'POST', url: '/webhooks/razorpay', headers, payload: `${body} ` })).statusCode, 400);
    assert.equal(processed, 1);
    const ordinary = await server.inject({ method: 'POST', url: '/ordinary-json', payload: { normal: true } });
    assert.deepEqual(ordinary.json(), { normal: true });

    // payment.failed events are routed to the failure handler
    const failedBody = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_fail', order_id: 'order_fail' } } } });
    const failedSig = crypto.createHmac('sha256', secret).update(failedBody).digest('hex');
    const failedRes = await server.inject({
      method: 'POST', url: '/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': failedSig, 'x-razorpay-event-id': 'event_fail' },
      payload: failedBody,
    });
    assert.equal(failedRes.statusCode, 200);
    assert.equal(failedProcessed, 1);
  } finally { await server.close(); }
  console.log('Raw webhook HTTP tests passed.');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
