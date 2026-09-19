import crypto from 'crypto';

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string | undefined,
): boolean {
  if (!secret || !/^[a-f\d]{64}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
