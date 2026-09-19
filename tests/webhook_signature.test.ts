import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyWebhookSignature } from '../apps/api/src/services/webhookSignature';

const body = '{"event":"payment.captured"}';
const secret = 'local-test-webhook-secret';
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

assert.equal(verifyWebhookSignature(body, signature, secret), true);
assert.equal(verifyWebhookSignature(`${body} `, signature, secret), false);
assert.equal(verifyWebhookSignature(body, signature, undefined), false);
assert.equal(verifyWebhookSignature(body, signature, ''), false);
assert.equal(verifyWebhookSignature(body, signature, 'different-secret'), false);
for (const malformed of ['', 'invalid', 'a'.repeat(63), 'g'.repeat(64), 'a'.repeat(66)]) {
  assert.equal(verifyWebhookSignature(body, malformed, secret), false);
}
console.log('Webhook signature regression tests passed.');
