import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import dotenv from 'dotenv';
import { appRouter } from './routers/_app';
import { createContext, authenticateToken } from './context';
import { socketService } from './services/socket';
import { paymentService } from './services/payment';
import { registerRazorpayRoute } from './services/razorpayRoute';
import { startOutboxWorker } from './workers/outboxWorker';
import { startDispatchWorker } from './workers/sequentialDispatchWorker';
import { startQueueWorkers, stopQueueWorkers } from './services/queue';
import { redisService } from './services/redis';
import { db } from '@bocardo/database';

dotenv.config();

const port = Number(process.env.PORT) || 3000;
const server: FastifyInstance = fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
  },
  // Per-request correlation ID for tracing (X-Request-Id honored if present)
  genReqId: (req) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
  trustProxy: process.env.NODE_ENV === 'production', // real client IPs behind LB
});

async function main() {
  // 1. CORS (locked to explicit allowlist)
  await server.register(cors, {
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // 2. Global rate limit: baseline DoS shield
  await server.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX) || 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      // SECURITY: never bucket by the raw token — an attacker rotating garbage
      // tokens would mint a fresh 300/min bucket per request (evasion).
      // req.userId is set by the onRequest hook below only for VERIFIED tokens.
      const uid = (req as any).userId;
      return uid ? `u:${uid}` : req.ip;
    },
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
    }),
  });

  // 2b. Verify bearer token once per request so rate-limiting keys on the
  // verified identity (not spoofable). Failure → anonymous IP bucket.
  server.addHook('onRequest', async (req) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return;
    try {
      const user = await authenticateToken(auth.slice(7).trim());
      if (user) (req as any).userId = user.id;
    } catch {
      /* fall through to IP bucket */
    }
  });

  // 3. Health check
  server.get('/health', async () => {
    return {
      status: 'healthy',
      service: 'bocardo-api',
      timestamp: new Date().toISOString(),
    };
  });

  // 4. Webhook: Razorpay Payment Captured, Failed & Refunds
  await registerRazorpayRoute(server, paymentService);

  // 5. Register tRPC Fastify Plugin
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

  // 6. Initialize Socket.io Server on underlying HTTP server
  socketService.initialize(server.server);
  const stopOutbox = startOutboxWorker();

  // 7. Start durable BullMQ workers (ghost restaurant, dispatch, sweeps)
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_QUEUE_WORKERS === 'true') {
    startQueueWorkers();
    startDispatchWorker();
  } else {
    console.log('ℹ️ Queue workers disabled (set ENABLE_QUEUE_WORKERS=true to run them in dev)');
  }

  server.addHook('onClose', async () => stopOutbox());

  // 8. Start listening
  try {
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Fastify + tRPC API Gateway running on http://localhost:${port}`);
    console.log(`⚡ Socket.io real-time server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown: drain HTTP, stop workers, close queues, release DB pool
let shuttingDown = false;
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n🛑 Received ${signal}, closing server gracefully...`);
    try {
      await server.close();
      await stopQueueWorkers();
      await redisService.shutdown();
      await db.close();
    } catch (err) {
      console.error('Error during graceful shutdown:', err);
    }
    process.exit(0);
  });
});

main();
