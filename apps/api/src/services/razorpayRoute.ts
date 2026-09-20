import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

interface PaymentHandler {
  verifyWebhookSignature(body: string, signature: string): boolean;
  processPaymentCapturedWebhook(eventId: string, orderId: string, paymentId: string, payload: unknown): Promise<{ success: boolean; alreadyProcessed: boolean }>;
  processPaymentFailedWebhook(eventId: string, orderId: string, payload: unknown): Promise<{ success: boolean; alreadyProcessed: boolean }>;
}

export async function registerRazorpayRoute(server: FastifyInstance, payments: PaymentHandler) {
  await server.register(async (webhooks) => {
    webhooks.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => done(null, body));
    webhooks.post('/webhooks/razorpay', { bodyLimit: 262144 }, async (request, reply) => {
      const signature = request.headers['x-razorpay-signature'];
      const body = request.body as string;
      if (typeof signature !== 'string' || !payments.verifyWebhookSignature(body, signature)) {
        return reply.status(400).send({ error: 'Invalid webhook signature' });
      }
      let event;
      try { event = JSON.parse(body); } catch { return reply.status(400).send({ error: 'Invalid JSON' }); }
      if (!event || typeof event !== 'object') return reply.status(400).send({ error: 'Invalid event' });
      if (event.event === 'payment.captured') {
        const parsed = z.object({
          id: z.string().min(1).max(255), order_id: z.string().min(1).max(255),
          amount: z.number().int().positive().safe(), currency: z.literal('INR'), status: z.literal('captured'),
        }).safeParse(event.payload?.payment?.entity);
        const eventId = request.headers['x-razorpay-event-id'];
        if (!parsed.success || typeof eventId !== 'string' || !eventId || eventId.length > 255) {
          return reply.status(400).send({ error: 'Invalid captured payment or missing event ID' });
        }
        const payment = parsed.data;
        const result = await payments.processPaymentCapturedWebhook(eventId, payment.order_id, payment.id, event);
        if (!result.success) return reply.status(503).send({ error: 'Payment requires reconciliation; retry later' });
      }
      if (event.event === 'payment.failed') {
        const parsed = z.object({
          id: z.string().min(1).max(255),
          order_id: z.string().min(1).max(255),
        }).safeParse(event.payload?.payment?.entity);
        const eventId = request.headers['x-razorpay-event-id'];
        if (!parsed.success || typeof eventId !== 'string' || !eventId || eventId.length > 255) {
          return reply.status(400).send({ error: 'Invalid failed payment or missing event ID' });
        }
        await payments.processPaymentFailedWebhook(eventId, parsed.data.order_id, event);
      }
      return { status: 'ok' };
    });
  });
}
