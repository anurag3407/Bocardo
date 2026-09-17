import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import dotenv from 'dotenv';
import { appRouter } from './routers/_app';
import { createContext } from './context';
import { socketService } from './services/socket';
import { paymentService } from './services/payment';

dotenv.config();

const port = Number(process.env.PORT) || 3000;
const server: FastifyInstance = fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
  },
});

async function main() {
  // 1. CORS
  await server.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // 2. Health check
  server.get('/health', async () => {
    return {
      status: 'healthy',
      service: 'bocardo-api',
      timestamp: new Date().toISOString(),
    };
  });

  // 3. Webhook: Razorpay Payment Captured & Refunds
  server.post('/webhooks/razorpay', async (req, reply) => {
    const signature = req.headers['x-razorpay-signature'] as string;
    const bodyStr = JSON.stringify(req.body);

    const isValid = paymentService.verifyWebhookSignature(bodyStr, signature || '');
    if (!isValid) {
      server.log.warn('[Razorpay Webhook] Invalid signature rejected');
      return reply.status(400).send({ error: 'Invalid webhook signature' });
    }

    const event = req.body as any;
    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      await paymentService.processPaymentCapturedWebhook(
        event.id || `evt_${payment.id}`,
        payment.order_id,
        payment.id,
        event
      );
    }

    return reply.status(200).send({ status: 'ok' });
  });

  // 4. Register tRPC Fastify Plugin
  await server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ path, error }: { path?: string; error: any }) {
        console.error(`[tRPC Error] on path '${path}':`, error);
      },
    },
  });

  // 5. Initialize Socket.io Server on underlying HTTP server
  socketService.initialize(server.server);

  // 6. Start listening
  try {
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Fastify + tRPC API Gateway running on http://localhost:${port}`);
    console.log(`⚡ Socket.io real-time server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\n🛑 Received ${signal}, closing server gracefully...`);
    await server.close();
    process.exit(0);
  });
});

main();
