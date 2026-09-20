import assert from 'node:assert/strict';
import {
  canTransitionOrder,
  HAPPY_PATH_STAGES,
  CUSTOMER_TRACKING_STEPS,
  trackingStageIndex,
} from '../../packages/shared-types/src';
import { OrderStatus, UserRole } from '../../packages/shared-types/src';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Order State Machine');

const ALL_STATUSES = Object.values(OrderStatus);

function allowedPairs(role: UserRole): string[] {
  const pairs: string[] = [];
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      if (canTransitionOrder(role, from, to)) pairs.push(`${from}->${to}`);
    }
  }
  return pairs.sort();
}

runSuite(suite, async () => {
  await suite.test('RESTAURANT may only advance the kitchen lifecycle', () => {
    assert.deepEqual(allowedPairs(UserRole.RESTAURANT), [
      'ACCEPTED_BY_KITCHEN->CANCELLED_BY_KITCHEN',
      'ACCEPTED_BY_KITCHEN->PREPARING',
      'PAID->ACCEPTED_BY_KITCHEN',
      'PAID->CANCELLED_BY_KITCHEN',
      'PREPARING->CANCELLED_BY_KITCHEN',
      'PREPARING->READY_FOR_PICKUP',
    ]);
  });

  await suite.test('RESTAURANT cannot skip stages or self-deliver', () => {
    assert.equal(canTransitionOrder(UserRole.RESTAURANT, OrderStatus.PAID, OrderStatus.PREPARING), false);
    assert.equal(canTransitionOrder(UserRole.RESTAURANT, OrderStatus.PAID, OrderStatus.DELIVERED), false);
    assert.equal(canTransitionOrder(UserRole.RESTAURANT, OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED_BY_KITCHEN), false);
    assert.equal(canTransitionOrder(UserRole.RESTAURANT, OrderStatus.DELIVERED, OrderStatus.PREPARING), false);
  });

  await suite.test('RIDER may only accept pickup and start delivery', () => {
    assert.deepEqual(allowedPairs(UserRole.RIDER), [
      'READY_FOR_PICKUP->RIDER_ASSIGNED',
      'RIDER_ASSIGNED->OUT_FOR_DELIVERY',
    ]);
  });

  await suite.test('RIDER cannot mark DELIVERED through the state machine', () => {
    assert.equal(canTransitionOrder(UserRole.RIDER, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED), false);
    assert.equal(canTransitionOrder(UserRole.RIDER, OrderStatus.RIDER_ASSIGNED, OrderStatus.DELIVERED), false);
  });

  await suite.test('ADMIN may recover orders but never force DELIVERED', () => {
    assert.equal(canTransitionOrder(UserRole.ADMIN, OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED_BY_SYSTEM), true);
    assert.equal(canTransitionOrder(UserRole.ADMIN, OrderStatus.PREPARING, OrderStatus.READY_FOR_PICKUP), true);
    assert.equal(canTransitionOrder(UserRole.ADMIN, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED), false);
    assert.equal(canTransitionOrder(UserRole.ADMIN, OrderStatus.DELIVERED, OrderStatus.CANCELLED_BY_SYSTEM), false);
  });

  await suite.test('CUSTOMER can never drive order status directly', () => {
    assert.deepEqual(allowedPairs(UserRole.CUSTOMER), []);
  });

  await suite.test('happy path stages are ordered end-to-end', () => {
    assert.deepEqual(HAPPY_PATH_STAGES, [
      OrderStatus.PAID,
      OrderStatus.ACCEPTED_BY_KITCHEN,
      OrderStatus.PREPARING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.RIDER_ASSIGNED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ]);
  });

  await suite.test('customer tracking copy covers every happy-path stage', () => {
    assert.equal(CUSTOMER_TRACKING_STEPS.length, HAPPY_PATH_STAGES.length);
    CUSTOMER_TRACKING_STEPS.forEach((step, index) => {
      assert.equal(step.status, HAPPY_PATH_STAGES[index]);
      assert.ok(step.label.length > 0);
      assert.ok(step.hint.length > 0);
    });
  });

  await suite.test('trackingStageIndex maps progress and flags cancellations', () => {
    assert.equal(trackingStageIndex(OrderStatus.PAID), 0);
    assert.equal(trackingStageIndex(OrderStatus.DELIVERED), 6);
    assert.equal(trackingStageIndex(OrderStatus.CANCELLED_BY_SYSTEM), -1);
    assert.equal(trackingStageIndex(OrderStatus.CANCELLED_BY_CUSTOMER), -1);
    assert.equal(trackingStageIndex(OrderStatus.CANCELLED_BY_KITCHEN), -1);
    assert.equal(trackingStageIndex(OrderStatus.PAYMENT_PENDING), -1);
  });

  await suite.test('ADMIN transition matrix is broad but excludes DELIVERED entirely', () => {
    const adminPairs = allowedPairs(UserRole.ADMIN);
    assert.ok(adminPairs.length > 50, `expected a broad ADMIN matrix, got ${adminPairs.length}`);
    assert.equal(adminPairs.some((pair) => pair.includes('DELIVERED')), false, 'ADMIN must never touch DELIVERED');
    assert.equal(canTransitionOrder(UserRole.ADMIN, OrderStatus.PAID, OrderStatus.PAID), true);
    assert.equal(canTransitionOrder(UserRole.ADMIN, OrderStatus.DELIVERED, OrderStatus.DELIVERED), false);
    assert.equal(canTransitionOrder(UserRole.ADMIN, OrderStatus.CANCELLED_BY_CUSTOMER, OrderStatus.PAID), true);
  });

  await suite.test('terminal statuses are sinks for kitchen and rider roles', () => {
    for (const terminal of [OrderStatus.DELIVERED, OrderStatus.CANCELLED_BY_CUSTOMER, OrderStatus.CANCELLED_BY_KITCHEN, OrderStatus.CANCELLED_BY_SYSTEM]) {
      for (const next of ALL_STATUSES) {
        assert.equal(canTransitionOrder(UserRole.RESTAURANT, terminal, next), false, `RESTAURANT escapes ${terminal} -> ${next}`);
        assert.equal(canTransitionOrder(UserRole.RIDER, terminal, next), false, `RIDER escapes ${terminal} -> ${next}`);
      }
    }
    assert.equal(trackingStageIndex(OrderStatus.PREPARING), 2);
    assert.equal(trackingStageIndex(OrderStatus.RIDER_ASSIGNED), 4);
  });
});
