import assert from 'node:assert/strict';
import { calculateOrderTaxBreakdown, formatPaiseToRupees, maskPhoneNumber, GpsCoordinateSchema, VerifyDeliveryOtpSchema } from '../packages/shared-types/src';
import { thermalPrinterService } from '../apps/hotel/src/services/printer';
import { Suite, runSuite } from './harness/suite';
const suite = new Suite('Platform Verification Hardening (negative + boundary)');
runSuite(suite, async () => {
  await suite.test('zero-value order yields zero tax and zero total (lower boundary)', async () => {
    const t = calculateOrderTaxBreakdown(0, 0, 0);
    assert.equal(t.foodGstPaise, 0, 'food GST on zero subtotal must be 0, got ' + t.foodGstPaise);
    assert.equal(t.serviceGstPaise, 0, 'service GST on zero fees must be 0, got ' + t.serviceGstPaise);
    assert.equal(t.totalAmountPaise, 0, 'grand total of zeros must be 0, got ' + t.totalAmountPaise);
  });
  await suite.test('single-paise subtotal rounds deterministically (rounding boundary)', async () => {
    const t = calculateOrderTaxBreakdown(1, 0, 0);
    assert.equal(t.totalAmountPaise, t.subtotalPaise + t.foodGstPaise + t.deliveryFeePaise + t.platformFeePaise + t.serviceGstPaise, 'total must equal sum of parts, got ' + JSON.stringify(t));
    assert.ok(Number.isInteger(t.totalAmountPaise), 'total must stay integer paise, got ' + t.totalAmountPaise);
  });
  await suite.test('formatted total never exposes raw paise integer (display guard)', async () => {
    const t = calculateOrderTaxBreakdown(40000, 4000, 500);
    const s = formatPaiseToRupees(t.totalAmountPaise);
    assert.ok(!s.includes('47310'), 'formatted string must not leak raw paise: ' + s);
    assert.ok(s.includes('473.1'), 'formatted string must show rupees: ' + s);
  });
  await suite.test('mocked GPS rejected; out-of-range coords rejected; valid hardware GPS accepted', async () => {
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 12.9, longitude: 77.6, heading: 90, speed: 30, isMocked: true }).success, false, 'mocked GPS must be rejected');
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 91, longitude: 77.6, heading: 0, speed: 0, isMocked: false }).success, false, 'latitude 91 must be rejected');
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 12.9, longitude: 181, heading: 0, speed: 0, isMocked: false }).success, false, 'longitude 181 must be rejected');
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 12.9716, longitude: 77.6408, heading: 90, speed: 30, isMocked: false }).success, true, 'hardware GPS must be accepted');
  });
  await suite.test('phone masking never leaks full number and handles empty input', async () => {
    const masked = maskPhoneNumber('+919876543210');
    assert.ok(!masked.includes('9876543210'), 'masked phone must not contain full digits: ' + masked);
    assert.ok(masked.includes('210'), 'masked phone must keep last digits for rider UX: ' + masked);
    const empty = maskPhoneNumber('');
    assert.equal(typeof empty, 'string', 'empty input must still return a string');
  });
  await suite.test('OTP schema rejects short/long/non-numeric codes (handover guard)', async () => {
    const oid = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
    assert.equal(VerifyDeliveryOtpSchema.safeParse({ orderId: oid, otp: '12' }).success, false, '2-digit OTP must be rejected');
    assert.equal(VerifyDeliveryOtpSchema.safeParse({ orderId: oid, otp: '12345' }).success, false, '5-digit OTP must be rejected');
    assert.equal(VerifyDeliveryOtpSchema.safeParse({ orderId: oid, otp: 'abcd' }).success, false, 'alpha OTP must be rejected');
    assert.equal(VerifyDeliveryOtpSchema.safeParse({ orderId: oid, otp: '4819' }).success, true, 'valid 4-digit OTP must be accepted');
  });
  await suite.test('KOT ticket renders items and survives empty special instructions', async () => {
    const kot = thermalPrinterService.formatKotTicket({ id: 'kot-1', orderId: 'ord-1', items: [{ name: 'Biryani', quantity: 2 }, { name: 'Raita', quantity: 1, specialInstructions: '' }], orderTime: '12:45 PM' });
    assert.ok(kot.includes('Biryani'), 'KOT must list Biryani');
    assert.ok(kot.includes('2'), 'KOT must show quantity 2, got: ' + JSON.stringify(kot.slice(0, 200)));
  });
});
