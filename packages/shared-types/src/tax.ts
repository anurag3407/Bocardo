export interface OrderTaxBreakdown {
  subtotalPaise: number;
  foodGstPaise: number;       // 5% GST on food (Section 9(5) CGST collected on behalf of restaurant)
  deliveryFeePaise: number;   // e.g. ₹40.00 = 4000 paise
  platformFeePaise: number;   // default ₹5.00 = 500 paise
  serviceGstPaise: number;    // 18% GST on (delivery fee + platform fee)
  totalAmountPaise: number;   // integer paise grand total
}

export const FOOD_GST_PERCENT = 5;
export const SERVICE_GST_PERCENT = 18;
export const DEFAULT_PLATFORM_FEE_PAISE = 500; // ₹5.00
export const DEFAULT_DELIVERY_FEE_PAISE = 4000; // ₹40.00

/**
 * Calculates strict integer-paise pricing adhering to Indian CGST Section 9(5).
 * Eradicates floating point rounding bugs.
 */
export function calculateOrderTaxBreakdown(
  subtotalPaise: number,
  deliveryFeePaise: number = DEFAULT_DELIVERY_FEE_PAISE,
  platformFeePaise: number = DEFAULT_PLATFORM_FEE_PAISE
): OrderTaxBreakdown {
  const safeSubtotal = Math.max(0, Math.floor(subtotalPaise));
  const safeDelivery = Math.max(0, Math.floor(deliveryFeePaise));
  const safePlatform = Math.max(0, Math.floor(platformFeePaise));

  // 5% Food GST on items
  const foodGstPaise = Math.round((safeSubtotal * FOOD_GST_PERCENT) / 100);

  // 18% Service GST on (delivery + platform fee)
  const serviceBasePaise = safeDelivery + safePlatform;
  const serviceGstPaise = Math.round((serviceBasePaise * SERVICE_GST_PERCENT) / 100);

  const totalAmountPaise = safeSubtotal + foodGstPaise + safeDelivery + safePlatform + serviceGstPaise;

  return {
    subtotalPaise: safeSubtotal,
    foodGstPaise,
    deliveryFeePaise: safeDelivery,
    platformFeePaise: safePlatform,
    serviceGstPaise,
    totalAmountPaise,
  };
}

/**
 * Formats an integer paise amount into Indian Rupees string (e.g. 25050 -> "₹250.50").
 */
export function formatPaiseToRupees(paise: number | bigint): string {
  const numPaise = typeof paise === 'bigint' ? Number(paise) : paise;
  const rupees = numPaise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: numPaise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees);
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
