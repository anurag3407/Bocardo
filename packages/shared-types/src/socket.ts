import { OrderStatus } from './enums';
import { GpsCoordinate } from './schemas';

export interface RiderLocationUpdatePayload {
  riderId: string;
  orderId?: string;
  coordinate: GpsCoordinate;
}

export interface OrderTrackingPayload {
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

export interface DispatchOfferPayload {
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
  expiresInSeconds: number; // 30 seconds ticking timer
  expiresAt: number;
}

export interface PrepTimeUpdatePayload {
  orderId: string;
  addedMinutes: number;
  prepTimeMinutes: number;
  estimatedReadyAt: string;
}

export interface RestaurantItem86Payload {
  restaurantId: string;
  dishId: string;
  dishName: string;
  isAvailable: boolean;
  resetAt: string | null;
}

export interface DispatchResponsePayload {
  orderId: string;
  accepted: boolean;
}

export interface RestaurantNewOrderPayload {
  orderId: string;
  restaurantId: string;
  itemsCount: number;
  totalAmountPaise: number;
  createdAt: string;
}

export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  JOIN_ROOM: 'join:room',
  LEAVE_ROOM: 'leave:room',
  RIDER_LOCATION_UPDATE: 'rider:location:update',
  ORDER_TRACKING: 'order_tracking',
  DISPATCH_OFFER: 'dispatch:offer',
  DISPATCH_RESPONSE: 'dispatch:response',
  RESTAURANT_NEW_ORDER: 'restaurant:new_order',
  ORDER_STATUS_UPDATE: 'order:status:update',
  PREP_TIME_UPDATE: 'order:prep_time:update',
  ITEM_86_UPDATE: 'restaurant:item_86',
  DISPATCH_CASCADE: 'dispatch:cascade',
} as const;
