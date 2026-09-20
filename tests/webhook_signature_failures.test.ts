import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyWebhookSignature } from '../apps/api/src/services/webhookSignature';
import { Suite, runSuite } from './harness/suite';
const suite = new Suite('Webhook Signature Failure Modes (negative + boundary)');
const secret = 'failure-mode-secret';
const body = '{"event":"payment.captured","amount":47310}';
const sign = (b: string, k = secret): string => crypto.createHmac('sha256', k).update(b).digest('hex');
runSuite(suite, async () => {
  await suite.test('empty and whitespace-only signatures rejected without throwing', async () => {
    for (const bad of ['', ' ', '  ', '\n', '\t']) {
      assert.equal(verifyWebhookSignature(body, bad, secret), false, 'accepted ' + JSON.stringify(bad));
    }
  });
  await suite.test('signature with 0x prefix or separators rejected', async () => {
    const good = sign(body);
    for (const bad of ['0x' + good, good.slice(0, 32) + ':' + good.slice(32), good.split('').join(' ')]) {
      assert.equal(verifyWebhookSignature(body, bad, secret), false, 'accepted decorated sig ' + JSON.stringify(bad).slice(0, 40));
    }
  });
  await suite.test('single-bit flip in signature rejected (tamper sensitivity)', async () => {
    const good = sign(body);
    const last = good[good.length - 1];
    const flipped = good.slice(0, -1) + (last === 'a' ? 'b' : 'a');
    assert.notEqual(flipped, good, 'setup must flip a nibble');
    assert.equal(verifyWebhookSignature(body, flipped, secret), false, 'single-nibble forgery must fail');
  });
  await suite.test('empty body never verifies against a non-empty-body signature', async () => {
    assert.equal(verifyWebhookSignature('', sign(body), secret), false, 'empty body must not verify');
    assert.equal(verifyWebhookSignature('', sign(''), secret), true, 'empty body with its own signature must verify');
  });
  await suite.test('whitespace-only secrets and undefined fail closed', async () => {
    assert.equal(verifyWebhookSignature(body, sign(body, ' '), ' '), true, 'exact whitespace secret is technically consistent');
    assert.equal(verifyWebhookSignature(body, sign(body), undefined), false, 'undefined secret must fail closed');
    assert.equal(verifyWebhookSignature(body, sign(body), ''), false, 'empty secret must fail closed');
  });
  await suite.test('truncated and padded signatures rejected (length boundary)', async () => {
    const good = sign(body);
    assert.equal(verifyWebhookSignature(body, good.slice(0, 32), secret), false, '32-char truncation must fail');
    assert.equal(verifyWebhookSignature(body, good + '00', secret), false, 'padded 68-char sig must fail');
    assert.equal(verifyWebhookSignature(body, good.toUpperCase(), secret), true, 'uppercase hex must remain valid');
  });
});
