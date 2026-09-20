import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fastify from '../../apps/api/node_modules/fastify';
import { fastifyTRPCPlugin } from '../../apps/api/node_modules/@trpc/server/adapters/fastify';
import { createApiClient } from '../../packages/api-client/src/index';
import { appRouter } from '../../apps/api/src/routers/_app';
import { createContext } from '../../apps/api/src/context';
import { paymentService } from '../../apps/api/src/services/payment';
import { registerRazorpayRoute } from '../../apps/api/src/services/razorpayRoute';
import { redisService } from '../../apps/api/src/services/redis';
import { OrderStatus } from '../../packages/shared-types/src';
import { installPlatformDoubles } from '../harness/db';
import { IDS } from '../harness/trpc';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('E2E · Platform HTTP Gateway (order → payment → kitchen → rider → delivery)');

const WEBHOOK_SECRET: string = process.env.RAZORPAY_WEBHOOK_SECRET || 'mock_webhook_secret';

const ROLE_IDS: Record<string, string> = {
  CUSTOMER: IDS.customer,
  RESTAURANT: IDS.restaurantOwner,
  RIDER: IDS.rider,
  ADMIN: IDS.admin,
};

runSuite(suite, async () => {
  // ---------------------------------------------------------------------------
  // In-memory PostgreSQL substitute shared by every layer under test.
  // ---------------------------------------------------------------------------
  interface OrderRecord {
    id: string;
    customerId: string;
    restaurantId: string;
    riderId: string | null;
    status: string;
    deliveryOtp: string;
    subtotalPaise: number;
    totalAmountPaise: number;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    cancelReason: string | null;
    otpAttempts: number;
  }

  const state = {
    orders: new Map<string, OrderRecord>(),
    items: new Map<string, any[]>(),
    usersByClerk: new Map<string, any>(),
    processedWebhooks: new Set<string>(),
    outbox: [] as any[],
    restaurants: new Map<string, any>([
      [IDS.restaurant, { id: IDS.restaurant, name: 'Biryani Bliss & Kebabs', slug: 'biryani-bliss', address: '100 Feet Rd', phone: '+918041234567', rating: 4.6, cuisine: ['Biryani'], is_active: true, is_accepting_orders: true, latitude: 12.9719, longitude: 77.6412 }],
    ]),
    dishes: new Map<string, any>([
      [IDS.dishA, { id: IDS.dishA, name: 'Hyderabadi Dum Biryani', price_paise: 32000, is_available: true, restaurant_id: IDS.restaurant }],
      [IDS.dishB, { id: IDS.dishB, name: 'Burani Garlic Raita', price_paise: 6000, is_available: true, restaurant_id: IDS.restaurant }],
    ]),
  };
  const rows = (data: any[]) => ({ rows: data, rowCount: data.length });

  installPlatformDoubles()
    .on(/INSERT INTO users/i, (params) => {
      const [clerkId, email, phone, fullName, role] = params;
      let user = state.usersByClerk.get(clerkId);
      if (!user) {
        user = {
          id: ROLE_IDS[role as string] ?? crypto.randomUUID(),
          clerkId,
          email,
          phone,
          fullName,
          role,
          isSuspended: false,
        };
        state.usersByClerk.set(clerkId, user);
      }
      return rows([{ ...user }]);
    })
    .on(/SELECT id FROM restaurants WHERE owner_id/i, () => rows([{ id: IDS.restaurant }]))
    .on(/SELECT is_active, is_accepting_orders FROM restaurants/i, (params) => {
      const restaurant = state.restaurants.get(params[0]);
      return restaurant ? rows([{ is_active: restaurant.is_active, is_accepting_orders: restaurant.is_accepting_orders }]) : rows([]);
    })
    .on(/FROM dishes\s+WHERE id = ANY/i, (params) => {
      const ids: string[] = params[0] ?? [];
      return rows(ids.map((id) => state.dishes.get(id)).filter(Boolean));
    })
    .on(/INSERT INTO orders/i, (params) => {
      const id = crypto.randomUUID();
      state.orders.set(id, {
        id,
        customerId: params[0],
        restaurantId: params[1],
        riderId: null,
        status: params[2],
        deliveryOtp: params[6],
        subtotalPaise: Number(params[7]),
        totalAmountPaise: Number(params[12]),
        razorpayOrderId: null,
        razorpayPaymentId: null,
        cancelReason: null,
        otpAttempts: 0,
      });
      state.items.set(id, []);
      return rows([{ id }]);
    })
    .on(/INSERT INTO order_items/i, (params) => {
      const list = state.items.get(String(params[0])) ?? [];
      list.push({ id: crypto.randomUUID(), dishId: params[1], name: state.dishes.get(params[1])?.name, quantity: params[2], unitPricePaise: Number(params[3]), totalPricePaise: Number(params[4]), isVeg: false });
      state.items.set(String(params[0]), list);
      return { rows: [], rowCount: 1 };
    })
    .on(/UPDATE orders\s+SET razorpay_order_id = \$1 WHERE id = \$2/i, (params) => {
      const order = state.orders.get(String(params[1]));
      if (order) order.razorpayOrderId = params[0];
      return { rows: [], rowCount: order ? 1 : 0 };
    })
    .on(/INSERT INTO processed_webhooks/i, (params) => {
      if (state.processedWebhooks.has(String(params[0]))) return { rows: [], rowCount: 0 };
      state.processedWebhooks.add(String(params[0]));
      return rows([{ event_id: params[0] }]);
    })
    .on(/FROM orders WHERE razorpay_order_id = \$1 FOR UPDATE/i, (params) => {
      const order = [...state.orders.values()].find((candidate) => candidate.razorpayOrderId === params[0]);
      return order ? rows([{ id: order.id, restaurant_id: order.restaurantId, status: order.status, total_amount_paise: order.totalAmountPaise }]) : rows([]);
    })
    .on(/UPDATE orders\s+SET status = \$1, razorpay_payment_id = \$2/i, (params) => {
      const order = state.orders.get(String(params[2]));
      if (order) {
        order.status = params[0];
        order.razorpayPaymentId = params[1];
      }
      return { rows: [], rowCount: order ? 1 : 0 };
    })
    .on(/INSERT INTO realtime_outbox/i, (params) => {
      state.outbox.push({ room: params[0], event: params[1], payload: params[2] });
      return { rows: [], rowCount: 1 };
    })
    .on(/SELECT id, status, delivery_otp, rider_id, otp_attempts FROM orders/i, (params) => {
      const order = state.orders.get(String(params[0]));
      return order
        ? rows([{ id: order.id, status: order.status, delivery_otp: order.deliveryOtp, rider_id: order.riderId, otp_attempts: order.otpAttempts }])
        : rows([]);
    })
    .on(/SELECT id, restaurant_id, rider_id, status FROM orders/i, (params) => {
      const order = state.orders.get(String(params[0]));
      return order ? rows([{ id: order.id, restaurant_id: order.restaurantId, rider_id: order.riderId, status: order.status }]) : rows([]);
    })
    .on(/SELECT ST_DWithin/i, () => rows([{ arrived: true }]))
    .on(/UPDATE orders SET otp_attempts/i, (params) => {
      const order = state.orders.get(String(params[0]));
      if (!order || order.otpAttempts >= 5 || order.status !== OrderStatus.OUT_FOR_DELIVERY) return { rows: [], rowCount: 0 };
      order.otpAttempts += 1;
      return rows([{ id: order.id }]);
    })
    .on(/SET status = \$1, updated_at = NOW\(\), delivered_at = NOW\(\)/i, (params) => {
      const order = state.orders.get(String(params[1]));
      if (order) order.status = params[0];
      return { rows: [], rowCount: order ? 1 : 0 };
    })
    .on(/UPDATE orders\s+SET rider_id = \$1, status = \$2/i, (params) => {
      const order = state.orders.get(String(params[2]));
      if (!order || order.riderId) return { rows: [], rowCount: 0 };
      order.riderId = params[0];
      order.status = params[1];
      return rows([{ id: order.id }]);
    })
    .on(/UPDATE orders SET status = \$1, updated_at = NOW\(\) WHERE id = \$2 AND status = \$3/i, (params) => {
      const order = state.orders.get(String(params[1]));
      if (!order || order.status !== params[2]) return { rows: [], rowCount: 0 };
      order.status = params[0];
      return rows([{ id: order.id }]);
    })
    .on(/UPDATE rider_profiles/i, () => ({ rows: [], rowCount: 1 }))
    .on(/FROM order_items oi/i, (params) => rows(state.items.get(String(params[0])) ?? []))
    .on(/WHERE o.customer_id = \$1/i, (params) => {
      const customerOrders = [...state.orders.values()].filter((order) => order.customerId === params[0]);
      return rows(customerOrders.map((order) => ({ id: order.id, status: order.status, totalAmountPaise: order.totalAmountPaise })));
    })
    .on(/FROM orders o\s+JOIN restaurants r/i, (params) => {
      const order = state.orders.get(String(params[0]));
      if (!order) return rows([]);
      const restaurant = state.restaurants.get(order.restaurantId);
      const customer = [...state.usersByClerk.values()].find((user) => user.id === order.customerId);
      return rows([{
        id: order.id,
        customerId: order.customerId,
        restaurantId: order.restaurantId,
        riderId: order.riderId,
        status: order.status,
        deliveryOtp: order.deliveryOtp,
        subtotalPaise: order.subtotalPaise,
        totalAmountPaise: order.totalAmountPaise,
        restaurantName: restaurant?.name,
        restaurantAddress: restaurant?.address,
        restaurantPhone: restaurant?.phone,
        customerName: customer?.fullName ?? 'Test Customer',
        customerPhone: customer?.phone ?? '+919876543210',
        createdAt: new Date().toISOString(),
      }]);
    })
    .on(/FROM restaurants r\s+WHERE r.is_active/i, () => rows([...(state.restaurants.values())].map((r) => ({ ...r, distanceMeters: 120 }))));

  // ---------------------------------------------------------------------------
  // Real Fastify gateway (mirrors apps/api/src/server.ts wiring).
  // ---------------------------------------------------------------------------
  const app = fastify({ logger: false });
  app.get('/health', async () => ({ status: 'healthy', service: 'bocardo-api', timestamp: new Date().toISOString() }));
  await registerRazorpayRoute(app, paymentService);
  await app.register(fastifyTRPCPlugin, { prefix: '/trpc', trpcOptions: { router: appRouter, createContext } });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as any).port as number;
  const baseUrl = `http://127.0.0.1:${port}`;

  const clientFor = (token: string) =>
    createApiClient({ baseUrl, getAuthToken: () => token }) as any;

  const customer = clientFor('mock_token_customer_e2e');
  const restaurant = clientFor('mock_token_restaurant_e2e');
  const rider = clientFor('mock_token_rider_e2e');

  let orderId = '';
  let deliveryOtp = '';
  let totalAmountPaise = 0;

  await suite.test('health endpoint reports the gateway is up', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status?: string };
    assert.equal(body.status, 'healthy');
  });

  await suite.test('public discovery works over HTTP', async () => {
    const nearby = await customer.restaurant.listNearby.query({ latitude: 12.9716, longitude: 77.6408 });
    assert.equal(nearby.length, 1);
    assert.equal(nearby[0].name, 'Biryani Bliss & Kebabs');
  });

  await suite.test('unauthenticated tRPC calls are rejected over HTTP', async () => {
    const anonymous = clientFor('');
    await assert.rejects(() => anonymous.auth.me.query());
  });

  await suite.test('customer creates an order with a server-generated OTP', async () => {
    const result = await customer.order.create.mutate({
      restaurantId: IDS.restaurant,
      items: [
        { dishId: IDS.dishA, quantity: 2 },
        { dishId: IDS.dishB, quantity: 1 },
      ],
      deliveryLatitude: 12.9716,
      deliveryLongitude: 77.6408,
      deliveryAddress: '42, 100 Feet Road, Indiranagar',
    });
    orderId = result.orderId;
    deliveryOtp = result.deliveryOtp;
    totalAmountPaise = result.totalAmountPaise;
    assert.match(deliveryOtp, /^\d{4}$/);
    assert.equal(state.orders.get(orderId)?.status, OrderStatus.PAYMENT_PENDING);
    assert.equal(state.orders.get(orderId)?.totalAmountPaise, totalAmountPaise);
  });

  await suite.test('webhook with an invalid signature is rejected', async () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_x', order_id: 'order_x', amount: 1, currency: 'INR', status: 'captured' } } } });
    const response = await fetch(`${baseUrl}/webhooks/razorpay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'f'.repeat(64), 'x-razorpay-event-id': 'evt_bad' },
      body,
    });
    assert.equal(response.status, 400);
  });

  const captureWebhook = async (eventId: string) => {
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_e2e', order_id: state.orders.get(orderId)!.razorpayOrderId, amount: totalAmountPaise, currency: 'INR', status: 'captured' } } },
    });
    const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    return fetch(`${baseUrl}/webhooks/razorpay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId },
      body,
    });
  };

  await suite.test('payment.captured webhook marks the order PAID and notifies the kitchen', async () => {
    const response = await captureWebhook('evt_e2e_captured');
    assert.equal(response.status, 200);
    assert.equal(state.orders.get(orderId)?.status, OrderStatus.PAID);
    assert.ok(state.outbox.some((event) => event.room === `restaurant:${IDS.restaurant}` && event.event === 'restaurant:new_order'));
  });

  await suite.test('replaying the same webhook event is idempotent', async () => {
    const response = await captureWebhook('evt_e2e_captured');
    assert.equal(response.status, 200);
    const kitchenNotifications = state.outbox.filter((event) => event.event === 'restaurant:new_order');
    assert.equal(kitchenNotifications.length, 1);
  });

  await suite.test('kitchen sees the incoming order with a masked OTP', async () => {
    const order = await restaurant.order.getById.query({ orderId });
    assert.equal(order.status, OrderStatus.PAID);
    assert.equal(order.deliveryOtp, '****');
  });

  await suite.test('kitchen drives the order to READY_FOR_PICKUP', async () => {
    await restaurant.order.updateStatus.mutate({ orderId, status: OrderStatus.ACCEPTED_BY_KITCHEN });
    await restaurant.order.updateStatus.mutate({ orderId, status: OrderStatus.PREPARING });
    const ready = await restaurant.order.updateStatus.mutate({ orderId, status: OrderStatus.READY_FOR_PICKUP });
    assert.equal(ready.status, OrderStatus.READY_FOR_PICKUP);
    assert.equal(state.orders.get(orderId)?.status, OrderStatus.READY_FOR_PICKUP);
  });

  await suite.test('sequential dispatch assigns the nearest rider', async () => {
    await redisService.set(
      `dispatch:state:${orderId}`,
      JSON.stringify({ rejectedRiderIds: [], currentCandidateId: IDS.rider, attempt: 1 }),
      'EX',
      300
    );
    await rider.rider.respondToDispatchOffer.mutate({ orderId, accepted: true });
    const order = state.orders.get(orderId)!;
    assert.equal(order.riderId, IDS.rider);
    assert.equal(order.status, OrderStatus.RIDER_ASSIGNED);
  });

  await suite.test('rider picks up and goes out for delivery', async () => {
    const result = await rider.order.updateStatus.mutate({ orderId, status: OrderStatus.OUT_FOR_DELIVERY });
    assert.equal(result.status, OrderStatus.OUT_FOR_DELIVERY);
  });

  await suite.test('rider cannot complete delivery without the customer OTP', async () => {
    await redisService.set(
      `rider:loc:${IDS.rider}`,
      JSON.stringify({ longitude: 77.6408, latitude: 12.9716, updatedAt: Date.now(), accuracy: 8 })
    );
    await assert.rejects(() => rider.order.verifyDeliveryOtp.mutate({ orderId, otp: '0000' }));
  });

  await suite.test('correct handover OTP completes the delivery', async () => {
    const result = await rider.order.verifyDeliveryOtp.mutate({ orderId, otp: deliveryOtp });
    assert.equal(result.success, true);
    assert.equal(state.orders.get(orderId)?.status, OrderStatus.DELIVERED);
  });

  await suite.test('customer sees the delivered order with their OTP', async () => {
    const order = await customer.order.getById.query({ orderId });
    assert.equal(order.status, OrderStatus.DELIVERED);
    assert.equal(order.deliveryOtp, deliveryOtp);
    assert.equal(order.customerPhone, '+919876543210');
  });

  await suite.test('customer history lists the completed order', async () => {
    const orders = await customer.order.listMyOrders.query();
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, OrderStatus.DELIVERED);
  });

  await app.close();
});
