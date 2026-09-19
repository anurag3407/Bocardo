import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import crypto from 'crypto';
import { router, protectedProcedure, roleProtectedProcedure } from '../trpc';
import { db } from '@bocardo/database';
import {
  CreateOrderInputSchema,
  OrderStatus,
  UserRole,
  calculateOrderTaxBreakdown,
  maskPhoneNumber,
  VerifyDeliveryOtpSchema,
  canTransitionOrder,
} from '@bocardo/shared-types';
import { redisService } from '../services/redis';
import { paymentService } from '../services/payment';
import { socketService } from '../services/socket';
import { ghostRestaurantWorker } from '../workers/ghostRestaurantWorker';
import { sequentialDispatchWorker } from '../workers/sequentialDispatchWorker';

export const orderRouter = router({
  /**
   * Production-Hardened Checkout Pipeline:
   * 1. Acquires Redis lock to prevent duplicate clicks
   * 2. Validates cart items against live DB prices (Rejects client-tampered totals)
   * 3. Calculates Section 9(5) CGST dual-tax in integer paise
   * 4. Generates 4-digit cryptographically secure Delivery Handover OTP
   * 5. Creates order in PAYMENT_PENDING & registers with Razorpay
   */
  create: roleProtectedProcedure(UserRole.CUSTOMER)
    .input(CreateOrderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const lockKey = `lock:cart:${userId}`;

      // 1. Acquire Redis lock
      const acquired = await redisService.acquireLock(lockKey, 8);
      if (!acquired) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An order checkout is currently in progress. Please wait a moment.',
        });
      }

      try {
        const restaurant = await db.query('SELECT is_active, is_accepting_orders FROM restaurants WHERE id = $1', [input.restaurantId]);
        if (!restaurant.rows[0]?.is_active || !restaurant.rows[0]?.is_accepting_orders) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Restaurant is not accepting orders.' });
        }
        // 2. Fetch live dish prices directly from DB
        const dishIds = [...new Set(input.items.map((item) => item.dishId))];
        const dishesRes = await db.query(
          `SELECT id, name, price_paise, is_available, restaurant_id 
           FROM dishes 
           WHERE id = ANY($1::uuid[]) AND restaurant_id = $2`,
          [dishIds, input.restaurantId]
        );

        if (dishesRes.rows.length !== dishIds.length) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'One or more items are invalid or belong to a different restaurant.',
          });
        }

        const dishMap = new Map(dishesRes.rows.map((d) => [d.id, d]));

        // Check if any item is 86-ed (out of stock)
        for (const item of input.items) {
          const dish = dishMap.get(item.dishId);
          if (!dish?.is_available) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: `"${dish?.name}" is currently sold out. Please remove it from your cart.`,
            });
          }
        }

        // Calculate Subtotal in integer paise
        let subtotalPaise = 0;
        const validatedItems = input.items.map((item) => {
          const dish = dishMap.get(item.dishId)!;
          const unitPricePaise = Number(dish.price_paise);
          const totalPricePaise = unitPricePaise * item.quantity;
          subtotalPaise += totalPricePaise;
          return {
            dishId: item.dishId,
            name: dish.name,
            quantity: item.quantity,
            unitPricePaise,
            totalPricePaise,
          };
        });

        // 3. Indian Tax CGST Section 9(5) Integer-Paise Math
        const taxBreakdown = calculateOrderTaxBreakdown(subtotalPaise);

        // 4. Generate 4-digit Delivery Handover OTP (crypto-secure)
        const deliveryOtp = crypto.randomInt(1000, 10000).toString();

        // 5. Insert order and items within transaction
        const orderResult = await db.withTransaction(async (client) => {
          const orderInsert = await client.query(
            `INSERT INTO orders (
              customer_id, restaurant_id, status,
              delivery_location, delivery_address, delivery_otp,
              subtotal_paise, food_gst_paise, delivery_fee_paise,
              platform_fee_paise, service_gst_paise, total_amount_paise,
              special_instructions
            ) VALUES (
              $1, $2, $3,
              ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7,
              $8, $9, $10, $11, $12, $13, $14
            ) RETURNING id`,
            [
              userId,
              input.restaurantId,
              OrderStatus.PAYMENT_PENDING,
              input.deliveryLongitude,
              input.deliveryLatitude,
              input.deliveryAddress,
              deliveryOtp,
              taxBreakdown.subtotalPaise,
              taxBreakdown.foodGstPaise,
              taxBreakdown.deliveryFeePaise,
              taxBreakdown.platformFeePaise,
              taxBreakdown.serviceGstPaise,
              taxBreakdown.totalAmountPaise,
              input.specialInstructions || null,
            ]
          );

          const orderId = orderInsert.rows[0].id;

          // Insert order items
          for (const item of validatedItems) {
            await client.query(
              `INSERT INTO order_items (order_id, dish_id, quantity, unit_price_paise, total_price_paise)
               VALUES ($1, $2, $3, $4, $5)`,
              [orderId, item.dishId, item.quantity, item.unitPricePaise, item.totalPricePaise]
            );
          }

          return orderId;
        });

        // 6. Create Razorpay Order
        const rzpOrder = await paymentService.createOrder(
          orderResult,
          taxBreakdown.totalAmountPaise
        );

        // Update with Razorpay Order ID
        await db.query(
          'UPDATE orders SET razorpay_order_id = $1 WHERE id = $2',
          [rzpOrder.id, orderResult]
        );

        // Schedule Ghost Restaurant Timeout Check if auto-paid in dev mock
        if (process.env.NODE_ENV === 'development') {
          // In development without live Razorpay webhooks, allow mock confirmation
          ghostRestaurantWorker.scheduleCheck(orderResult);
        }

        return {
          orderId: orderResult,
          razorpayOrderId: rzpOrder.id,
          totalAmountPaise: taxBreakdown.totalAmountPaise,
          deliveryOtp,
          taxBreakdown,
        };
      } finally {
        await redisService.releaseLock(lockKey);
      }
    }),

  /**
   * BOLA / IDOR Protected Order Retrieval:
   * Enforces multi-tenant ownership barrier and masks phone numbers.
   */
  getById: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orderRes = await db.query(
        `SELECT o.id, o.customer_id as "customerId", o.restaurant_id as "restaurantId",
                o.rider_id as "riderId", o.status,
                ST_Y(o.delivery_location::geometry) as "deliveryLatitude",
                ST_X(o.delivery_location::geometry) as "deliveryLongitude",
                o.delivery_address as "deliveryAddress",
                o.delivery_otp as "deliveryOtp",
                o.subtotal_paise as "subtotalPaise",
                o.food_gst_paise as "foodGstPaise",
                o.delivery_fee_paise as "deliveryFeePaise",
                o.platform_fee_paise as "platformFeePaise",
                o.service_gst_paise as "serviceGstPaise",
                o.total_amount_paise as "totalAmountPaise",
                o.special_instructions as "specialInstructions",
                o.created_at as "createdAt",
                r.name as "restaurantName", r.address as "restaurantAddress",
                r.phone as "restaurantPhone",
                u.full_name as "customerName", u.phone as "customerPhone"
         FROM orders o
         JOIN restaurants r ON o.restaurant_id = r.id
         JOIN users u ON o.customer_id = u.id
         WHERE o.id = $1`,
        [input.orderId]
      );

      if (!orderRes.rowCount || orderRes.rowCount === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      const order = orderRes.rows[0];

      // Multi-Tenant Authorization Barrier (BOLA Defense)
      if (ctx.user.role === UserRole.CUSTOMER && order.customerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied to this order' });
      }
      if (ctx.user.role === UserRole.RESTAURANT && order.restaurantId !== ctx.user.restaurantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied to this order' });
      }
      if (ctx.user.role === UserRole.RIDER && order.riderId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied to this order' });
      }

      // Hide delivery_otp from Rider (customer must provide it verbally at door)
      let otpToReturn = order.deliveryOtp;
      if (ctx.user.role !== UserRole.CUSTOMER) {
        otpToReturn = '****';
      }

      // Privacy: Mask customer phone number for Rider and Restaurant roles
      let customerPhone = order.customerPhone;
      if (ctx.user.role === UserRole.RIDER || ctx.user.role === UserRole.RESTAURANT) {
        customerPhone = maskPhoneNumber(order.customerPhone);
      }

      // Fetch items
      const itemsRes = await db.query(
        `SELECT oi.id, oi.dish_id as "dishId", d.name, oi.quantity,
                oi.unit_price_paise as "unitPricePaise", oi.total_price_paise as "totalPricePaise",
                d.is_veg as "isVeg"
         FROM order_items oi
         JOIN dishes d ON oi.dish_id = d.id
         WHERE oi.order_id = $1`,
        [input.orderId]
      );

      return {
        ...order,
        deliveryOtp: otpToReturn,
        customerPhone,
        items: itemsRes.rows,
      };
    }),

  /**
   * Order State Machine Transitions
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        status: z.nativeEnum(OrderStatus),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orderRes = await db.query(
        'SELECT id, restaurant_id, rider_id, status FROM orders WHERE id = $1',
        [input.orderId]
      );

      if (!orderRes.rowCount || orderRes.rowCount === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      const order = orderRes.rows[0];

      // Role check for transition
      if (!canTransitionOrder(ctx.user.role, order.status, input.status)
        || (ctx.user.role === UserRole.RIDER && order.rider_id !== ctx.user.id)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Order transition is not permitted.' });
      }
      if (
        ctx.user.role === UserRole.RESTAURANT &&
        ctx.user.restaurantId !== order.restaurant_id
      ) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      // Update status in PostgreSQL
      const updated = await db.query(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING id',
        [input.status, input.orderId, order.status]
      );
      if (!updated.rowCount) throw new TRPCError({ code: 'CONFLICT', message: 'Order changed; refresh and retry.' });

      // Trigger sequential dispatch when food is READY_FOR_PICKUP or PREPARING
      if (input.status === OrderStatus.READY_FOR_PICKUP) {
        sequentialDispatchWorker.dispatchNextRider(input.orderId);
      }

      // Broadcast update to real-time tracking room
      socketService.emitToOrderTracking(input.orderId, 'order:status:update', {
        orderId: input.orderId,
        status: input.status,
      });

      return { success: true, status: input.status };
    }),

  /**
   * Anti-Fraud Delivery Handover OTP Verification:
   * The rider cannot tap DELIVERED without server verifying customer's 4-digit OTP.
   */
  verifyDeliveryOtp: roleProtectedProcedure(UserRole.RIDER)
    .input(VerifyDeliveryOtpSchema)
    .mutation(async ({ ctx, input }) => {
      const orderRes = await db.query(
        'SELECT id, status, delivery_otp, rider_id, otp_attempts FROM orders WHERE id = $1',
        [input.orderId]
      );

      if (!orderRes.rowCount || orderRes.rowCount === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      const order = orderRes.rows[0];

      if (order.rider_id !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not assigned to this order' });
      }

      if (order.status === OrderStatus.DELIVERED) return { success: true, message: 'Delivery already verified.' };
      if (order.status !== OrderStatus.OUT_FOR_DELIVERY) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Order is not out for delivery.' });
      const location = await redisService.get(`rider:loc:${ctx.user.id}`);
      if (!location) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Fresh GPS location required.' });
      const coordinate = JSON.parse(location);
      if (Date.now() - coordinate.updatedAt > 30000 || !Number.isFinite(coordinate.accuracy) || coordinate.accuracy > 50) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Accurate, fresh GPS location required.' });
      }
      const arrival = await db.query(`SELECT ST_DWithin(delivery_location, ST_SetSRID(ST_MakePoint($2, $3),4326)::geography,100) AS arrived FROM orders WHERE id = $1`,
        [input.orderId, coordinate.longitude, coordinate.latitude]);
      if (!arrival.rows[0]?.arrived) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'You must be within 100m of the delivery address.' });
      const attempt = await db.query(`UPDATE orders SET otp_attempts = otp_attempts + 1 WHERE id = $1 AND otp_attempts < 5 AND status = 'OUT_FOR_DELIVERY' RETURNING id`, [input.orderId]);
      if (!attempt.rowCount) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'OTP attempts exhausted; contact support.' });

      if (order.delivery_otp !== input.otp) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid 4-digit Delivery OTP. Please request the code from customer.',
        });
      }

      // Transition to DELIVERED and release rider
      await db.withTransaction(async (client) => {
        await client.query(
          `UPDATE orders 
           SET status = $1, updated_at = NOW(), delivered_at = NOW()
           WHERE id = $2 AND status = 'OUT_FOR_DELIVERY'`,
          [OrderStatus.DELIVERED, input.orderId]
        );

        if (order.rider_id) {
          await client.query(
            `UPDATE rider_profiles 
             SET active_order_id = NULL 
             WHERE user_id = $1 AND active_order_id = $2`,
            [order.rider_id, input.orderId]
          );
        }
      });

      socketService.emitToOrderTracking(input.orderId, 'order:status:update', {
        orderId: input.orderId,
        status: OrderStatus.DELIVERED,
      });

      return { success: true, message: 'Delivery verified successfully!' };
    }),

  /**
   * Lists customer's active and past orders
   */
  listMyOrders: protectedProcedure.query(async ({ ctx }) => {
    const res = await db.query(
      `SELECT o.id, o.status, o.total_amount_paise as "totalAmountPaise",
              o.delivery_otp as "deliveryOtp", o.created_at as "createdAt",
              r.name as "restaurantName", r.image_url as "restaurantImageUrl"
       FROM orders o
       JOIN restaurants r ON o.restaurant_id = r.id
       WHERE o.customer_id = $1
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [ctx.user.id]
    );

    return res.rows;
  }),

  /**
   * Lists restaurant's active KOT orders
   */
  listRestaurantOrders: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.restaurantId) {
      return [];
    }

    const res = await db.query(
      `SELECT o.id, o.status, o.total_amount_paise as "totalAmountPaise",
              o.delivery_address as "deliveryAddress", o.created_at as "createdAt",
              u.full_name as "customerName"
       FROM orders o
       JOIN users u ON o.customer_id = u.id
       WHERE o.restaurant_id = $1 
         AND o.status NOT IN ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_KITCHEN', 'CANCELLED_BY_SYSTEM')
       ORDER BY o.created_at DESC
       LIMIT 50`,
      [ctx.user.restaurantId]
    );

    return res.rows;
  }),
});
