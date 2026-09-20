import { OrderStatus, UserRole } from './enums';

/**
 * Central order state machine. Every status change must pass through here so
 * that no role can skip stages (e.g. kitchen cannot jump to DELIVERED).
 */
export function canTransitionOrder(
  role: UserRole,
  current: OrderStatus,
  next: OrderStatus
): boolean {
  if (role === UserRole.RESTAURANT) {
    return (
      (current === OrderStatus.PAID && next === OrderStatus.ACCEPTED_BY_KITCHEN) ||
      (current === OrderStatus.ACCEPTED_BY_KITCHEN && next === OrderStatus.PREPARING) ||
      (current === OrderStatus.PREPARING && next === OrderStatus.READY_FOR_PICKUP) ||
      (current === OrderStatus.PAID && next === OrderStatus.CANCELLED_BY_KITCHEN) ||
      (current === OrderStatus.ACCEPTED_BY_KITCHEN && next === OrderStatus.CANCELLED_BY_KITCHEN) ||
      (current === OrderStatus.PREPARING && next === OrderStatus.CANCELLED_BY_KITCHEN)
    );
  }
  if (role === UserRole.RIDER) {
    return (
      (current === OrderStatus.READY_FOR_PICKUP && next === OrderStatus.RIDER_ASSIGNED) ||
      (current === OrderStatus.RIDER_ASSIGNED && next === OrderStatus.OUT_FOR_DELIVERY)
    );
  }
  if (role === UserRole.ADMIN) {
    return current !== OrderStatus.DELIVERED && next !== OrderStatus.DELIVERED;
  }
  return false;
}

/**
 * Ordering of the happy-path delivery journey, used by the customer tracking stepper.
 */
export const HAPPY_PATH_STAGES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.ACCEPTED_BY_KITCHEN,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.RIDER_ASSIGNED,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

export const CUSTOMER_TRACKING_STEPS: Array<{ status: OrderStatus; label: string; hint: string }> = [
  { status: OrderStatus.PAID, label: 'Order Placed', hint: 'Payment confirmed' },
  { status: OrderStatus.ACCEPTED_BY_KITCHEN, label: 'Kitchen Accepted', hint: 'Restaurant confirmed your order' },
  { status: OrderStatus.PREPARING, label: 'Preparing Fresh Food', hint: 'Chef is cooking your meal' },
  { status: OrderStatus.READY_FOR_PICKUP, label: 'Food Ready', hint: 'Packed and waiting for rider' },
  { status: OrderStatus.RIDER_ASSIGNED, label: 'Rider Assigned', hint: 'Delivery partner heading to restaurant' },
  { status: OrderStatus.OUT_FOR_DELIVERY, label: 'Out for Delivery', hint: 'Your food is on the way' },
  { status: OrderStatus.DELIVERED, label: 'Delivered', hint: 'Enjoy your meal!' },
];

/** Returns the index of the active stage, or -1 when cancelled. */
export function trackingStageIndex(status: OrderStatus): number {
  return HAPPY_PATH_STAGES.indexOf(status);
}
