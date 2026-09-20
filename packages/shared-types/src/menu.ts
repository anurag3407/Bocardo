import { z } from 'zod';
import { FoodType } from './enums';

/**
 * Item variant (size / portion). Exactly one variant may be selected per cart line.
 */
export const DishVariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1), // e.g. "Half", "Full", "Regular", "Large"
  pricePaise: z.number().int().nonnegative(), // absolute unit price for this variant
  isDefault: z.boolean().default(false),
});

export type DishVariant = z.infer<typeof DishVariantSchema>;

/**
 * Add-on group. `minSelections` > 0 makes the group mandatory before add-to-cart.
 * `maxSelections` > 1 enables multi-select with a stepper.
 */
export const AddOnOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  pricePaise: z.number().int().nonnegative(),
  isAvailable: z.boolean().default(true),
  isVeg: z.boolean().optional(),
});

export type AddOnOption = z.infer<typeof AddOnOptionSchema>;

export const AddOnGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1), // e.g. "Choose your raita", "Add extra toppings"
  minSelections: z.number().int().nonnegative().default(0),
  maxSelections: z.number().int().positive().default(1),
  isMultiSelect: z.boolean().default(false),
  options: z.array(AddOnOptionSchema).min(1),
});

export type AddOnGroup = z.infer<typeof AddOnGroupSchema>;

/**
 * A single selected add-on with a quantity (enables +/- steppers).
 */
export const AddOnSelectionSchema = z.object({
  groupId: z.string().min(1),
  optionId: z.string().min(1),
  quantity: z.number().int().positive().max(20),
});

export type AddOnSelection = z.infer<typeof AddOnSelectionSchema>;

export const MenuCustomizationSchema = z.object({
  variantId: z.string().nullable().optional(),
  addOns: z.array(AddOnSelectionSchema).default([]),
});

export type MenuCustomization = z.infer<typeof MenuCustomizationSchema>;

export interface DishCustomizationConfig {
  variants?: DishVariant[];
  addOnGroups?: AddOnGroup[];
}

export interface PricedCustomization {
  variantId: string | null;
  variantName: string | null;
  unitBasePaise: number;      // variant price (or base dish price when no variants)
  addOnsPaise: number;        // sum of selected add-on unit prices x quantity
  unitPricePaise: number;     // unitBasePaise + addOnsPaise
  addOnSummary: string[];     // human readable, e.g. ["Extra Cheese x2"]
}

/**
 * Validates a customization selection against the menu config and prices it.
 * Throws Error with a user-safe message when mandatory groups are unsatisfied,
 * selections exceed max limits, or unavailable options are chosen.
 */
export function priceCustomization(
  basePricePaise: number,
  config: DishCustomizationConfig,
  selection: MenuCustomization
): PricedCustomization {
  const variants = config.variants ?? [];
  const groups = config.addOnGroups ?? [];

  let unitBasePaise = Math.max(0, Math.floor(basePricePaise));
  let variantId: string | null = null;
  let variantName: string | null = null;

  if (variants.length > 0) {
    const chosen =
      variants.find((variant) => variant.id === selection.variantId) ??
      variants.find((variant) => variant.isDefault) ??
      variants[0];
    variantId = chosen.id;
    variantName = chosen.name;
    unitBasePaise = chosen.pricePaise;
  }

  const optionsByGroup = new Map(groups.map((group) => [group.id, group]));
  const addOnSummary: string[] = [];
  let addOnsPaise = 0;

  const consumedByGroup = new Map<string, number>();

  for (const addOn of selection.addOns) {
    const group = optionsByGroup.get(addOn.groupId);
    if (!group) continue; // ignore stale selections for removed groups
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
      throw new Error(`Please choose ${group.minSelections > 1 ? `at least ${group.minSelections} options` : 'an option'} from "${group.name}".`);
    }
    const max = group.isMultiSelect ? group.maxSelections : 1;
    if (consumed > max) {
      throw new Error(`You can select up to ${max} option${max === 1 ? '' : 's'} from "${group.name}".`);
    }
  }

  return {
    variantId,
    variantName,
    unitBasePaise,
    addOnsPaise,
    unitPricePaise: unitBasePaise + addOnsPaise,
    addOnSummary,
  };
}

/**
 * Stable identity for a configured cart line so the same dish with different
 * variants/add-ons is tracked as separate lines (like Swiggy/Zomato).
 */
export function buildCartLineId(
  dishId: string,
  selection: Pick<MenuCustomization, 'variantId' | 'addOns'>
): string {
  const variantPart = selection.variantId ?? 'base';
  const addOnPart = [...selection.addOns]
    .sort((a, b) => (a.groupId + a.optionId).localeCompare(b.groupId + b.optionId))
    .map((addOn) => `${addOn.groupId}:${addOn.optionId}x${addOn.quantity}`)
    .join(',');
  return `${dishId}::${variantPart}::${addOnPart}`;
}

/**
 * Serializes a customization into a compact string persisted on order_items.
 */
export function serializeCustomization(
  selection: Pick<MenuCustomization, 'variantId' | 'addOns'>
): string {
  return buildCartLineId('', selection).replace(/^::/, '');
}
