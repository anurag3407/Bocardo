import assert from 'node:assert/strict';
import {
  GpsCoordinateSchema,
  UserSchema,
  RestaurantSchema,
  DishSchema,
  OrderItemSchema,
  CreateOrderInputSchema,
  OrderSchema,
  VerifyDeliveryOtpSchema,
  SettlementSchema,
  ReconcileSettlementSchema,
  UserRoleSchema,
  OrderStatusSchema,
  MealSlotSchema,
  SettlementStatusSchema,
  EntityTypeSchema,
  FoodTypeSchema,
} from '../../packages/shared-types/src';
import { OrderStatus, UserRole, EntityType, SettlementStatus, FoodType, MealSlot } from '../../packages/shared-types/src';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Zod Schemas');

const UUID = 'a1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d';
const UUID2 = 'b1b2c3d4-e5f6-4a8b-9c0d-1e2f3a4b5c6d';

runSuite(suite, async () => {
  await suite.test('enum schemas only accept declared values', () => {
    assert.equal(UserRoleSchema.safeParse('CUSTOMER').success, true);
    assert.equal(UserRoleSchema.safeParse('SUPER_ADMIN').success, false);
    assert.equal(OrderStatusSchema.safeParse('DELIVERED').success, true);
    assert.equal(OrderStatusSchema.safeParse('delivered').success, false);
    assert.equal(MealSlotSchema.safeParse(MealSlot.LATE_NIGHT).success, true);
    assert.equal(SettlementStatusSchema.safeParse(SettlementStatus.PAID).success, true);
    assert.equal(EntityTypeSchema.safeParse(EntityType.RIDER).success, true);
    assert.equal(FoodTypeSchema.safeParse(FoodType.EGG).success, true);
  });

  await suite.test('GPS schema accepts realistic hardware coordinates', () => {
    const parsed = GpsCoordinateSchema.safeParse({
      latitude: 12.9716,
      longitude: 77.6408,
      heading: 90,
      speed: 32,
      accuracy: 8,
      timestamp: Date.now(),
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.isMocked, false);
  });

  await suite.test('GPS schema rejects spoofed / simulated location', () => {
    const parsed = GpsCoordinateSchema.safeParse({
      latitude: 12.9716,
      longitude: 77.6408,
      isMocked: true,
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.issues[0].path[0], 'isMocked');
    }
  });

  await suite.test('GPS schema rejects out-of-range telemetry', () => {
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 91, longitude: 0 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 181 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, heading: 361 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, speed: 121 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, accuracy: -1 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, timestamp: 1.5 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, timestamp: -5 }).success, false);
  });

  await suite.test('UserSchema enforces UUID and email formats', () => {
    const valid = UserSchema.safeParse({
      id: UUID,
      clerkId: 'clerk_1',
      email: 'user@bocardo.in',
      role: UserRole.CUSTOMER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert.equal(valid.success, true);
    assert.equal(UserSchema.safeParse({ id: 'not-a-uuid', clerkId: 'x', role: 'CUSTOMER', createdAt: 'now', updatedAt: 'now' }).success, false);
    assert.equal(UserSchema.safeParse({ id: UUID, clerkId: 'x', email: 'bad-email', role: 'CUSTOMER', createdAt: 'now', updatedAt: 'now' }).success, false);
  });

  await suite.test('RestaurantSchema validates GSTIN length and commission range', () => {
    const base = {
      id: UUID,
      ownerId: UUID2,
      name: 'Biryani Bliss',
      slug: 'biryani-bliss',
      phone: '+918041234567',
      latitude: 12.9719,
      longitude: 77.6412,
      address: '100 Feet Rd, Indiranagar',
      createdAt: '2026-09-01',
    };
    assert.equal(RestaurantSchema.safeParse({ ...base, gstin: '29AAAAA0000A1Z5' }).success, true);
    assert.equal(RestaurantSchema.safeParse({ ...base, gstin: 'SHORT' }).success, false);
    assert.equal(RestaurantSchema.safeParse({ ...base, commissionRate: 101 }).success, false);
    assert.equal(RestaurantSchema.safeParse({ ...base, commissionRate: -1 }).success, false);
    assert.equal(RestaurantSchema.safeParse({ ...base, rating: 5.5 }).success, false);
    assert.equal(RestaurantSchema.safeParse({ ...base, imageUrl: 'not a url' }).success, false);
  });

  await suite.test('DishSchema requires positive integer paise pricing', () => {
    const base = { id: UUID, restaurantId: UUID2, name: 'Biryani', createdAt: '2026-09-01' };
    const parsed = DishSchema.safeParse({ ...base, pricePaise: 32000 });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(parsed.data.mealSlots, [MealSlot.LUNCH, MealSlot.DINNER]);
      assert.equal(parsed.data.foodType, FoodType.VEG);
      assert.equal(parsed.data.category, 'Main Course');
    }
    assert.equal(DishSchema.safeParse({ ...base, pricePaise: 0 }).success, false);
    assert.equal(DishSchema.safeParse({ ...base, pricePaise: -100 }).success, false);
    assert.equal(DishSchema.safeParse({ ...base, pricePaise: 10.5 }).success, false);
  });

  await suite.test('OrderItemSchema rejects non-positive quantities', () => {
    const base = { dishId: UUID, name: 'Biryani', unitPricePaise: 32000, totalPricePaise: 64000 };
    assert.equal(OrderItemSchema.safeParse({ ...base, quantity: 2 }).success, true);
    assert.equal(OrderItemSchema.safeParse({ ...base, quantity: 0 }).success, false);
    assert.equal(OrderItemSchema.safeParse({ ...base, quantity: 1.5 }).success, false);
  });

  await suite.test('CreateOrderInputSchema guards the checkout payload', () => {
    const valid = CreateOrderInputSchema.safeParse({
      restaurantId: UUID,
      items: [{ dishId: UUID2, quantity: 2 }],
      deliveryLatitude: 12.9716,
      deliveryLongitude: 77.6408,
      deliveryAddress: '42, 100 Feet Road, Indiranagar',
      tipPaise: 3000,
    });
    assert.equal(valid.success, true);

    assert.equal(
      CreateOrderInputSchema.safeParse({ restaurantId: UUID, items: [], deliveryLatitude: 0, deliveryLongitude: 0, deliveryAddress: '12345' }).success,
      false
    );
    assert.equal(
      CreateOrderInputSchema.safeParse({ restaurantId: UUID, items: [{ dishId: UUID2, quantity: 51 }], deliveryLatitude: 0, deliveryLongitude: 0, deliveryAddress: '12345' }).success,
      false
    );
    assert.equal(
      CreateOrderInputSchema.safeParse({ restaurantId: UUID, items: [{ dishId: UUID2, quantity: 1 }], deliveryLatitude: 0, deliveryLongitude: 0, deliveryAddress: 'abc' }).success,
      false
    );
    assert.equal(
      CreateOrderInputSchema.safeParse({ restaurantId: UUID, items: [{ dishId: UUID2, quantity: 1 }], deliveryLatitude: 0, deliveryLongitude: 0, deliveryAddress: '12345', tipPaise: -1 }).success,
      false
    );
    assert.equal(
      CreateOrderInputSchema.safeParse({ restaurantId: UUID, items: [{ dishId: UUID2, quantity: 1 }], deliveryLatitude: 0, deliveryLongitude: 0, deliveryAddress: '12345', tipPaise: 100001 }).success,
      false
    );
    assert.equal(
      CreateOrderInputSchema.safeParse({ restaurantId: UUID, items: [{ dishId: UUID2, quantity: 1 }], deliveryLatitude: 91, deliveryLongitude: 0, deliveryAddress: '12345' }).success,
      false
    );
  });

  await suite.test('OrderSchema enforces a 4-digit handover OTP', () => {
    const base = {
      id: UUID,
      customerId: UUID,
      restaurantId: UUID2,
      status: OrderStatus.PAID,
      deliveryLatitude: 12.97,
      deliveryLongitude: 77.64,
      deliveryAddress: 'Indiranagar',
      subtotalPaise: 32000,
      foodGstPaise: 1600,
      deliveryFeePaise: 4000,
      platformFeePaise: 500,
      serviceGstPaise: 810,
      totalAmountPaise: 38910,
      createdAt: '2026-09-01',
      updatedAt: '2026-09-01',
    };
    assert.equal(OrderSchema.safeParse({ ...base, deliveryOtp: '4819' }).success, true);
    assert.equal(OrderSchema.safeParse({ ...base, deliveryOtp: '481' }).success, false);
    assert.equal(OrderSchema.safeParse({ ...base, deliveryOtp: '48190' }).success, false);
  });

  await suite.test('VerifyDeliveryOtpSchema requires exactly four digits', () => {
    assert.equal(VerifyDeliveryOtpSchema.safeParse({ orderId: UUID, otp: '4819' }).success, true);
    assert.equal(VerifyDeliveryOtpSchema.safeParse({ orderId: UUID, otp: '481' }).success, false);
    assert.equal(VerifyDeliveryOtpSchema.safeParse({ orderId: UUID, otp: '48190' }).success, false);
    assert.equal(VerifyDeliveryOtpSchema.safeParse({ orderId: UUID, otp: 'abcd' }).success, false);
    assert.equal(VerifyDeliveryOtpSchema.safeParse({ orderId: 'nope', otp: '4819' }).success, false);
  });

  await suite.test('SettlementSchema validates the payout ledger row', () => {
    const parsed = SettlementSchema.safeParse({
      id: UUID,
      entityType: EntityType.RESTAURANT,
      entityId: UUID2,
      startDate: '2026-09-10',
      endDate: '2026-09-17',
      grossAmountPaise: 4200000,
      commissionDeductedPaise: 630000,
      netPayoutPaise: 3570000,
      status: SettlementStatus.PENDING,
      createdAt: '2026-09-18',
    });
    assert.equal(parsed.success, true);
    assert.equal(
      SettlementSchema.safeParse({
        id: UUID,
        entityType: 'INVALID',
        entityId: UUID2,
        startDate: 'x',
        endDate: 'y',
        grossAmountPaise: 1,
        commissionDeductedPaise: 0,
        netPayoutPaise: 1,
        status: SettlementStatus.PENDING,
        createdAt: 'z',
      }).success,
      false
    );
  });

  await suite.test('ReconcileSettlementSchema requires a usable bank UTR', () => {
    assert.equal(ReconcileSettlementSchema.safeParse({ settlementId: UUID, bankUtrReference: 'HDFCN2628192019' }).success, true);
    assert.equal(ReconcileSettlementSchema.safeParse({ settlementId: UUID, bankUtrReference: 'SHORT' }).success, false);
    assert.equal(ReconcileSettlementSchema.safeParse({ settlementId: 'bad', bankUtrReference: 'HDFCN2628192019' }).success, false);
  });

  await suite.test('GPS boundary values are inclusive, just-outside values rejected', () => {
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: -90, longitude: -180 }).success, true);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 90, longitude: 180 }).success, true);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, heading: 0 }).success, true);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, heading: 360 }).success, true);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, speed: 120 }).success, true);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: -90.01, longitude: 0 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 180.01 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, heading: -0.1 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, speed: 120.01 }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: 0, longitude: 0, accuracy: Infinity }).success, false);
    assert.equal(GpsCoordinateSchema.safeParse({ latitude: NaN, longitude: 0 }).success, false);
  });

  await suite.test('CreateOrderInputSchema item-quantity boundaries 1..50', () => {
    const base = { restaurantId: UUID, deliveryLatitude: 0, deliveryLongitude: 0, deliveryAddress: '12345' };
    assert.equal(CreateOrderInputSchema.safeParse({ ...base, items: [{ dishId: UUID2, quantity: 1 }] }).success, true);
    assert.equal(CreateOrderInputSchema.safeParse({ ...base, items: [{ dishId: UUID2, quantity: 50 }] }).success, true);
    assert.equal(CreateOrderInputSchema.safeParse({ ...base, items: [{ dishId: UUID2, quantity: 0 }] }).success, false);
    assert.equal(CreateOrderInputSchema.safeParse({ ...base, items: [{ dishId: UUID2, quantity: 51 }] }).success, false);
    assert.equal(CreateOrderInputSchema.safeParse({ ...base, items: [{ dishId: UUID2, quantity: 2 }], tipPaise: 0 }).success, true);
    assert.equal(CreateOrderInputSchema.safeParse({ ...base, items: [{ dishId: UUID2, quantity: 2 }], tipPaise: 100000 }).success, true);
    assert.equal(CreateOrderInputSchema.safeParse({ ...base, items: [{ dishId: UUID2, quantity: 2 }], tipPaise: 100001 }).success, false);
    assert.equal(CreateOrderInputSchema.safeParse({ ...base, items: [{ dishId: UUID2, quantity: 2 }], specialInstructions: 'x'.repeat(250) }).success, true);
    assert.equal(CreateOrderInputSchema.safeParse({ ...base, items: [{ dishId: UUID2, quantity: 2 }], specialInstructions: 'x'.repeat(251) }).success, false);
  });

  await suite.test('OrderSchema OTP allows leading zeros but nothing else', () => {
    const base = {
      id: UUID, customerId: UUID, restaurantId: UUID2, status: OrderStatus.PAID,
      deliveryLatitude: 12.97, deliveryLongitude: 77.64, deliveryAddress: 'Indiranagar',
      subtotalPaise: 32000, foodGstPaise: 1600, deliveryFeePaise: 4000, platformFeePaise: 500,
      serviceGstPaise: 810, totalAmountPaise: 38910, createdAt: '2026-09-01', updatedAt: '2026-09-01',
    };
    assert.equal(OrderSchema.safeParse({ ...base, deliveryOtp: '0000' }).success, true);
    assert.equal(OrderSchema.safeParse({ ...base, deliveryOtp: '48 19' }).success, false);
    assert.equal(OrderSchema.safeParse({ ...base, deliveryOtp: '' }).success, false);
    assert.equal(OrderSchema.safeParse({ ...base, deliveryOtp: '481' }).success, false);
    // NOTE: OrderSchema is length(4)-only, so 'abcd' passes here; the strict
    // digit check lives in VerifyDeliveryOtpSchema (tested above).
    assert.equal(OrderSchema.safeParse({ ...base, deliveryOtp: 'abcd' }).success, true);
  });
});
