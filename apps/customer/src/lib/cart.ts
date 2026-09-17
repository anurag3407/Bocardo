import { calculateOrderTaxBreakdown, OrderTaxBreakdown } from '@bocardo/shared-types';

export interface CartItem {
  dishId: string;
  name: string;
  pricePaise: number;
  quantity: number;
  isVeg: boolean;
  restaurantId: string;
  restaurantName: string;
}

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

  addItem(item: Omit<CartItem, 'quantity'>) {
    if (this.restaurantId && this.restaurantId !== item.restaurantId) {
      // Discard previous cart if from a different restaurant
      this.items = [];
    }

    this.restaurantId = item.restaurantId;
    this.restaurantName = item.restaurantName;

    const existing = this.items.find((i) => i.dishId === item.dishId);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.items.push({ ...item, quantity: 1 });
    }
    this.notify();
  }

  removeItem(dishId: string) {
    const existing = this.items.find((i) => i.dishId === dishId);
    if (!existing) return;

    if (existing.quantity > 1) {
      existing.quantity -= 1;
    } else {
      this.items = this.items.filter((i) => i.dishId !== dishId);
    }

    if (this.items.length === 0) {
      this.restaurantId = null;
      this.restaurantName = null;
    }

    this.notify();
  }

  getItemQuantity(dishId: string): number {
    return this.items.find((i) => i.dishId === dishId)?.quantity || 0;
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
