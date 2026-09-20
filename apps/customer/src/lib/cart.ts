import {
  calculateOrderTaxBreakdown,
  OrderTaxBreakdown,
  MenuCustomization,
  buildCartLineId,
} from '@bocardo/shared-types';

export interface CartItem {
  lineId: string;
  dishId: string;
  name: string;
  pricePaise: number;
  quantity: number;
  isVeg: boolean;
  restaurantId: string;
  restaurantName: string;
  variantId?: string | null;
  variantName?: string | null;
  addOnSummary?: string[];
  customization?: MenuCustomization;
}

export type CartItemInput = Omit<CartItem, 'quantity' | 'lineId'> & {
  quantity?: number;
  lineId?: string;
};

type CartListener = () => void;

class CartStore {
  private items: CartItem[] = [];
  private restaurantId: string | null = null;
  private restaurantName: string | null = null;
  private listeners = new Set<CartListener>();

  subscribe(listener: CartListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  getItems(): CartItem[] {
    return [...this.items];
  }

  getRestaurantId(): string | null {
    return this.restaurantId;
  }

  getRestaurantName(): string | null {
    return this.restaurantName;
  }

  addItem(input: CartItemInput) {
    if (this.restaurantId && this.restaurantId !== input.restaurantId) {
      // Discard previous cart if from a different restaurant
      this.items = [];
    }

    this.restaurantId = input.restaurantId;
    this.restaurantName = input.restaurantName;

    const lineId =
      input.lineId ??
      (input.customization
        ? buildCartLineId(input.dishId, input.customization)
        : input.dishId);

    const qtyToAdd = input.quantity ?? 1;
    const existing = this.items.find((i) => i.lineId === lineId);

    if (existing) {
      existing.quantity += qtyToAdd;
    } else {
      this.items.push({
        ...input,
        lineId,
        quantity: qtyToAdd,
      });
    }
    this.notify();
  }

  removeItem(lineOrDishId: string) {
    // Look up by lineId first
    let index = this.items.findIndex((i) => i.lineId === lineOrDishId);
    if (index === -1) {
      // Fallback: look up by dishId
      index = this.items.findIndex((i) => i.dishId === lineOrDishId);
    }
    if (index === -1) return;

    const target = this.items[index];
    if (target.quantity > 1) {
      target.quantity -= 1;
    } else {
      this.items.splice(index, 1);
    }

    if (this.items.length === 0) {
      this.restaurantId = null;
      this.restaurantName = null;
    }

    this.notify();
  }

  removeDish(dishId: string) {
    this.items = this.items.filter((i) => i.dishId !== dishId);
    if (this.items.length === 0) {
      this.restaurantId = null;
      this.restaurantName = null;
    }
    this.notify();
  }

  getItemQuantity(lineOrDishId: string): number {
    const lineItem = this.items.find((i) => i.lineId === lineOrDishId);
    if (lineItem) return lineItem.quantity;
    return this.getDishTotalQuantity(lineOrDishId);
  }

  getDishTotalQuantity(dishId: string): number {
    return this.items
      .filter((i) => i.dishId === dishId)
      .reduce((acc, item) => acc + item.quantity, 0);
  }

  getDishLines(dishId: string): CartItem[] {
    return this.items.filter((i) => i.dishId === dishId);
  }

  getLastCustomization(dishId: string): CartItem | null {
    const lines = this.getDishLines(dishId);
    return lines.length > 0 ? lines[lines.length - 1] : null;
  }

  getSubtotalPaise(): number {
    return this.items.reduce((acc, item) => acc + item.pricePaise * item.quantity, 0);
  }

  getTotals(): OrderTaxBreakdown {
    const subtotal = this.getSubtotalPaise();
    return calculateOrderTaxBreakdown(subtotal);
  }

  clear() {
    this.items = [];
    this.restaurantId = null;
    this.restaurantName = null;
    this.notify();
  }
}

export const cartStore = new CartStore();
