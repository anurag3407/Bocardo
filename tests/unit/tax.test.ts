import assert from 'node:assert/strict';
import {
  calculateOrderTaxBreakdown,
  calculateSettlementBreakdown,
  formatPaiseToRupees,
  maskPhoneNumber,
  haversineMeters,
  GEOFENCE_ARRIVAL_RADIUS_METERS,
  GEOFENCE_GATE_HANDOVER_RADIUS_METERS,
  FOOD_GST_PERCENT,
  SERVICE_GST_PERCENT,
  COMMISSION_GST_PERCENT,
  SECTION_194O_TDS_PERCENT,
  SECTION_52_TCS_PERCENT,
  DEFAULT_PLATFORM_FEE_PAISE,
  DEFAULT_DELIVERY_FEE_PAISE,
  DEFAULT_PACKAGING_FEE_PAISE,
  DEFAULT_TIP_PAISE,
  TIP_CHIPS_PAISE,
} from '../../packages/shared-types/src';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Tax, Money & Geo');

runSuite(suite, async () => {
  await suite.test('CGST Section 9(5) constants are statutory', () => {
    assert.equal(FOOD_GST_PERCENT, 5);
    assert.equal(SERVICE_GST_PERCENT, 18);
    assert.equal(DEFAULT_PLATFORM_FEE_PAISE, 500);
    assert.equal(DEFAULT_DELIVERY_FEE_PAISE, 4000);
    assert.equal(DEFAULT_PACKAGING_FEE_PAISE, 1500);
    assert.equal(DEFAULT_TIP_PAISE, 0);
    assert.deepEqual([...TIP_CHIPS_PAISE], [2000, 3000, 5000]);
  });

  await suite.test('Indian e-commerce settlement constants and deductions are statutory', () => {
    assert.equal(COMMISSION_GST_PERCENT, 18);
    assert.equal(SECTION_194O_TDS_PERCENT, 1);
    assert.equal(SECTION_52_TCS_PERCENT, 1);
    assert.equal(GEOFENCE_GATE_HANDOVER_RADIUS_METERS, 300);

    // ₹10,000 gross with 15% commission and ₹200 packaging
    const settlement = calculateSettlementBreakdown(1000000, 15, 20000);
    assert.equal(settlement.commissionPaise, 150000); // 15% = ₹1,500
    assert.equal(settlement.commissionGstPaise, 27000); // 18% of ₹1,500 = ₹270
    assert.equal(settlement.tdsPaise, 10000); // 1% of ₹10,000 = ₹100
    assert.equal(settlement.tcsPaise, 10000); // 1% of ₹10,000 = ₹100
    assert.equal(settlement.totalDeductionsPaise, 150000 + 27000 + 10000 + 10000); // ₹1,970
    assert.equal(settlement.netPayoutPaise, (1000000 + 20000) - settlement.totalDeductionsPaise); // ₹8,230
  });

  await suite.test('default breakdown matches the documented ₹400 meal', () => {
    const tax = calculateOrderTaxBreakdown(40000);
    assert.deepEqual(tax, {
      subtotalPaise: 40000,
      foodGstPaise: 2000,
      deliveryFeePaise: 4000,
      platformFeePaise: 500,
      serviceGstPaise: 810,
      packagingFeePaise: 0,
      tipPaise: 0,
      totalAmountPaise: 47310,
    });
  });

  await suite.test('service GST is 18% of delivery + platform fee only', () => {
    const tax = calculateOrderTaxBreakdown(10000);
    assert.equal(tax.serviceGstPaise, Math.round((4000 + 500) * 0.18));
    assert.equal(tax.foodGstPaise, 500);
    assert.equal(tax.totalAmountPaise, 15810);
  });

  await suite.test('packaging fee and tip flow through untouched', () => {
    const tax = calculateOrderTaxBreakdown(25000, 3000, 500, 1500, 5000);
    assert.equal(tax.subtotalPaise, 25000);
    assert.equal(tax.foodGstPaise, 1250);
    assert.equal(tax.deliveryFeePaise, 3000);
    assert.equal(tax.platformFeePaise, 500);
    assert.equal(tax.serviceGstPaise, 630);
    assert.equal(tax.packagingFeePaise, 1500);
    assert.equal(tax.tipPaise, 5000);
    assert.equal(tax.totalAmountPaise, 25000 + 1250 + 3000 + 500 + 630 + 1500 + 5000);
  });

  await suite.test('rounds to the nearest paise (no floating point drift)', () => {
    const tax = calculateOrderTaxBreakdown(333);
    assert.equal(tax.foodGstPaise, 17); // 16.65 -> 17
    assert.equal(Number.isInteger(tax.totalAmountPaise), true);
  });

  await suite.test('sub-paise inputs are floored to integers', () => {
    const tax = calculateOrderTaxBreakdown(100.99, 4000.99, 500.99, 12.9, 99.9);
    assert.equal(tax.subtotalPaise, 100);
    assert.equal(tax.deliveryFeePaise, 4000);
    assert.equal(tax.platformFeePaise, 500);
    assert.equal(tax.packagingFeePaise, 12);
    assert.equal(tax.tipPaise, 99);
  });

  await suite.test('negative inputs are clamped to zero (never credits)', () => {
    const tax = calculateOrderTaxBreakdown(-500, -1, -1, -1, -1);
    assert.deepEqual(tax, {
      subtotalPaise: 0,
      foodGstPaise: 0,
      deliveryFeePaise: 0,
      platformFeePaise: 0,
      serviceGstPaise: 0,
      packagingFeePaise: 0,
      tipPaise: 0,
      totalAmountPaise: 0,
    });
  });

  await suite.test('zero-value order stays a clean zero', () => {
    const tax = calculateOrderTaxBreakdown(0, 0, 0, 0, 0);
    assert.equal(tax.totalAmountPaise, 0);
  });

  await suite.test('large orders keep exact integer paise arithmetic', () => {
    const tax = calculateOrderTaxBreakdown(123456789);
    assert.equal(tax.foodGstPaise, Math.round(123456789 * 0.05));
    assert.equal(
      tax.totalAmountPaise,
      123456789 + tax.foodGstPaise + 4000 + 500 + tax.serviceGstPaise
    );
  });

  await suite.test('formatPaiseToRupees renders Indian groupings', () => {
    assert.match(formatPaiseToRupees(25050), /250\.50/);
    assert.match(formatPaiseToRupees(47310), /473\.10/);
    assert.match(formatPaiseToRupees(0), /0/);
    assert.match(formatPaiseToRupees(12345678), /1,23,456\.78/);
  });

  await suite.test('formatPaiseToRupees omits decimals for whole rupees', () => {
    const formatted = formatPaiseToRupees(100000);
    assert.equal(formatted.includes('.'), false, `unexpected decimals in ${formatted}`);
  });

  await suite.test('formatPaiseToRupees accepts bigint without precision loss', () => {
    assert.equal(formatPaiseToRupees(9007199254740993n), formatPaiseToRupees(9007199254740993));
  });

  await suite.test('maskPhoneNumber keeps only country code and 5 digits', () => {
    assert.equal(maskPhoneNumber('+919876543210'), '+91 98*** **210');
    assert.equal(maskPhoneNumber('9876543210'), '98*** **210');
    assert.equal(maskPhoneNumber('+91 98765 43210'), '+91 98*** **210');
  });

  await suite.test('maskPhoneNumber fails safe for missing/short numbers', () => {
    assert.equal(maskPhoneNumber(undefined), '***');
    assert.equal(maskPhoneNumber(null), '***');
    assert.equal(maskPhoneNumber(''), '***');
    assert.equal(maskPhoneNumber('12345'), '***');
  });

  await suite.test('haversineMeters returns zero for identical points', () => {
    assert.equal(haversineMeters(12.9716, 77.6408, 12.9716, 77.6408), 0);
  });

  await suite.test('haversineMeters matches known Indiranagar distance', () => {
    const distance = haversineMeters(12.9716, 77.6408, 12.974, 77.6385);
    assert.ok(distance > 250 && distance < 450, `unexpected distance ${distance}`);
  });

  await suite.test('haversineMeters is symmetric', () => {
    const a = haversineMeters(12.9716, 77.6408, 13.0827, 77.5877);
    const b = haversineMeters(13.0827, 77.5877, 12.9716, 77.6408);
    assert.ok(Math.abs(a - b) < 1e-6);
  });


  await suite.test('geofence arrival radius is a strict 100m', () => {
    assert.equal(GEOFENCE_ARRIVAL_RADIUS_METERS, 100);
  });

  await suite.test('tip and packaging never attract service GST', () => {
    const noTip = calculateOrderTaxBreakdown(20000, 4000, 500, 0, 0);
    const withTip = calculateOrderTaxBreakdown(20000, 4000, 500, 1500, 5000);
    assert.equal(
      withTip.serviceGstPaise,
      noTip.serviceGstPaise,
      `service GST changed with tip/packaging: ${noTip.serviceGstPaise} vs ${withTip.serviceGstPaise}`
    );
    assert.equal(withTip.totalAmountPaise - noTip.totalAmountPaise, 1500 + 5000);
  });

  await suite.test('haversineMeters spans half the earth for antipodal points', () => {
    const halfEarth = haversineMeters(0, 0, 0, 180);
    assert.ok(
      halfEarth > 20000000 && halfEarth < 20100000,
      `antipodal distance should be ~20015km, got ${halfEarth}`
    );
  });

  await suite.test('formatPaiseToRupees handles negatives and single paise', () => {
    assert.match(formatPaiseToRupees(-25050), /250\.50/, 'negative amount lost its paise part');
    assert.match(formatPaiseToRupees(1), /0\.01/, 'single paise misrendered');
    assert.match(formatPaiseToRupees(100), /1/, 'one rupee misrendered');
  });

  await suite.test('maskPhoneNumber tolerates dashes but keeps the masked tail', () => {
    const masked = maskPhoneNumber('+91-9876543210');
    assert.ok(
      masked.endsWith('98*** **210'),
      `dashes broke the masked tail: ${masked}`
    );
    assert.equal(maskPhoneNumber('  9876543210  '), '98*** **210');
    assert.equal(maskPhoneNumber('123456789'), '***');
  });

  await suite.test('TIP_CHIPS_PAISE is ascending with three chips', () => {
    assert.deepEqual([...TIP_CHIPS_PAISE].sort((a, b) => a - b), [...TIP_CHIPS_PAISE]);
    assert.equal(TIP_CHIPS_PAISE.length, 3);
  });
});
