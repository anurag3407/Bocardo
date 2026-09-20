export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  RESTAURANT = 'RESTAURANT',
  RIDER = 'RIDER',
  ADMIN = 'ADMIN',
}

export enum OrderStatus {
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAID = 'PAID',
  ACCEPTED_BY_KITCHEN = 'ACCEPTED_BY_KITCHEN',
  PREPARING = 'PREPARING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  RIDER_ASSIGNED = 'RIDER_ASSIGNED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED_BY_CUSTOMER = 'CANCELLED_BY_CUSTOMER',
  CANCELLED_BY_KITCHEN = 'CANCELLED_BY_KITCHEN',
  CANCELLED_BY_SYSTEM = 'CANCELLED_BY_SYSTEM',
}

export enum MealSlot {
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  SNACKS = 'SNACKS',
  DINNER = 'DINNER',
  LATE_NIGHT = 'LATE_NIGHT',
}

export enum SettlementStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
}

export enum EntityType {
  RESTAURANT = 'RESTAURANT',
  RIDER = 'RIDER',
}

/**
 * Diet classification for Indian food platforms.
 * VEG = green dot, NON_VEG = brown/red triangle, EGG = amber egg badge.
 */
export enum FoodType {
  VEG = 'VEG',
  NON_VEG = 'NON_VEG',
  EGG = 'EGG',
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FLAT = 'FLAT',
}
