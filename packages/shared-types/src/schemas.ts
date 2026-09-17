import { z } from 'zod';
import { UserRole, OrderStatus, MealSlot, SettlementStatus, EntityType } from './enums';

export const UserRoleSchema = z.nativeEnum(UserRole);
export const OrderStatusSchema = z.nativeEnum(OrderStatus);
export const MealSlotSchema = z.nativeEnum(MealSlot);
export const SettlementStatusSchema = z.nativeEnum(SettlementStatus);
export const EntityTypeSchema = z.nativeEnum(EntityType);

// GPS Coordinate Schema with Anti-Cheat Mock GPS Detection
export const GpsCoordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).max(120).optional(), // max 120 km/h / realistic threshold
  accuracy: z.number().optional(),
  timestamp: z.number().optional(),
  isMocked: z.boolean().default(false),
}).refine((data) => !data.isMocked, {
  message: 'Mock GPS detected. Spoofed coordinates are rejected.',
  path: ['isMocked'],
});

export type GpsCoordinate = z.infer<typeof GpsCoordinateSchema>;

// User Schemas
export const UserSchema = z.object({
  id: z.string().uuid(),
  clerkId: z.string(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  fullName: z.string().nullable().optional(),
  role: UserRoleSchema,
  isSuspended: z.boolean().default(false),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export type User = z.infer<typeof UserSchema>;

// Restaurant Schemas
export const RestaurantSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(2),
  slug: z.string().min(2),
  phone: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string(),
  gstin: z.string().length(15).optional().nullable(),
  commissionRate: z.number().min(0).max(100).default(15.0),
  isActive: z.boolean().default(true),
  isAcceptingOrders: z.boolean().default(true),
  rating: z.number().min(1).max(5).default(4.0),
  cuisine: z.array(z.string()).optional(),
  imageUrl: z.string().url().optional(),
  createdAt: z.string().or(z.date()),
});

export type Restaurant = z.infer<typeof RestaurantSchema>;

// Dish Schemas
export const DishSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  pricePaise: z.number().int().positive(), // stored in paise e.g. ₹100 = 10000
  imageUrl: z.string().url().nullable().optional(),
  isVeg: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  mealSlots: z.array(MealSlotSchema).default([MealSlot.LUNCH, MealSlot.DINNER]),
  preparationTimeMinutes: z.number().int().default(20),
  category: z.string().default('Main Course'),
  createdAt: z.string().or(z.date()),
});

export type Dish = z.infer<typeof DishSchema>;

// Order Item Schemas
export const OrderItemSchema = z.object({
  id: z.string().uuid().optional(),
  dishId: z.string().uuid(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPricePaise: z.number().int().positive(),
  totalPricePaise: z.number().int().positive(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

// Create Order Input Schema (Cart Checkout)
export const CreateOrderInputSchema = z.object({
  restaurantId: z.string().uuid(),
  items: z.array(
    z.object({
      dishId: z.string().uuid(),
      quantity: z.number().int().positive().max(50),
    })
  ).min(1, 'Cart cannot be empty'),
  deliveryLatitude: z.number().min(-90).max(90),
  deliveryLongitude: z.number().min(-180).max(180),
  deliveryAddress: z.string().min(5),
  specialInstructions: z.string().max(250).optional(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

// Full Order Schema
export const OrderSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  riderId: z.string().uuid().nullable().optional(),
  status: OrderStatusSchema,
  deliveryLatitude: z.number(),
  deliveryLongitude: z.number(),
  deliveryAddress: z.string(),
  deliveryOtp: z.string().length(4), // 4-digit code customer gives to rider
  
  // Financials in integer paise
  subtotalPaise: z.number().int(),
  foodGstPaise: z.number().int(),
  deliveryFeePaise: z.number().int(),
  platformFeePaise: z.number().int(),
  serviceGstPaise: z.number().int(),
  totalAmountPaise: z.number().int(),
  
  razorpayOrderId: z.string().nullable().optional(),
  razorpayPaymentId: z.string().nullable().optional(),
  cancelReason: z.string().nullable().optional(),
  refundId: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  items: z.array(OrderItemSchema).optional(),
  restaurant: RestaurantSchema.optional(),
  customerPhone: z.string().optional(),
});

export type Order = z.infer<typeof OrderSchema>;

// Handover OTP Verification Schema
export const VerifyDeliveryOtpSchema = z.object({
  orderId: z.string().uuid(),
  otp: z.string().regex(/^\d{4}$/, 'OTP must be exactly 4 digits'),
});

export type VerifyDeliveryOtp = z.infer<typeof VerifyDeliveryOtpSchema>;

// Settlement Schema
export const SettlementSchema = z.object({
  id: z.string().uuid(),
  entityType: EntityTypeSchema,
  entityId: z.string().uuid(),
  entityName: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  grossAmountPaise: z.number().int(),
  commissionDeductedPaise: z.number().int(),
  netPayoutPaise: z.number().int(),
  status: SettlementStatusSchema,
  bankUtrReference: z.string().nullable().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfscCode: z.string().optional(),
  paidAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
});

export type Settlement = z.infer<typeof SettlementSchema>;

// UTR Reconciliation Input Schema
export const ReconcileSettlementSchema = z.object({
  settlementId: z.string().uuid(),
  bankUtrReference: z.string().min(6, 'Valid bank UTR reference is required'),
});

export type ReconcileSettlement = z.infer<typeof ReconcileSettlementSchema>;
