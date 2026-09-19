import { verifyWebhookSignature } from './webhookSignature';
import Razorpay from 'razorpay';
import { db } from '@bocardo/database';
import { OrderStatus } from '@bocardo/shared-types';
import { socketService } from './socket';

const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_key_id';
const keySecret = process.env.RAZORPAY_KEY_SECRET || 'mock_razorpay_secret';
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});

export const paymentService = {
  /**
   * Creates an order with Razorpay in integer paise.
   */
  createOrder: async (orderId: string, amountPaise: number) => {
    try {
      if (keyId.startsWith('rzp_test_mock') && process.env.NODE_ENV === 'development' && process.env.ALLOW_MOCK_PAYMENTS === 'true') {
        // Safe mock return for local development without live API keys
        return {
          id: `order_mock_${orderId.replace(/-/g, '').slice(0, 14)}`,
          amount: amountPaise,
          currency: 'INR',
          receipt: `order_${orderId}`,
          status: 'created',
        };
      }

      const response = await razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: orderId,
      });
      return response;
    } catch (error) {
      console.error('[Razorpay createOrder Error]', error);
      throw error;
    }
  },

  /**
   * Verifies Razorpay Webhook HMAC SHA-256 Signature.
   */
  verifyWebhookSignature: (rawBody: string, signature: string): boolean => {
    return verifyWebhookSignature(rawBody, signature, webhookSecret);
  },

  /**
   * Idempotent & Serializable Webhook Processor:
   * 1. Checks processed_webhooks to prevent replay attacks
   * 2. Acquires row lock: SELECT * FROM orders WHERE id = $1 FOR UPDATE
   * 3. Transitions status PAYMENT_PENDING -> PAID
   * 4. Emits restaurant incoming order bell socket event
   */
  processPaymentCapturedWebhook: async (
    eventId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    payload: any
  ): Promise<{ success: boolean; alreadyProcessed: boolean }> => {
    return await db.withTransaction(async (client) => {
      // 1. Check idempotency
      const existing = await client.query(
        `INSERT INTO processed_webhooks (event_id, event_type, payload)
         VALUES ($1, 'payment.captured', $2) ON CONFLICT DO NOTHING RETURNING event_id`,
        [eventId, JSON.stringify(payload)]
      );
      if (!existing.rowCount) {
        return { success: true, alreadyProcessed: true };
      }

      // 2. Lock and retrieve order
      const orderRes = await client.query(
        'SELECT id, restaurant_id, status, total_amount_paise FROM orders WHERE razorpay_order_id = $1 FOR UPDATE',
        [razorpayOrderId]
      );

      if (!orderRes.rowCount || orderRes.rowCount === 0) {
        console.warn(`[Payment Webhook] Order not found for razorpay_order_id: ${razorpayOrderId}`);
        throw new Error('Payment order is not available for reconciliation');
      }

      const order = orderRes.rows[0];
      const payment = payload.payload?.payment?.entity;
      if (payment?.amount !== Number(order.total_amount_paise) || payment?.currency !== 'INR' || payment?.status !== 'captured') {
        throw new Error('Captured payment does not match the order');
      }

      if (order.status === OrderStatus.PAYMENT_PENDING) {
        await client.query(
          `UPDATE orders 
           SET status = $1, razorpay_payment_id = $2, updated_at = NOW() 
           WHERE id = $3`,
          [OrderStatus.PAID, razorpayPaymentId, order.id]
        );
      }

      if (order.status === OrderStatus.PAYMENT_PENDING) {
        await client.query(`INSERT INTO realtime_outbox (room, event, payload) VALUES ($1, $2, $3)`,
          [`restaurant:${order.restaurant_id}`, 'restaurant:new_order', JSON.stringify({ orderId: order.id, restaurantId: order.restaurant_id, totalAmountPaise: Number(order.total_amount_paise) })]);
      }

      return { success: true, alreadyProcessed: false };
    });
  },

  /**
   * Invokes Razorpay Instant Refund API.
   * Used for Ghost Restaurant 120s timeout auto-cancellation.
   */
  refundPayment: async (
    paymentId: string,
    amountPaise: number,
    notes: Record<string, string>
  ) => {
    try {
      if (!paymentId) throw new Error('A captured payment is required for refund');
      if (keyId.startsWith('rzp_test_mock') && process.env.NODE_ENV === 'development' && process.env.ALLOW_MOCK_PAYMENTS === 'true') {
        return {
          id: `rfnd_mock_${Date.now()}`,
          payment_id: paymentId || 'mock_pay_id',
          amount: amountPaise,
          status: 'processed',
        };
      }

      const refund = await razorpay.payments.refund(paymentId, {
        amount: amountPaise,
        notes,
      });
      return refund;
    } catch (error) {
      console.error('[Razorpay Refund Error]', error);
      throw error;
    }
  },
};
