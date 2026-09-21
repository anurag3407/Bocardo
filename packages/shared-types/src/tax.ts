export interface OrderTaxBreakdown {
  subtotalPaise: number;
  foodGstPaise: number;       // 5% GST on food (Section 9(5) CGST collected on behalf of restaurant)
  deliveryFeePaise: number;   // e.g. ₹40.00 = 4000 paise
  platformFeePaise: number;   // default ₹5.00 = 500 paise
  serviceGstPaise: number;    // 18% GST on (delivery fee + platform fee)
  packagingFeePaise: number;  // restaurant packaging charge (GST already borne by restaurant)
  tipPaise: number;           // 100% pass-through to delivery partner
  totalAmountPaise: number;   // integer paise grand total
}

export const FOOD_GST_PERCENT = 5;
export const SERVICE_GST_PERCENT = 18;
export const COMMISSION_GST_PERCENT = 18;
export const SECTION_194O_TDS_PERCENT = 1;
export const SECTION_52_TCS_PERCENT = 1;

export const DEFAULT_PLATFORM_FEE_PAISE = 500; // ₹5.00
export const DEFAULT_DELIVERY_FEE_PAISE = 4000; // ₹40.00
export const DEFAULT_PACKAGING_FEE_PAISE = 1500; // ₹15.00
export const DEFAULT_TIP_PAISE = 0;

export const TIP_CHIPS_PAISE = [2000, 3000, 5000] as const; // ₹20, ₹30, ₹50

export interface SettlementTaxBreakdown {
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
export function calculateSettlementBreakdown(
  grossPaise: number,
  commissionRate: number = 15.0,
  packagingPaise: number = 0
): SettlementTaxBreakdown {
  const safeGross = Math.max(0, Math.floor(grossPaise));
  const safePackaging = Math.max(0, Math.floor(packagingPaise));
  const rate = Math.max(0, commissionRate);

  const commissionPaise = Math.round((safeGross * rate) / 100);
  const commissionGstPaise = Math.round((commissionPaise * COMMISSION_GST_PERCENT) / 100);
  const tdsPaise = Math.round((safeGross * SECTION_194O_TDS_PERCENT) / 100);
  const tcsPaise = Math.round((safeGross * SECTION_52_TCS_PERCENT) / 100);

  const totalDeductionsPaise = commissionPaise + commissionGstPaise + tdsPaise + tcsPaise;
  const netPayoutPaise = Math.max(0, (safeGross + safePackaging) - totalDeductionsPaise);

  return {
    grossPaise: safeGross,
    packagingPaise: safePackaging,
    commissionPaise,
    commissionGstPaise,
    tdsPaise,
    tcsPaise,
    totalDeductionsPaise,
    netPayoutPaise,
  };
}

/**
 * Calculates strict integer-paise pricing adhering to Indian CGST Section 9(5).
 * Eradicates floating point rounding bugs.
 */
export function calculateOrderTaxBreakdown(
  subtotalPaise: number,
  deliveryFeePaise: number = DEFAULT_DELIVERY_FEE_PAISE,
  platformFeePaise: number = DEFAULT_PLATFORM_FEE_PAISE,
  packagingFeePaise: number = 0,
  tipPaise: number = DEFAULT_TIP_PAISE
): OrderTaxBreakdown {
  const safeSubtotal = Math.max(0, Math.floor(subtotalPaise));
  const safeDelivery = Math.max(0, Math.floor(deliveryFeePaise));
  const safePlatform = Math.max(0, Math.floor(platformFeePaise));
  const safePackaging = Math.max(0, Math.floor(packagingFeePaise));
  const safeTip = Math.max(0, Math.floor(tipPaise));

  // 5% Food GST on items
  const foodGstPaise = Math.round((safeSubtotal * FOOD_GST_PERCENT) / 100);

  // 18% Service GST on (delivery + platform fee)
  const serviceBasePaise = safeDelivery + safePlatform;
  const serviceGstPaise = Math.round((serviceBasePaise * SERVICE_GST_PERCENT) / 100);

  const totalAmountPaise =
    safeSubtotal +
    foodGstPaise +
    safeDelivery +
    safePlatform +
    serviceGstPaise +
    safePackaging +
    safeTip;

  return {
    subtotalPaise: safeSubtotal,
    foodGstPaise,
    deliveryFeePaise: safeDelivery,
    platformFeePaise: safePlatform,
    serviceGstPaise,
    packagingFeePaise: safePackaging,
    tipPaise: safeTip,
    totalAmountPaise,
  };
}

/**
 * Great-circle distance between two coordinates in metres (Haversine).
 * Used for rider geofence pre-validation on the client before hitting the server.
 */
export function haversineMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(latitude2 - latitude1);
  const deltaLng = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

export const GEOFENCE_ARRIVAL_RADIUS_METERS = 100;
export const GEOFENCE_GATE_HANDOVER_RADIUS_METERS = 300;
export const GEOFENCE_EMERGENCY_RADIUS_METERS = 500;

/**
 * Formats an integer paise amount into Indian Rupees string (e.g. 25050 -> "₹250.50").
 * Uses a pure JavaScript formatter to avoid Hermes engine Intl crashes on Android devices.
 */
export function formatPaiseToRupees(paise: number | bigint): string {
  const numPaise = typeof paise === 'bigint' ? Number(paise) : Number(paise || 0);
  const isNegative = numPaise < 0;
  const absPaise = Math.abs(numPaise);
  const rupees = Math.floor(absPaise / 100);
  const remainder = absPaise % 100;

  const rupeesStr = rupees.toString();
  let lastThree = rupeesStr.substring(rupeesStr.length - 3);
  const otherNumbers = rupeesStr.substring(0, rupeesStr.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedRupees = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  const formattedAmount =
    remainder === 0 ? formattedRupees : `${formattedRupees}.${remainder.toString().padStart(2, '0')}`;

  return `${isNegative ? '-' : ''}₹${formattedAmount}`;
}

/**
 * Masks phone numbers to protect customer privacy across Hotel and Rider apps.
 * E.g., "+919876543210" -> "+91 98*** **210"
 */
export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return '***';
  const cleaned = phone.trim().replace(/\s+/g, '');
  if (cleaned.length < 10) return '***';
  const last10 = cleaned.slice(-10);
  const countryPrefix = cleaned.length > 10 ? cleaned.slice(0, -10) + ' ' : '';
  const first2 = last10.slice(0, 2);
  const last3 = last10.slice(-3);
  return `${countryPrefix}${first2}*** **${last3}`;
}
