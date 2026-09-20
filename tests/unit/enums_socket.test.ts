import assert from 'node:assert/strict';
import {
  UserRole,
  OrderStatus,
  MealSlot,
  SettlementStatus,
  EntityType,
  FoodType,
  DiscountType,
  SOCKET_EVENTS,
} from '../../packages/shared-types/src';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Enums & Socket Contracts');

function hasNoDuplicateValues(enumObject: Record<string, string>, name: string) {
  const values = Object.values(enumObject);
  assert.equal(new Set(values).size, values.length, `${name} has duplicate values`);
  values.forEach((value) => assert.equal(value, value.toUpperCase(), `${name} value "${value}" is not upper case`));
}

runSuite(suite, async () => {
  await suite.test('UserRole contains exactly the four platform roles', () => {
    assert.deepEqual(Object.values(UserRole).sort(), ['ADMIN', 'CUSTOMER', 'RESTAURANT', 'RIDER']);
    hasNoDuplicateValues(UserRole as any, 'UserRole');
  });

  await suite.test('OrderStatus covers the full lifecycle and cancellations', () => {
    assert.deepEqual(Object.values(OrderStatus), [
      'PAYMENT_PENDING',
      'PAID',
      'ACCEPTED_BY_KITCHEN',
      'PREPARING',
      'READY_FOR_PICKUP',
      'RIDER_ASSIGNED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED_BY_CUSTOMER',
      'CANCELLED_BY_KITCHEN',
      'CANCELLED_BY_SYSTEM',
    ]);
    hasNoDuplicateValues(OrderStatus as any, 'OrderStatus');
  });

  await suite.test('MealSlot matches the recommendation engine slots', () => {
    assert.deepEqual(Object.values(MealSlot).sort(), ['BREAKFAST', 'DINNER', 'LATE_NIGHT', 'LUNCH', 'SNACKS']);
  });

  await suite.test('Settlement, entity, diet and discount enums are stable', () => {
    assert.deepEqual(Object.values(SettlementStatus).sort(), ['PAID', 'PENDING']);
    assert.deepEqual(Object.values(EntityType).sort(), ['RESTAURANT', 'RIDER']);
    assert.deepEqual(Object.values(FoodType).sort(), ['EGG', 'NON_VEG', 'VEG']);
    assert.deepEqual(Object.values(DiscountType).sort(), ['FLAT', 'PERCENTAGE']);
  });

  await suite.test('socket event names form the realtime API contract', () => {
    assert.deepEqual(SOCKET_EVENTS, {
      CONNECT: 'connect',
      DISCONNECT: 'disconnect',
      JOIN_ROOM: 'join:room',
      LEAVE_ROOM: 'leave:room',
      RIDER_LOCATION_UPDATE: 'rider:location:update',
      ORDER_TRACKING: 'order_tracking',
      DISPATCH_OFFER: 'dispatch:offer',
      DISPATCH_RESPONSE: 'dispatch:response',
      RESTAURANT_NEW_ORDER: 'restaurant:new_order',
      ORDER_STATUS_UPDATE: 'order:status:update',
      PREP_TIME_UPDATE: 'order:prep_time:update',
      ITEM_86_UPDATE: 'restaurant:item_86',
      DISPATCH_CASCADE: 'dispatch:cascade',
    });
    assert.equal(new Set(Object.values(SOCKET_EVENTS)).size, Object.values(SOCKET_EVENTS).length);
  });
});
