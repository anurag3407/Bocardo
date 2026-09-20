// src/enums.ts
var UserRole = /* @__PURE__ */ ((UserRole2) => {
  UserRole2["CUSTOMER"] = "CUSTOMER";
  UserRole2["RESTAURANT"] = "RESTAURANT";
  UserRole2["RIDER"] = "RIDER";
  UserRole2["ADMIN"] = "ADMIN";
  return UserRole2;
})(UserRole || {});
var OrderStatus = /* @__PURE__ */ ((OrderStatus2) => {
  OrderStatus2["PAYMENT_PENDING"] = "PAYMENT_PENDING";
  OrderStatus2["PAID"] = "PAID";
  OrderStatus2["ACCEPTED_BY_KITCHEN"] = "ACCEPTED_BY_KITCHEN";
  OrderStatus2["PREPARING"] = "PREPARING";
  OrderStatus2["READY_FOR_PICKUP"] = "READY_FOR_PICKUP";
  OrderStatus2["RIDER_ASSIGNED"] = "RIDER_ASSIGNED";
  OrderStatus2["OUT_FOR_DELIVERY"] = "OUT_FOR_DELIVERY";
  OrderStatus2["DELIVERED"] = "DELIVERED";
  OrderStatus2["CANCELLED_BY_CUSTOMER"] = "CANCELLED_BY_CUSTOMER";
  OrderStatus2["CANCELLED_BY_KITCHEN"] = "CANCELLED_BY_KITCHEN";
  OrderStatus2["CANCELLED_BY_SYSTEM"] = "CANCELLED_BY_SYSTEM";
  return OrderStatus2;
})(OrderStatus || {});
var MealSlot = /* @__PURE__ */ ((MealSlot2) => {
  MealSlot2["BREAKFAST"] = "BREAKFAST";
  MealSlot2["LUNCH"] = "LUNCH";
  MealSlot2["SNACKS"] = "SNACKS";
  MealSlot2["DINNER"] = "DINNER";
  MealSlot2["LATE_NIGHT"] = "LATE_NIGHT";
  return MealSlot2;
})(MealSlot || {});
var SettlementStatus = /* @__PURE__ */ ((SettlementStatus2) => {
  SettlementStatus2["PENDING"] = "PENDING";
  SettlementStatus2["PAID"] = "PAID";
  return SettlementStatus2;
})(SettlementStatus || {});
var EntityType = /* @__PURE__ */ ((EntityType2) => {
  EntityType2["RESTAURANT"] = "RESTAURANT";
  EntityType2["RIDER"] = "RIDER";
  return EntityType2;
})(EntityType || {});
var FoodType = /* @__PURE__ */ ((FoodType2) => {
  FoodType2["VEG"] = "VEG";
  FoodType2["NON_VEG"] = "NON_VEG";
  FoodType2["EGG"] = "EGG";
  return FoodType2;
})(FoodType || {});
var DiscountType = /* @__PURE__ */ ((DiscountType2) => {
  DiscountType2["PERCENTAGE"] = "PERCENTAGE";
  DiscountType2["FLAT"] = "FLAT";
  return DiscountType2;
})(DiscountType || {});

// src/tax.ts
var FOOD_GST_PERCENT = 5;
var SERVICE_GST_PERCENT = 18;
var COMMISSION_GST_PERCENT = 18;
var SECTION_194O_TDS_PERCENT = 1;
var SECTION_52_TCS_PERCENT = 1;
var DEFAULT_PLATFORM_FEE_PAISE = 500;
var DEFAULT_DELIVERY_FEE_PAISE = 4e3;
var DEFAULT_PACKAGING_FEE_PAISE = 1500;
var DEFAULT_TIP_PAISE = 0;
var TIP_CHIPS_PAISE = [2e3, 3e3, 5e3];
function calculateSettlementBreakdown(grossPaise, commissionRate = 15, packagingPaise = 0) {
  const safeGross = Math.max(0, Math.floor(grossPaise));
  const safePackaging = Math.max(0, Math.floor(packagingPaise));
  const rate = Math.max(0, commissionRate);
  const commissionPaise = Math.round(safeGross * rate / 100);
  const commissionGstPaise = Math.round(commissionPaise * COMMISSION_GST_PERCENT / 100);
  const tdsPaise = Math.round(safeGross * SECTION_194O_TDS_PERCENT / 100);
  const tcsPaise = Math.round(safeGross * SECTION_52_TCS_PERCENT / 100);
  const totalDeductionsPaise = commissionPaise + commissionGstPaise + tdsPaise + tcsPaise;
  const netPayoutPaise = Math.max(0, safeGross + safePackaging - totalDeductionsPaise);
  return {
    grossPaise: safeGross,
    packagingPaise: safePackaging,
    commissionPaise,
    commissionGstPaise,
    tdsPaise,
    tcsPaise,
    totalDeductionsPaise,
    netPayoutPaise
  };
}
function calculateOrderTaxBreakdown(subtotalPaise, deliveryFeePaise = DEFAULT_DELIVERY_FEE_PAISE, platformFeePaise = DEFAULT_PLATFORM_FEE_PAISE, packagingFeePaise = 0, tipPaise = DEFAULT_TIP_PAISE) {
  const safeSubtotal = Math.max(0, Math.floor(subtotalPaise));
  const safeDelivery = Math.max(0, Math.floor(deliveryFeePaise));
  const safePlatform = Math.max(0, Math.floor(platformFeePaise));
  const safePackaging = Math.max(0, Math.floor(packagingFeePaise));
  const safeTip = Math.max(0, Math.floor(tipPaise));
  const foodGstPaise = Math.round(safeSubtotal * FOOD_GST_PERCENT / 100);
  const serviceBasePaise = safeDelivery + safePlatform;
  const serviceGstPaise = Math.round(serviceBasePaise * SERVICE_GST_PERCENT / 100);
  const totalAmountPaise = safeSubtotal + foodGstPaise + safeDelivery + safePlatform + serviceGstPaise + safePackaging + safeTip;
  return {
    subtotalPaise: safeSubtotal,
    foodGstPaise,
    deliveryFeePaise: safeDelivery,
    platformFeePaise: safePlatform,
    serviceGstPaise,
    packagingFeePaise: safePackaging,
    tipPaise: safeTip,
    totalAmountPaise
  };
}
function haversineMeters(latitude1, longitude1, latitude2, longitude2) {
  const earthRadiusMeters = 6371e3;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = toRadians(latitude2 - latitude1);
  const deltaLng = toRadians(longitude2 - longitude1);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}
var GEOFENCE_ARRIVAL_RADIUS_METERS = 100;
var GEOFENCE_GATE_HANDOVER_RADIUS_METERS = 300;
var GEOFENCE_EMERGENCY_RADIUS_METERS = 500;
function formatPaiseToRupees(paise) {
  const numPaise = typeof paise === "bigint" ? Number(paise) : paise;
  const rupees = numPaise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: numPaise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(rupees);
}
function maskPhoneNumber(phone) {
  if (!phone) return "***";
  const cleaned = phone.trim().replace(/\s+/g, "");
  if (cleaned.length < 10) return "***";
  const last10 = cleaned.slice(-10);
  const countryPrefix = cleaned.length > 10 ? cleaned.slice(0, -10) + " " : "";
  const first2 = last10.slice(0, 2);
  const last3 = last10.slice(-3);
  return `${countryPrefix}${first2}*** **${last3}`;
}

// src/menu.ts
import { z } from "zod";
var DishVariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // e.g. "Half", "Full", "Regular", "Large"
  pricePaise: z.number().int().nonnegative(),
  // absolute unit price for this variant
  isDefault: z.boolean().default(false)
});
var AddOnOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pricePaise: z.number().int().nonnegative(),
  isAvailable: z.boolean().default(true),
  isVeg: z.boolean().optional()
});
var AddOnGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // e.g. "Choose your raita", "Add extra toppings"
  minSelections: z.number().int().nonnegative().default(0),
  maxSelections: z.number().int().positive().default(1),
  isMultiSelect: z.boolean().default(false),
  options: z.array(AddOnOptionSchema).min(1)
});
var AddOnSelectionSchema = z.object({
  groupId: z.string().min(1),
  optionId: z.string().min(1),
  quantity: z.number().int().positive().max(20)
});
var MenuCustomizationSchema = z.object({
  variantId: z.string().nullable().optional(),
  addOns: z.array(AddOnSelectionSchema).default([])
});
function priceCustomization(basePricePaise, config, selection) {
  const variants = config.variants ?? [];
  const groups = config.addOnGroups ?? [];
  let unitBasePaise = Math.max(0, Math.floor(basePricePaise));
  let variantId = null;
  let variantName = null;
  if (variants.length > 0) {
    const chosen = variants.find((variant) => variant.id === selection.variantId) ?? variants.find((variant) => variant.isDefault) ?? variants[0];
    variantId = chosen.id;
    variantName = chosen.name;
    unitBasePaise = chosen.pricePaise;
  }
  const optionsByGroup = new Map(groups.map((group) => [group.id, group]));
  const addOnSummary = [];
  let addOnsPaise = 0;
  const consumedByGroup = /* @__PURE__ */ new Map();
  for (const addOn of selection.addOns) {
    const group = optionsByGroup.get(addOn.groupId);
    if (!group) continue;
    const option = group.options.find((candidate) => candidate.id === addOn.optionId);
    if (!option) continue;
    if (!option.isAvailable) {
      throw new Error(`"${option.name}" is currently unavailable.`);
    }
    const consumed = (consumedByGroup.get(addOn.groupId) ?? 0) + addOn.quantity;
    consumedByGroup.set(addOn.groupId, consumed);
    addOnsPaise += option.pricePaise * addOn.quantity;
    addOnSummary.push(addOn.quantity > 1 ? `${option.name} x${addOn.quantity}` : option.name);
  }
  for (const group of groups) {
    const consumed = consumedByGroup.get(group.id) ?? 0;
    if (group.minSelections > 0 && consumed < group.minSelections) {
      throw new Error(`Please choose ${group.minSelections > 1 ? `at least ${group.minSelections} options` : "an option"} from "${group.name}".`);
    }
    const max = group.isMultiSelect ? group.maxSelections : 1;
    if (consumed > max) {
      throw new Error(`You can select up to ${max} option${max === 1 ? "" : "s"} from "${group.name}".`);
    }
  }
  return {
    variantId,
    variantName,
    unitBasePaise,
    addOnsPaise,
    unitPricePaise: unitBasePaise + addOnsPaise,
    addOnSummary
  };
}
function buildCartLineId(dishId, selection) {
  const variantPart = selection.variantId ?? "base";
  const addOnPart = [...selection.addOns].sort((a, b) => (a.groupId + a.optionId).localeCompare(b.groupId + b.optionId)).map((addOn) => `${addOn.groupId}:${addOn.optionId}x${addOn.quantity}`).join(",");
  return `${dishId}::${variantPart}::${addOnPart}`;
}
function serializeCustomization(selection) {
  return buildCartLineId("", selection).replace(/^::/, "");
}

// src/transitions.ts
function canTransitionOrder(role, current, next) {
  if (role === "RESTAURANT" /* RESTAURANT */) {
    return current === "PAID" /* PAID */ && next === "ACCEPTED_BY_KITCHEN" /* ACCEPTED_BY_KITCHEN */ || current === "ACCEPTED_BY_KITCHEN" /* ACCEPTED_BY_KITCHEN */ && next === "PREPARING" /* PREPARING */ || current === "PREPARING" /* PREPARING */ && next === "READY_FOR_PICKUP" /* READY_FOR_PICKUP */ || current === "PAID" /* PAID */ && next === "CANCELLED_BY_KITCHEN" /* CANCELLED_BY_KITCHEN */ || current === "ACCEPTED_BY_KITCHEN" /* ACCEPTED_BY_KITCHEN */ && next === "CANCELLED_BY_KITCHEN" /* CANCELLED_BY_KITCHEN */ || current === "PREPARING" /* PREPARING */ && next === "CANCELLED_BY_KITCHEN" /* CANCELLED_BY_KITCHEN */;
  }
  if (role === "RIDER" /* RIDER */) {
    return current === "READY_FOR_PICKUP" /* READY_FOR_PICKUP */ && next === "RIDER_ASSIGNED" /* RIDER_ASSIGNED */ || current === "RIDER_ASSIGNED" /* RIDER_ASSIGNED */ && next === "OUT_FOR_DELIVERY" /* OUT_FOR_DELIVERY */;
  }
  if (role === "ADMIN" /* ADMIN */) {
    return current !== "DELIVERED" /* DELIVERED */ && next !== "DELIVERED" /* DELIVERED */;
  }
  return false;
}
var HAPPY_PATH_STAGES = [
  "PAID" /* PAID */,
  "ACCEPTED_BY_KITCHEN" /* ACCEPTED_BY_KITCHEN */,
  "PREPARING" /* PREPARING */,
  "READY_FOR_PICKUP" /* READY_FOR_PICKUP */,
  "RIDER_ASSIGNED" /* RIDER_ASSIGNED */,
  "OUT_FOR_DELIVERY" /* OUT_FOR_DELIVERY */,
  "DELIVERED" /* DELIVERED */
];
var CUSTOMER_TRACKING_STEPS = [
  { status: "PAID" /* PAID */, label: "Order Placed", hint: "Payment confirmed" },
  { status: "ACCEPTED_BY_KITCHEN" /* ACCEPTED_BY_KITCHEN */, label: "Kitchen Accepted", hint: "Restaurant confirmed your order" },
  { status: "PREPARING" /* PREPARING */, label: "Preparing Fresh Food", hint: "Chef is cooking your meal" },
  { status: "READY_FOR_PICKUP" /* READY_FOR_PICKUP */, label: "Food Ready", hint: "Packed and waiting for rider" },
  { status: "RIDER_ASSIGNED" /* RIDER_ASSIGNED */, label: "Rider Assigned", hint: "Delivery partner heading to restaurant" },
  { status: "OUT_FOR_DELIVERY" /* OUT_FOR_DELIVERY */, label: "Out for Delivery", hint: "Your food is on the way" },
  { status: "DELIVERED" /* DELIVERED */, label: "Delivered", hint: "Enjoy your meal!" }
];
function trackingStageIndex(status) {
  return HAPPY_PATH_STAGES.indexOf(status);
}

// src/schemas.ts
import { z as z2 } from "zod";
var UserRoleSchema = z2.nativeEnum(UserRole);
var OrderStatusSchema = z2.nativeEnum(OrderStatus);
var MealSlotSchema = z2.nativeEnum(MealSlot);
var SettlementStatusSchema = z2.nativeEnum(SettlementStatus);
var EntityTypeSchema = z2.nativeEnum(EntityType);
var FoodTypeSchema = z2.nativeEnum(FoodType);
var GpsCoordinateSchema = z2.object({
  latitude: z2.number().min(-90).max(90),
  longitude: z2.number().min(-180).max(180),
  heading: z2.number().min(0).max(360).optional(),
  speed: z2.number().min(0).max(120).optional(),
  // max 120 km/h / realistic threshold
  accuracy: z2.number().finite().nonnegative().optional(),
  timestamp: z2.number().int().positive().optional(),
  isMocked: z2.boolean().default(false)
}).refine((data) => !data.isMocked, {
  message: "Mock GPS detected. Spoofed coordinates are rejected.",
  path: ["isMocked"]
});
var UserSchema = z2.object({
  id: z2.string().uuid(),
  clerkId: z2.string(),
  email: z2.string().email().nullable().optional(),
  phone: z2.string().nullable().optional(),
  fullName: z2.string().nullable().optional(),
  role: UserRoleSchema,
  isSuspended: z2.boolean().default(false),
  createdAt: z2.string().or(z2.date()),
  updatedAt: z2.string().or(z2.date())
});
var RestaurantSchema = z2.object({
  id: z2.string().uuid(),
  ownerId: z2.string().uuid(),
  name: z2.string().min(2),
  slug: z2.string().min(2),
  phone: z2.string(),
  latitude: z2.number(),
  longitude: z2.number(),
  address: z2.string(),
  gstin: z2.string().length(15).optional().nullable(),
  commissionRate: z2.number().min(0).max(100).default(15),
  isActive: z2.boolean().default(true),
  isAcceptingOrders: z2.boolean().default(true),
  rating: z2.number().min(1).max(5).default(4),
  cuisine: z2.array(z2.string()).optional(),
  imageUrl: z2.string().url().optional(),
  createdAt: z2.string().or(z2.date())
});
var DishSchema = z2.object({
  id: z2.string().uuid(),
  restaurantId: z2.string().uuid(),
  name: z2.string().min(1),
  description: z2.string().nullable().optional(),
  pricePaise: z2.number().int().positive(),
  // stored in paise e.g. ₹100 = 10000
  imageUrl: z2.string().url().nullable().optional(),
  isVeg: z2.boolean().default(true),
  foodType: FoodTypeSchema.default("VEG" /* VEG */),
  isAvailable: z2.boolean().default(true),
  mealSlots: z2.array(MealSlotSchema).default(["LUNCH" /* LUNCH */, "DINNER" /* DINNER */]),
  preparationTimeMinutes: z2.number().int().default(20),
  category: z2.string().default("Main Course"),
  variants: z2.array(z2.any()).optional(),
  addOnGroups: z2.array(z2.any()).optional(),
  createdAt: z2.string().or(z2.date())
});
var OrderItemSchema = z2.object({
  id: z2.string().uuid().optional(),
  dishId: z2.string().uuid(),
  name: z2.string(),
  quantity: z2.number().int().positive(),
  unitPricePaise: z2.number().int().positive(),
  totalPricePaise: z2.number().int().positive(),
  customization: z2.string().nullable().optional(),
  addOnSummary: z2.array(z2.string()).optional()
});
var CreateOrderInputSchema = z2.object({
  restaurantId: z2.string().uuid(),
  items: z2.array(
    z2.object({
      dishId: z2.string().uuid(),
      quantity: z2.number().int().positive().max(50),
      customization: MenuCustomizationSchema.optional()
    })
  ).min(1, "Cart cannot be empty"),
  deliveryLatitude: z2.number().min(-90).max(90),
  deliveryLongitude: z2.number().min(-180).max(180),
  deliveryAddress: z2.string().min(5),
  specialInstructions: z2.string().max(250).optional(),
  tipPaise: z2.number().int().min(0).max(1e5).optional()
});
var OrderSchema = z2.object({
  id: z2.string().uuid(),
  customerId: z2.string().uuid(),
  restaurantId: z2.string().uuid(),
  riderId: z2.string().uuid().nullable().optional(),
  status: OrderStatusSchema,
  deliveryLatitude: z2.number(),
  deliveryLongitude: z2.number(),
  deliveryAddress: z2.string(),
  deliveryOtp: z2.string().length(4),
  // 4-digit code customer gives to rider
  // Financials in integer paise
  subtotalPaise: z2.number().int(),
  foodGstPaise: z2.number().int(),
  deliveryFeePaise: z2.number().int(),
  platformFeePaise: z2.number().int(),
  serviceGstPaise: z2.number().int(),
  packagingFeePaise: z2.number().int().default(0),
  tipPaise: z2.number().int().default(0),
  totalAmountPaise: z2.number().int(),
  razorpayOrderId: z2.string().nullable().optional(),
  razorpayPaymentId: z2.string().nullable().optional(),
  cancelReason: z2.string().nullable().optional(),
  refundId: z2.string().nullable().optional(),
  createdAt: z2.string().or(z2.date()),
  updatedAt: z2.string().or(z2.date()),
  items: z2.array(OrderItemSchema).optional(),
  restaurant: RestaurantSchema.optional(),
  customerPhone: z2.string().optional()
});
var VerifyDeliveryOtpSchema = z2.object({
  orderId: z2.string().uuid(),
  otp: z2.string().regex(/^\d{4}$/, "OTP must be exactly 4 digits"),
  isGateHandover: z2.boolean().optional(),
  emergencyOverride: z2.boolean().optional(),
  emergencyReason: z2.string().max(250).optional()
});
var SettlementSchema = z2.object({
  id: z2.string().uuid(),
  entityType: EntityTypeSchema,
  entityId: z2.string().uuid(),
  entityName: z2.string().optional(),
  startDate: z2.string(),
  endDate: z2.string(),
  grossAmountPaise: z2.number().int(),
  commissionDeductedPaise: z2.number().int(),
  commissionGstPaise: z2.number().int().optional(),
  tdsDeductedPaise: z2.number().int().optional(),
  tcsDeductedPaise: z2.number().int().optional(),
  packagingFeePaise: z2.number().int().optional(),
  netPayoutPaise: z2.number().int(),
  status: SettlementStatusSchema,
  bankUtrReference: z2.string().nullable().optional(),
  bankAccountNumber: z2.string().optional(),
  bankIfscCode: z2.string().optional(),
  paidAt: z2.string().or(z2.date()).nullable().optional(),
  createdAt: z2.string().or(z2.date())
});
var ReconcileSettlementSchema = z2.object({
  settlementId: z2.string().uuid(),
  bankUtrReference: z2.string().min(6, "Valid bank UTR reference is required")
});

// src/socket.ts
var SOCKET_EVENTS = {
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  JOIN_ROOM: "join:room",
  LEAVE_ROOM: "leave:room",
  RIDER_LOCATION_UPDATE: "rider:location:update",
  ORDER_TRACKING: "order_tracking",
  DISPATCH_OFFER: "dispatch:offer",
  DISPATCH_RESPONSE: "dispatch:response",
  RESTAURANT_NEW_ORDER: "restaurant:new_order",
  ORDER_STATUS_UPDATE: "order:status:update",
  PREP_TIME_UPDATE: "order:prep_time:update",
  ITEM_86_UPDATE: "restaurant:item_86",
  DISPATCH_CASCADE: "dispatch:cascade"
};
export {
  AddOnGroupSchema,
  AddOnOptionSchema,
  AddOnSelectionSchema,
  COMMISSION_GST_PERCENT,
  CUSTOMER_TRACKING_STEPS,
  CreateOrderInputSchema,
  DEFAULT_DELIVERY_FEE_PAISE,
  DEFAULT_PACKAGING_FEE_PAISE,
  DEFAULT_PLATFORM_FEE_PAISE,
  DEFAULT_TIP_PAISE,
  DiscountType,
  DishSchema,
  DishVariantSchema,
  EntityType,
  EntityTypeSchema,
  FOOD_GST_PERCENT,
  FoodType,
  FoodTypeSchema,
  GEOFENCE_ARRIVAL_RADIUS_METERS,
  GEOFENCE_EMERGENCY_RADIUS_METERS,
  GEOFENCE_GATE_HANDOVER_RADIUS_METERS,
  GpsCoordinateSchema,
  HAPPY_PATH_STAGES,
  MealSlot,
  MealSlotSchema,
  MenuCustomizationSchema,
  OrderItemSchema,
  OrderSchema,
  OrderStatus,
  OrderStatusSchema,
  ReconcileSettlementSchema,
  RestaurantSchema,
  SECTION_194O_TDS_PERCENT,
  SECTION_52_TCS_PERCENT,
  SERVICE_GST_PERCENT,
  SOCKET_EVENTS,
  SettlementSchema,
  SettlementStatus,
  SettlementStatusSchema,
  TIP_CHIPS_PAISE,
  UserRole,
  UserRoleSchema,
  UserSchema,
  VerifyDeliveryOtpSchema,
  buildCartLineId,
  calculateOrderTaxBreakdown,
  calculateSettlementBreakdown,
  canTransitionOrder,
  formatPaiseToRupees,
  haversineMeters,
  maskPhoneNumber,
  priceCustomization,
  serializeCustomization,
  trackingStageIndex
};
