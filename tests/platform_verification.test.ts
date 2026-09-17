import {
  calculateOrderTaxBreakdown,
  formatPaiseToRupees,
  maskPhoneNumber,
  GpsCoordinateSchema,
  VerifyDeliveryOtpSchema,
} from '../packages/shared-types/src';
import { thermalPrinterService } from '../apps/hotel/src/services/printer';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
  console.log(`✅ Passed: ${message}`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING PLATFORM VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  // Test 1: Indian CGST Section 9(5) Dual-Tax Integer-Paise Math
  console.log('--- Test Group 1: Section 9(5) CGST Dual-Tax Math ---');
  const subtotalPaise = 40000; // ₹400.00
  const deliveryFeePaise = 4000; // ₹40.00
  const platformFeePaise = 500; // ₹5.00

  const tax = calculateOrderTaxBreakdown(subtotalPaise, deliveryFeePaise, platformFeePaise);

  assert(tax.subtotalPaise === 40000, 'Subtotal should be 40000 paise (₹400.00)');
  assert(tax.foodGstPaise === 2000, 'Food GST (5% Sec 9(5)) should be 2000 paise (₹20.00)');
  assert(tax.deliveryFeePaise === 4000, 'Delivery fee should be 4000 paise (₹40.00)');
  assert(tax.platformFeePaise === 500, 'Platform fee should be 500 paise (₹5.00)');
  // 18% of (4000 + 500) = 18% of 4500 = 810 paise (₹8.10)
  assert(tax.serviceGstPaise === 810, 'Service GST (18%) should be 810 paise (₹8.10)');
  // Total = 40000 + 2000 + 4000 + 500 + 810 = 47310 paise (₹473.10)
  assert(tax.totalAmountPaise === 47310, 'Grand Total should be 47310 paise (₹473.10)');
  assert(formatPaiseToRupees(tax.totalAmountPaise).includes('473.1'), 'Formatted INR should be ₹473.10');

  // Test 2: Anti-Cheat Mock GPS Rejection
  console.log('\n--- Test Group 2: Anti-Cheat Mock GPS Rejection ---');
  const validGps = {
    latitude: 12.9716,
    longitude: 77.6408,
    heading: 90,
    speed: 30,
    isMocked: false,
  };
  const validParsed = GpsCoordinateSchema.safeParse(validGps);
  assert(validParsed.success === true, 'Hardware GPS coordinates accepted');

  const spoofedGps = {
    latitude: 12.9716,
    longitude: 77.6408,
    heading: 90,
    speed: 30,
    isMocked: true, // Spoofed / simulated location
  };
  const spoofedParsed = GpsCoordinateSchema.safeParse(spoofedGps);
  assert(spoofedParsed.success === false, 'Mock GPS coordinates successfully rejected');

  // Test 3: Phone Number Masking (BOLA Privacy Guard)
  console.log('\n--- Test Group 3: Privacy Phone Number Masking ---');
  const masked1 = maskPhoneNumber('+919876543210');
  assert(masked1 === '+91 98*** **210', `Masked phone matches pattern: ${masked1}`);

  // Test 4: Delivery Handover OTP Schema
  console.log('\n--- Test Group 4: Delivery Handover OTP Verification ---');
  const validOtp = VerifyDeliveryOtpSchema.safeParse({
    orderId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    otp: '4819',
  });
  assert(validOtp.success === true, 'Valid 4-digit OTP accepted');

  const invalidOtp = VerifyDeliveryOtpSchema.safeParse({
    orderId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    otp: '481', // Only 3 digits
  });
  assert(invalidOtp.success === false, 'Non-4-digit OTP rejected');

  // Test 5: ESC/POS Kitchen Order Ticket (KOT) Formatting
  console.log('\n--- Test Group 5: ESC/POS Thermal Printer Ticket ---');
  const kotContent = thermalPrinterService.formatKotTicket({
    id: 'kot-101',
    orderId: 'ord-8102',
    items: [
      { name: 'Hyderabadi Dum Biryani', quantity: 2, specialInstructions: 'Extra spicy' },
      { name: 'Burani Garlic Raita', quantity: 1 },
    ],
    orderTime: '12:45 PM',
  });
  assert(kotContent.includes('KITCHEN ORDER TICKET'), 'KOT ticket contains header');
  assert(kotContent.includes('Hyderabadi Dum Biryani'), 'KOT ticket contains dish name');
  assert(kotContent.includes('Extra spicy'), 'KOT ticket contains kitchen notes');

  console.log('\n======================================================');
  console.log('🎉 ALL PLATFORM TESTS PASSED SUCCESSFULLY (5/5)');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
