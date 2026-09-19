import { OrderStatus, UserRole } from './enums';

export function canTransitionOrder(role: UserRole, current: OrderStatus, next: OrderStatus): boolean {
  if (role === UserRole.RESTAURANT) {
    return (current === OrderStatus.PAID && next === OrderStatus.ACCEPTED_BY_KITCHEN)
      || (current === OrderStatus.ACCEPTED_BY_KITCHEN && next === OrderStatus.PREPARING)
      || (current === OrderStatus.PREPARING && next === OrderStatus.READY_FOR_PICKUP);
  }
  return role === UserRole.RIDER && current === OrderStatus.RIDER_ASSIGNED && next === OrderStatus.OUT_FOR_DELIVERY;
}
