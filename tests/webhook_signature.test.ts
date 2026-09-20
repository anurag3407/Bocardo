import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyWebhookSignature } from '../apps/api/src/services/webhookSignature';
import { Suite, runSuite } from './harness/suite';

const suite = new Suite('Integration · Razorpay Webhook Signature');

const secret = 'local-test-webhook-secret';
const body = '{"event":"payment.captured"}';

function sign(rawBody: string, key = secret): string {
  return crypto.createHmac('sha256', key).update(rawBody).digest('hex');
}

runSuite(suite, async () => {
  await suite.test('accepts a correctly signed raw body', () => {
    assert.equal(verifyWebhookSignature(body, sign(body), secret), true);
  });

  await suite.test('accepts uppercase hex signatures', () => {
    assert.equal(verifyWebhookSignature(body, sign(body).toUpperCase(), secret), true);
  });

  await suite.test('rejects any body mutation (replay/tamper protection)', () => {
    assert.equal(verifyWebhookSignature(`${body} `, sign(body), secret), false);
    assert.equal(verifyWebhookSignature(`${body}\n`, sign(body), secret), false);
    assert.equal(verifyWebhookSignature('{}', sign(body), secret), false);
    assert.equal(verifyWebhookSignature(body.replace('captured', 'failed'), sign(body), secret), false);
  });

  await suite.test('rejects signatures generated with a different secret', () => {
    assert.equal(verifyWebhookSignature(body, sign(body, 'attacker-secret'), secret), false);
  });

  await suite.test('rejects misconfigured or missing secrets', () => {
    assert.equal(verifyWebhookSignature(body, sign(body), undefined), false);
    assert.equal(verifyWebhookSignature(body, sign(body), ''), false);
  });

  await suite.test('rejects malformed signatures without throwing', () => {
    for (const malformed of ['', 'invalid', 'a'.repeat(63), 'g'.repeat(64), 'a'.repeat(66), 'zz'.repeat(32)]) {
      assert.equal(verifyWebhookSignature(body, malformed, secret), false, `accepted "${malformed}"`);
    }
  });

  await suite.test('handles unicode and large raw bodies', () => {
    const unicode = JSON.stringify({ event: 'payment.captured', note: '₹1,23,456 • naïveté ✅' });
    assert.equal(verifyWebhookSignature(unicode, sign(unicode), secret), true);
    const large = JSON.stringify({ event: 'payment.captured', data: 'x'.repeat(200000) });
    assert.equal(verifyWebhookSignature(large, sign(large), secret), true);
    assert.equal(verifyWebhookSignature(large, sign(unicode), secret), false);
  });
});
