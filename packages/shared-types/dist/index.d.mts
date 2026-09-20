import { z } from 'zod';

declare enum UserRole {
    CUSTOMER = "CUSTOMER",
    RESTAURANT = "RESTAURANT",
    RIDER = "RIDER",
    ADMIN = "ADMIN"
}
declare enum OrderStatus {
    PAYMENT_PENDING = "PAYMENT_PENDING",
    PAID = "PAID",
    ACCEPTED_BY_KITCHEN = "ACCEPTED_BY_KITCHEN",
    PREPARING = "PREPARING",
    READY_FOR_PICKUP = "READY_FOR_PICKUP",
    RIDER_ASSIGNED = "RIDER_ASSIGNED",
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
    DELIVERED = "DELIVERED",
    CANCELLED_BY_CUSTOMER = "CANCELLED_BY_CUSTOMER",
    CANCELLED_BY_KITCHEN = "CANCELLED_BY_KITCHEN",
    CANCELLED_BY_SYSTEM = "CANCELLED_BY_SYSTEM"
}
declare enum MealSlot {
    BREAKFAST = "BREAKFAST",
    LUNCH = "LUNCH",
    SNACKS = "SNACKS",
    DINNER = "DINNER",
    LATE_NIGHT = "LATE_NIGHT"
}
declare enum SettlementStatus {
    PENDING = "PENDING",
    PAID = "PAID"
}
declare enum EntityType {
    RESTAURANT = "RESTAURANT",
    RIDER = "RIDER"
}
/**
 * Diet classification for Indian food platforms.
 * VEG = green dot, NON_VEG = brown/red triangle, EGG = amber egg badge.
 */
declare enum FoodType {
    VEG = "VEG",
    NON_VEG = "NON_VEG",
    EGG = "EGG"
}
declare enum DiscountType {
    PERCENTAGE = "PERCENTAGE",
    FLAT = "FLAT"
}

interface OrderTaxBreakdown {
    subtotalPaise: number;
    foodGstPaise: number;
    deliveryFeePaise: number;
    platformFeePaise: number;
    serviceGstPaise: number;
    packagingFeePaise: number;
    tipPaise: number;
    totalAmountPaise: number;
}
declare const FOOD_GST_PERCENT = 5;
declare const SERVICE_GST_PERCENT = 18;
declare const COMMISSION_GST_PERCENT = 18;
declare const SECTION_194O_TDS_PERCENT = 1;
declare const SECTION_52_TCS_PERCENT = 1;
declare const DEFAULT_PLATFORM_FEE_PAISE = 500;
declare const DEFAULT_DELIVERY_FEE_PAISE = 4000;
declare const DEFAULT_PACKAGING_FEE_PAISE = 1500;
declare const DEFAULT_TIP_PAISE = 0;
declare const TIP_CHIPS_PAISE: readonly [2000, 3000, 5000];
interface SettlementTaxBreakdown {
    grossPaise: number;
    packagingPaise: number;
    commissionPaise: number;
    commissionGstPaise: number;
    tdsPaise: number;
    tcsPaise: number;
    totalDeductionsPaise: number;
    netPayoutPaise: number;
}
/**
 * Calculates Indian statutory deductions on merchant settlements:
 * 1. Base commission = gross * rate%
 * 2. 18% GST on platform commission (ITC eligible for restaurant)
 * 3. 1% TDS under Section 194-O on gross sales
 * 4. 1% TCS under Section 52 of CGST Act
 */
declare function calculateSettlementBreakdown(grossPaise: number, commissionRate?: number, packagingPaise?: number): SettlementTaxBreakdown;
/**
 * Calculates strict integer-paise pricing adhering to Indian CGST Section 9(5).
 * Eradicates floating point rounding bugs.
 */
declare function calculateOrderTaxBreakdown(subtotalPaise: number, deliveryFeePaise?: number, platformFeePaise?: number, packagingFeePaise?: number, tipPaise?: number): OrderTaxBreakdown;
/**
 * Great-circle distance between two coordinates in metres (Haversine).
 * Used for rider geofence pre-validation on the client before hitting the server.
 */
declare function haversineMeters(latitude1: number, longitude1: number, latitude2: number, longitude2: number): number;
declare const GEOFENCE_ARRIVAL_RADIUS_METERS = 100;
declare const GEOFENCE_GATE_HANDOVER_RADIUS_METERS = 300;
declare const GEOFENCE_EMERGENCY_RADIUS_METERS = 500;
/**
 * Formats an integer paise amount into Indian Rupees string (e.g. 25050 -> "₹250.50").
 */
declare function formatPaiseToRupees(paise: number | bigint): string;
/**
 * Masks phone numbers to protect customer privacy across Hotel and Rider apps.
 * E.g., "+919876543210" -> "+91 98*** **210"
 */
declare function maskPhoneNumber(phone?: string | null): string;

/**
 * Item variant (size / portion). Exactly one variant may be selected per cart line.
 */
declare const DishVariantSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    pricePaise: z.ZodNumber;
    isDefault: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    pricePaise: number;
    isDefault: boolean;
}, {
    id: string;
    name: string;
    pricePaise: number;
    isDefault?: boolean | undefined;
}>;
type DishVariant = z.infer<typeof DishVariantSchema>;
/**
 * Add-on group. `minSelections` > 0 makes the group mandatory before add-to-cart.
 * `maxSelections` > 1 enables multi-select with a stepper.
 */
declare const AddOnOptionSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    pricePaise: z.ZodNumber;
    isAvailable: z.ZodDefault<z.ZodBoolean>;
    isVeg: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    pricePaise: number;
    isAvailable: boolean;
    isVeg?: boolean | undefined;
}, {
    id: string;
    name: string;
    pricePaise: number;
    isAvailable?: boolean | undefined;
    isVeg?: boolean | undefined;
}>;
type AddOnOption = z.infer<typeof AddOnOptionSchema>;
declare const AddOnGroupSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    minSelections: z.ZodDefault<z.ZodNumber>;
    maxSelections: z.ZodDefault<z.ZodNumber>;
    isMultiSelect: z.ZodDefault<z.ZodBoolean>;
    options: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        pricePaise: z.ZodNumber;
        isAvailable: z.ZodDefault<z.ZodBoolean>;
        isVeg: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        pricePaise: number;
        isAvailable: boolean;
        isVeg?: boolean | undefined;
    }, {
        id: string;
        name: string;
        pricePaise: number;
        isAvailable?: boolean | undefined;
        isVeg?: boolean | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    options: {
        id: string;
        name: string;
        pricePaise: number;
        isAvailable: boolean;
        isVeg?: boolean | undefined;
    }[];
    minSelections: number;
    maxSelections: number;
    isMultiSelect: boolean;
}, {
    id: string;
    name: string;
    options: {
        id: string;
        name: string;
        pricePaise: number;
        isAvailable?: boolean | undefined;
        isVeg?: boolean | undefined;
    }[];
    minSelections?: number | undefined;
    maxSelections?: number | undefined;
    isMultiSelect?: boolean | undefined;
}>;
type AddOnGroup = z.infer<typeof AddOnGroupSchema>;
/**
 * A single selected add-on with a quantity (enables +/- steppers).
 */
declare const AddOnSelectionSchema: z.ZodObject<{
    groupId: z.ZodString;
    optionId: z.ZodString;
    quantity: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    groupId: string;
    optionId: string;
    quantity: number;
}, {
    groupId: string;
    optionId: string;
    quantity: number;
}>;
type AddOnSelection = z.infer<typeof AddOnSelectionSchema>;
declare const MenuCustomizationSchema: z.ZodObject<{
    variantId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    addOns: z.ZodDefault<z.ZodArray<z.ZodObject<{
        groupId: z.ZodString;
        optionId: z.ZodString;
        quantity: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        groupId: string;
        optionId: string;
        quantity: number;
    }, {
        groupId: string;
        optionId: string;
        quantity: number;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    addOns: {
        groupId: string;
        optionId: string;
        quantity: number;
    }[];
    variantId?: string | null | undefined;
}, {
    variantId?: string | null | undefined;
    addOns?: {
        groupId: string;
        optionId: string;
        quantity: number;
    }[] | undefined;
}>;
type MenuCustomization = z.infer<typeof MenuCustomizationSchema>;
interface DishCustomizationConfig {
    variants?: DishVariant[];
    addOnGroups?: AddOnGroup[];
}
interface PricedCustomization {
    variantId: string | null;
    variantName: string | null;
    unitBasePaise: number;
    addOnsPaise: number;
    unitPricePaise: number;
    addOnSummary: string[];
}
/**
 * Validates a customization selection against the menu config and prices it.
 * Throws Error with a user-safe message when mandatory groups are unsatisfied,
 * selections exceed max limits, or unavailable options are chosen.
 */
declare function priceCustomization(basePricePaise: number, config: DishCustomizationConfig, selection: MenuCustomization): PricedCustomization;
/**
 * Stable identity for a configured cart line so the same dish with different
 * variants/add-ons is tracked as separate lines (like Swiggy/Zomato).
 */
declare function buildCartLineId(dishId: string, selection: Pick<MenuCustomization, 'variantId' | 'addOns'>): string;
/**
 * Serializes a customization into a compact string persisted on order_items.
 */
declare function serializeCustomization(selection: Pick<MenuCustomization, 'variantId' | 'addOns'>): string;

/**
 * Central order state machine. Every status change must pass through here so
 * that no role can skip stages (e.g. kitchen cannot jump to DELIVERED).
 */
declare function canTransitionOrder(role: UserRole, current: OrderStatus, next: OrderStatus): boolean;
/**
 * Ordering of the happy-path delivery journey, used by the customer tracking stepper.
 */
declare const HAPPY_PATH_STAGES: OrderStatus[];
declare const CUSTOMER_TRACKING_STEPS: Array<{
    status: OrderStatus;
    label: string;
    hint: string;
}>;
/** Returns the index of the active stage, or -1 when cancelled. */
declare function trackingStageIndex(status: OrderStatus): number;

declare const UserRoleSchema: z.ZodNativeEnum<typeof UserRole>;
declare const OrderStatusSchema: z.ZodNativeEnum<typeof OrderStatus>;
declare const MealSlotSchema: z.ZodNativeEnum<typeof MealSlot>;
declare const SettlementStatusSchema: z.ZodNativeEnum<typeof SettlementStatus>;
declare const EntityTypeSchema: z.ZodNativeEnum<typeof EntityType>;
declare const FoodTypeSchema: z.ZodNativeEnum<typeof FoodType>;
declare const GpsCoordinateSchema: z.ZodEffects<z.ZodObject<{
    latitude: z.ZodNumber;
    longitude: z.ZodNumber;
    heading: z.ZodOptional<z.ZodNumber>;
    speed: z.ZodOptional<z.ZodNumber>;
    accuracy: z.ZodOptional<z.ZodNumber>;
    timestamp: z.ZodOptional<z.ZodNumber>;
    isMocked: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    latitude: number;
    longitude: number;
    isMocked: boolean;
    heading?: number | undefined;
    speed?: number | undefined;
    accuracy?: number | undefined;
    timestamp?: number | undefined;
}, {
    latitude: number;
    longitude: number;
    heading?: number | undefined;
    speed?: number | undefined;
    accuracy?: number | undefined;
    timestamp?: number | undefined;
    isMocked?: boolean | undefined;
}>, {
    latitude: number;
    longitude: number;
    isMocked: boolean;
    heading?: number | undefined;
    speed?: number | undefined;
    accuracy?: number | undefined;
    timestamp?: number | undefined;
}, {
    latitude: number;
    longitude: number;
    heading?: number | undefined;
    speed?: number | undefined;
    accuracy?: number | undefined;
    timestamp?: number | undefined;
    isMocked?: boolean | undefined;
}>;
type GpsCoordinate = z.infer<typeof GpsCoordinateSchema>;
declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    clerkId: z.ZodString;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    fullName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    role: z.ZodNativeEnum<typeof UserRole>;
    isSuspended: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
    updatedAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    clerkId: string;
    role: UserRole;
    isSuspended: boolean;
    createdAt: string | Date;
    updatedAt: string | Date;
    email?: string | null | undefined;
    phone?: string | null | undefined;
    fullName?: string | null | undefined;
}, {
    id: string;
    clerkId: string;
    role: UserRole;
    createdAt: string | Date;
    updatedAt: string | Date;
    email?: string | null | undefined;
    phone?: string | null | undefined;
    fullName?: string | null | undefined;
    isSuspended?: boolean | undefined;
}>;
type User = z.infer<typeof UserSchema>;
declare const RestaurantSchema: z.ZodObject<{
    id: z.ZodString;
    ownerId: z.ZodString;
    name: z.ZodString;
    slug: z.ZodString;
    phone: z.ZodString;
    latitude: z.ZodNumber;
    longitude: z.ZodNumber;
    address: z.ZodString;
    gstin: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    commissionRate: z.ZodDefault<z.ZodNumber>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    isAcceptingOrders: z.ZodDefault<z.ZodBoolean>;
    rating: z.ZodDefault<z.ZodNumber>;
    cuisine: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    imageUrl: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    phone: string;
    createdAt: string | Date;
    ownerId: string;
    slug: string;
    address: string;
    commissionRate: number;
    isActive: boolean;
    isAcceptingOrders: boolean;
    rating: number;
    gstin?: string | null | undefined;
    cuisine?: string[] | undefined;
    imageUrl?: string | undefined;
}, {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    phone: string;
    createdAt: string | Date;
    ownerId: string;
    slug: string;
    address: string;
    gstin?: string | null | undefined;
    commissionRate?: number | undefined;
    isActive?: boolean | undefined;
    isAcceptingOrders?: boolean | undefined;
    rating?: number | undefined;
    cuisine?: string[] | undefined;
    imageUrl?: string | undefined;
}>;
type Restaurant = z.infer<typeof RestaurantSchema>;
declare const DishSchema: z.ZodObject<{
    id: z.ZodString;
    restaurantId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    pricePaise: z.ZodNumber;
    imageUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isVeg: z.ZodDefault<z.ZodBoolean>;
    foodType: z.ZodDefault<z.ZodNativeEnum<typeof FoodType>>;
    isAvailable: z.ZodDefault<z.ZodBoolean>;
    mealSlots: z.ZodDefault<z.ZodArray<z.ZodNativeEnum<typeof MealSlot>, "many">>;
    preparationTimeMinutes: z.ZodDefault<z.ZodNumber>;
    category: z.ZodDefault<z.ZodString>;
    variants: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    addOnGroups: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    createdAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    pricePaise: number;
    isAvailable: boolean;
    isVeg: boolean;
    createdAt: string | Date;
    restaurantId: string;
    foodType: FoodType;
    mealSlots: MealSlot[];
    preparationTimeMinutes: number;
    category: string;
    imageUrl?: string | null | undefined;
    description?: string | null | undefined;
    variants?: any[] | undefined;
    addOnGroups?: any[] | undefined;
}, {
    id: string;
    name: string;
    pricePaise: number;
    createdAt: string | Date;
    restaurantId: string;
    isAvailable?: boolean | undefined;
    isVeg?: boolean | undefined;
    imageUrl?: string | null | undefined;
    description?: string | null | undefined;
    foodType?: FoodType | undefined;
    mealSlots?: MealSlot[] | undefined;
    preparationTimeMinutes?: number | undefined;
    category?: string | undefined;
    variants?: any[] | undefined;
    addOnGroups?: any[] | undefined;
}>;
type Dish = z.infer<typeof DishSchema>;
declare const OrderItemSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    dishId: z.ZodString;
    name: z.ZodString;
    quantity: z.ZodNumber;
    unitPricePaise: z.ZodNumber;
    totalPricePaise: z.ZodNumber;
    customization: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    addOnSummary: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    quantity: number;
    dishId: string;
    unitPricePaise: number;
    totalPricePaise: number;
    id?: string | undefined;
    customization?: string | null | undefined;
    addOnSummary?: string[] | undefined;
}, {
    name: string;
    quantity: number;
    dishId: string;
    unitPricePaise: number;
    totalPricePaise: number;
    id?: string | undefined;
    customization?: string | null | undefined;
    addOnSummary?: string[] | undefined;
}>;
type OrderItem = z.infer<typeof OrderItemSchema>;
declare const CreateOrderInputSchema: z.ZodObject<{
    restaurantId: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        dishId: z.ZodString;
        quantity: z.ZodNumber;
        customization: z.ZodOptional<z.ZodObject<{
            variantId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            addOns: z.ZodDefault<z.ZodArray<z.ZodObject<{
                groupId: z.ZodString;
                optionId: z.ZodString;
                quantity: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                groupId: string;
                optionId: string;
                quantity: number;
            }, {
                groupId: string;
                optionId: string;
                quantity: number;
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            addOns: {
                groupId: string;
                optionId: string;
                quantity: number;
            }[];
            variantId?: string | null | undefined;
        }, {
            variantId?: string | null | undefined;
            addOns?: {
                groupId: string;
                optionId: string;
                quantity: number;
            }[] | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        dishId: string;
        customization?: {
            addOns: {
                groupId: string;
                optionId: string;
                quantity: number;
            }[];
            variantId?: string | null | undefined;
        } | undefined;
    }, {
        quantity: number;
        dishId: string;
        customization?: {
            variantId?: string | null | undefined;
            addOns?: {
                groupId: string;
                optionId: string;
                quantity: number;
            }[] | undefined;
        } | undefined;
    }>, "many">;
    deliveryLatitude: z.ZodNumber;
    deliveryLongitude: z.ZodNumber;
    deliveryAddress: z.ZodString;
    specialInstructions: z.ZodOptional<z.ZodString>;
    tipPaise: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    restaurantId: string;
    items: {
        quantity: number;
        dishId: string;
        customization?: {
            addOns: {
                groupId: string;
                optionId: string;
                quantity: number;
            }[];
            variantId?: string | null | undefined;
        } | undefined;
    }[];
    deliveryLatitude: number;
    deliveryLongitude: number;
    deliveryAddress: string;
    specialInstructions?: string | undefined;
    tipPaise?: number | undefined;
}, {
    restaurantId: string;
    items: {
        quantity: number;
        dishId: string;
        customization?: {
            variantId?: string | null | undefined;
            addOns?: {
                groupId: string;
                optionId: string;
                quantity: number;
            }[] | undefined;
        } | undefined;
    }[];
    deliveryLatitude: number;
    deliveryLongitude: number;
    deliveryAddress: string;
    specialInstructions?: string | undefined;
    tipPaise?: number | undefined;
}>;
type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;
declare const OrderSchema: z.ZodObject<{
    id: z.ZodString;
    customerId: z.ZodString;
    restaurantId: z.ZodString;
    riderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodNativeEnum<typeof OrderStatus>;
    deliveryLatitude: z.ZodNumber;
    deliveryLongitude: z.ZodNumber;
    deliveryAddress: z.ZodString;
    deliveryOtp: z.ZodString;
    subtotalPaise: z.ZodNumber;
    foodGstPaise: z.ZodNumber;
    deliveryFeePaise: z.ZodNumber;
    platformFeePaise: z.ZodNumber;
    serviceGstPaise: z.ZodNumber;
    packagingFeePaise: z.ZodDefault<z.ZodNumber>;
    tipPaise: z.ZodDefault<z.ZodNumber>;
    totalAmountPaise: z.ZodNumber;
    razorpayOrderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    razorpayPaymentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    cancelReason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    refundId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    createdAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
    updatedAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        dishId: z.ZodString;
        name: z.ZodString;
        quantity: z.ZodNumber;
        unitPricePaise: z.ZodNumber;
        totalPricePaise: z.ZodNumber;
        customization: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        addOnSummary: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        quantity: number;
        dishId: string;
        unitPricePaise: number;
        totalPricePaise: number;
        id?: string | undefined;
        customization?: string | null | undefined;
        addOnSummary?: string[] | undefined;
    }, {
        name: string;
        quantity: number;
        dishId: string;
        unitPricePaise: number;
        totalPricePaise: number;
        id?: string | undefined;
        customization?: string | null | undefined;
        addOnSummary?: string[] | undefined;
    }>, "many">>;
    restaurant: z.ZodOptional<z.ZodObject<{
        id: z.ZodString;
        ownerId: z.ZodString;
        name: z.ZodString;
        slug: z.ZodString;
        phone: z.ZodString;
        latitude: z.ZodNumber;
        longitude: z.ZodNumber;
        address: z.ZodString;
        gstin: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        commissionRate: z.ZodDefault<z.ZodNumber>;
        isActive: z.ZodDefault<z.ZodBoolean>;
        isAcceptingOrders: z.ZodDefault<z.ZodBoolean>;
        rating: z.ZodDefault<z.ZodNumber>;
        cuisine: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        imageUrl: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        phone: string;
        createdAt: string | Date;
        ownerId: string;
        slug: string;
        address: string;
        commissionRate: number;
        isActive: boolean;
        isAcceptingOrders: boolean;
        rating: number;
        gstin?: string | null | undefined;
        cuisine?: string[] | undefined;
        imageUrl?: string | undefined;
    }, {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        phone: string;
        createdAt: string | Date;
        ownerId: string;
        slug: string;
        address: string;
        gstin?: string | null | undefined;
        commissionRate?: number | undefined;
        isActive?: boolean | undefined;
        isAcceptingOrders?: boolean | undefined;
        rating?: number | undefined;
        cuisine?: string[] | undefined;
        imageUrl?: string | undefined;
    }>>;
    customerPhone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: OrderStatus;
    createdAt: string | Date;
    updatedAt: string | Date;
    restaurantId: string;
    deliveryLatitude: number;
    deliveryLongitude: number;
    deliveryAddress: string;
    tipPaise: number;
    customerId: string;
    deliveryOtp: string;
    subtotalPaise: number;
    foodGstPaise: number;
    deliveryFeePaise: number;
    platformFeePaise: number;
    serviceGstPaise: number;
    packagingFeePaise: number;
    totalAmountPaise: number;
    items?: {
        name: string;
        quantity: number;
        dishId: string;
        unitPricePaise: number;
        totalPricePaise: number;
        id?: string | undefined;
        customization?: string | null | undefined;
        addOnSummary?: string[] | undefined;
    }[] | undefined;
    riderId?: string | null | undefined;
    razorpayOrderId?: string | null | undefined;
    razorpayPaymentId?: string | null | undefined;
    cancelReason?: string | null | undefined;
    refundId?: string | null | undefined;
    restaurant?: {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        phone: string;
        createdAt: string | Date;
        ownerId: string;
        slug: string;
        address: string;
        commissionRate: number;
        isActive: boolean;
        isAcceptingOrders: boolean;
        rating: number;
        gstin?: string | null | undefined;
        cuisine?: string[] | undefined;
        imageUrl?: string | undefined;
    } | undefined;
    customerPhone?: string | undefined;
}, {
    id: string;
    status: OrderStatus;
    createdAt: string | Date;
    updatedAt: string | Date;
    restaurantId: string;
    deliveryLatitude: number;
    deliveryLongitude: number;
    deliveryAddress: string;
    customerId: string;
    deliveryOtp: string;
    subtotalPaise: number;
    foodGstPaise: number;
    deliveryFeePaise: number;
    platformFeePaise: number;
    serviceGstPaise: number;
    totalAmountPaise: number;
    items?: {
        name: string;
        quantity: number;
        dishId: string;
        unitPricePaise: number;
        totalPricePaise: number;
        id?: string | undefined;
        customization?: string | null | undefined;
        addOnSummary?: string[] | undefined;
    }[] | undefined;
    tipPaise?: number | undefined;
    riderId?: string | null | undefined;
    packagingFeePaise?: number | undefined;
    razorpayOrderId?: string | null | undefined;
    razorpayPaymentId?: string | null | undefined;
    cancelReason?: string | null | undefined;
    refundId?: string | null | undefined;
    restaurant?: {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        phone: string;
        createdAt: string | Date;
        ownerId: string;
        slug: string;
        address: string;
        gstin?: string | null | undefined;
        commissionRate?: number | undefined;
        isActive?: boolean | undefined;
        isAcceptingOrders?: boolean | undefined;
        rating?: number | undefined;
        cuisine?: string[] | undefined;
        imageUrl?: string | undefined;
    } | undefined;
    customerPhone?: string | undefined;
}>;
type Order = z.infer<typeof OrderSchema>;
declare const VerifyDeliveryOtpSchema: z.ZodObject<{
    orderId: z.ZodString;
    otp: z.ZodString;
    isGateHandover: z.ZodOptional<z.ZodBoolean>;
    emergencyOverride: z.ZodOptional<z.ZodBoolean>;
    emergencyReason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    orderId: string;
    otp: string;
    isGateHandover?: boolean | undefined;
    emergencyOverride?: boolean | undefined;
    emergencyReason?: string | undefined;
}, {
    orderId: string;
    otp: string;
    isGateHandover?: boolean | undefined;
    emergencyOverride?: boolean | undefined;
    emergencyReason?: string | undefined;
}>;
type VerifyDeliveryOtp = z.infer<typeof VerifyDeliveryOtpSchema>;
declare const SettlementSchema: z.ZodObject<{
    id: z.ZodString;
    entityType: z.ZodNativeEnum<typeof EntityType>;
    entityId: z.ZodString;
    entityName: z.ZodOptional<z.ZodString>;
    startDate: z.ZodString;
    endDate: z.ZodString;
    grossAmountPaise: z.ZodNumber;
    commissionDeductedPaise: z.ZodNumber;
    commissionGstPaise: z.ZodOptional<z.ZodNumber>;
    tdsDeductedPaise: z.ZodOptional<z.ZodNumber>;
    tcsDeductedPaise: z.ZodOptional<z.ZodNumber>;
    packagingFeePaise: z.ZodOptional<z.ZodNumber>;
    netPayoutPaise: z.ZodNumber;
    status: z.ZodNativeEnum<typeof SettlementStatus>;
    bankUtrReference: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    bankAccountNumber: z.ZodOptional<z.ZodString>;
    bankIfscCode: z.ZodOptional<z.ZodString>;
    paidAt: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodDate]>>>;
    createdAt: z.ZodUnion<[z.ZodString, z.ZodDate]>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: SettlementStatus;
    createdAt: string | Date;
    entityType: EntityType;
    entityId: string;
    startDate: string;
    endDate: string;
    grossAmountPaise: number;
    commissionDeductedPaise: number;
    netPayoutPaise: number;
    packagingFeePaise?: number | undefined;
    entityName?: string | undefined;
    commissionGstPaise?: number | undefined;
    tdsDeductedPaise?: number | undefined;
    tcsDeductedPaise?: number | undefined;
    bankUtrReference?: string | null | undefined;
    bankAccountNumber?: string | undefined;
    bankIfscCode?: string | undefined;
    paidAt?: string | Date | null | undefined;
}, {
    id: string;
    status: SettlementStatus;
    createdAt: string | Date;
    entityType: EntityType;
    entityId: string;
    startDate: string;
    endDate: string;
    grossAmountPaise: number;
    commissionDeductedPaise: number;
    netPayoutPaise: number;
    packagingFeePaise?: number | undefined;
    entityName?: string | undefined;
    commissionGstPaise?: number | undefined;
    tdsDeductedPaise?: number | undefined;
    tcsDeductedPaise?: number | undefined;
    bankUtrReference?: string | null | undefined;
    bankAccountNumber?: string | undefined;
    bankIfscCode?: string | undefined;
    paidAt?: string | Date | null | undefined;
}>;
type Settlement = z.infer<typeof SettlementSchema>;
declare const ReconcileSettlementSchema: z.ZodObject<{
    settlementId: z.ZodString;
    bankUtrReference: z.ZodString;
}, "strip", z.ZodTypeAny, {
    bankUtrReference: string;
    settlementId: string;
}, {
    bankUtrReference: string;
    settlementId: string;
}>;
type ReconcileSettlement = z.infer<typeof ReconcileSettlementSchema>;

interface RiderLocationUpdatePayload {
    riderId: string;
    orderId?: string;
    coordinate: GpsCoordinate;
}
interface OrderTrackingPayload {
    orderId: string;
    status: OrderStatus;
    riderLocation?: {
        latitude: number;
        longitude: number;
        heading?: number;
        speed?: number;
    };
    estimatedDeliveryMinutes?: number;
    updatedAt: string;
}
interface DispatchOfferPayload {
    orderId: string;
    restaurantId: string;
    restaurantName: string;
    restaurantAddress: string;
    restaurantLatitude?: number;
    restaurantLongitude?: number;
    deliveryAddress: string;
    deliveryLatitude?: number;
    deliveryLongitude?: number;
    distanceKm: number;
    payoutPaise: number;
    expiresInSeconds: number;
    expiresAt: number;
}
interface PrepTimeUpdatePayload {
    orderId: string;
    addedMinutes: number;
    prepTimeMinutes: number;
    estimatedReadyAt: string;
}
interface RestaurantItem86Payload {
    restaurantId: string;
    dishId: string;
    dishName: string;
    isAvailable: boolean;
    resetAt: string | null;
}
interface DispatchResponsePayload {
    orderId: string;
    accepted: boolean;
}
interface RestaurantNewOrderPayload {
    orderId: string;
    restaurantId: string;
    itemsCount: number;
    totalAmountPaise: number;
    createdAt: string;
}
declare const SOCKET_EVENTS: {
    readonly CONNECT: "connect";
    readonly DISCONNECT: "disconnect";
    readonly JOIN_ROOM: "join:room";
    readonly LEAVE_ROOM: "leave:room";
    readonly RIDER_LOCATION_UPDATE: "rider:location:update";
    readonly ORDER_TRACKING: "order_tracking";
    readonly DISPATCH_OFFER: "dispatch:offer";
    readonly DISPATCH_RESPONSE: "dispatch:response";
    readonly RESTAURANT_NEW_ORDER: "restaurant:new_order";
    readonly ORDER_STATUS_UPDATE: "order:status:update";
    readonly PREP_TIME_UPDATE: "order:prep_time:update";
    readonly ITEM_86_UPDATE: "restaurant:item_86";
    readonly DISPATCH_CASCADE: "dispatch:cascade";
};

export { type AddOnGroup, AddOnGroupSchema, type AddOnOption, AddOnOptionSchema, type AddOnSelection, AddOnSelectionSchema, COMMISSION_GST_PERCENT, CUSTOMER_TRACKING_STEPS, type CreateOrderInput, CreateOrderInputSchema, DEFAULT_DELIVERY_FEE_PAISE, DEFAULT_PACKAGING_FEE_PAISE, DEFAULT_PLATFORM_FEE_PAISE, DEFAULT_TIP_PAISE, DiscountType, type Dish, type DishCustomizationConfig, DishSchema, type DishVariant, DishVariantSchema, type DispatchOfferPayload, type DispatchResponsePayload, EntityType, EntityTypeSchema, FOOD_GST_PERCENT, FoodType, FoodTypeSchema, GEOFENCE_ARRIVAL_RADIUS_METERS, GEOFENCE_EMERGENCY_RADIUS_METERS, GEOFENCE_GATE_HANDOVER_RADIUS_METERS, type GpsCoordinate, GpsCoordinateSchema, HAPPY_PATH_STAGES, MealSlot, MealSlotSchema, type MenuCustomization, MenuCustomizationSchema, type Order, type OrderItem, OrderItemSchema, OrderSchema, OrderStatus, OrderStatusSchema, type OrderTaxBreakdown, type OrderTrackingPayload, type PrepTimeUpdatePayload, type PricedCustomization, type ReconcileSettlement, ReconcileSettlementSchema, type Restaurant, type RestaurantItem86Payload, type RestaurantNewOrderPayload, RestaurantSchema, type RiderLocationUpdatePayload, SECTION_194O_TDS_PERCENT, SECTION_52_TCS_PERCENT, SERVICE_GST_PERCENT, SOCKET_EVENTS, type Settlement, SettlementSchema, SettlementStatus, SettlementStatusSchema, type SettlementTaxBreakdown, TIP_CHIPS_PAISE, type User, UserRole, UserRoleSchema, UserSchema, type VerifyDeliveryOtp, VerifyDeliveryOtpSchema, buildCartLineId, calculateOrderTaxBreakdown, calculateSettlementBreakdown, canTransitionOrder, formatPaiseToRupees, haversineMeters, maskPhoneNumber, priceCustomization, serializeCustomization, trackingStageIndex };
