import { Server as HttpServer } from 'http';
import { Server as SocketIoServer, Socket } from 'socket.io';
import { GpsCoordinateSchema, RiderLocationUpdatePayload } from '@bocardo/shared-types';
import { redisService } from './redis';
import { authenticateToken, AuthUser } from '../context';
import { db } from '@bocardo/database';
import { UserRole } from '@bocardo/shared-types';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { z } from 'zod';

let io: SocketIoServer | null = null;

export const socketService = {
  initialize: (httpServer: HttpServer) => {
    io = new SocketIoServer(httpServer, {
      cors: {
        origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3001').split(','),
        methods: ['GET', 'POST'],
      },
      pingTimeout: 10000,
      pingInterval: 5000,
    });

    if (process.env.REDIS_URL) {
      const publisher = new Redis(process.env.REDIS_URL);
      const subscriber = publisher.duplicate();
      publisher.on('error', () => console.error('Socket Redis publisher unavailable'));
      subscriber.on('error', () => console.error('Socket Redis subscriber unavailable'));
      io.adapter(createAdapter(publisher, subscriber));
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL is required for production realtime');
    }
    io.use(async (socket, next) => {
      const token = socket.handshake.auth.token;
      const user = typeof token === 'string' ? await authenticateToken(token) : null;
      if (!user) return next(new Error('Unauthorized'));
      socket.data.user = user;
      next();
    });

    io.on('connection', (socket: Socket) => {
      const user = socket.data.user as AuthUser;
      socket.join(`user:${user.id}`);
      if (user.role === UserRole.RIDER) socket.join(`rider:${user.id}`);
      if (user.role === UserRole.RESTAURANT && user.restaurantId) socket.join(`restaurant:${user.restaurantId}`);
      // Room subscription helper
      socket.on('join:room', async (room: unknown) => {
        if (typeof room !== 'string' || !room.startsWith('order_tracking:')) return;
        const orderId = room.slice('order_tracking:'.length);
        if (!z.string().uuid().safeParse(orderId).success) return;
        try {
          const order = await db.query(`SELECT id FROM orders WHERE id = $1 AND
            (customer_id = $2 OR rider_id = $2 OR restaurant_id = $3 OR $4 = 'ADMIN')`,
            [orderId, user.id, user.restaurantId || null, user.role]);
          if (order.rowCount) await socket.join(room);
        } catch { socket.emit('error', { message: 'Room subscription unavailable' }); }
      });

      socket.on('leave:room', (room: string) => {
        socket.leave(room);
      });

      /**
       * Ingestion & Throttling of GPS Coordinates (Every 3 seconds from Rider):
       * 1. Rejects fake/simulated GPS (isMocked === true)
       * 2. Writes coordinates to Redis with 30s TTL (Zero PostgreSQL continuous writes)
       * 3. Broadcasts in-memory directly to customer's order tracking room
       */
      socket.on('rider:location:update', async (payload: RiderLocationUpdatePayload) => {
        try {
          if (user.role !== UserRole.RIDER || !payload || payload.riderId !== user.id) return;
          // Anti-Cheat: Validate coordinate and reject mock GPS
          const parsedCoord = GpsCoordinateSchema.safeParse(payload.coordinate);
          if (!parsedCoord.success) {
            socket.emit('error', { message: 'Invalid or spoofed GPS location rejected.' });
            return;
          }

          const { latitude, longitude, heading, speed, accuracy, timestamp } = parsedCoord.data;
          if (!timestamp || Math.abs(Date.now() - timestamp) > 30000 || accuracy === undefined || accuracy > 50) return;
          const profile = await db.query('SELECT active_order_id, is_online FROM rider_profiles WHERE user_id = $1', [user.id]);
          if (!profile.rows[0]?.is_online || (payload.orderId && profile.rows[0].active_order_id !== payload.orderId)) return;
          if (!await redisService.acquireLock(`gps:throttle:${user.id}`, 3)) return;

          // Write to Redis with 30-second TTL
          await redisService.set(
            `rider:loc:${payload.riderId}`,
            JSON.stringify({ latitude, longitude, heading, speed, accuracy, updatedAt: Date.now() }),
            'EX',
            30
          );
          if (await redisService.acquireLock(`gps:snapshot:${user.id}`, 30)) {
            await db.query(`UPDATE rider_profiles SET last_location = ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, updated_at = NOW() WHERE user_id = $1`, [user.id, longitude, latitude]);
          }

          // In-memory real-time broadcast to the customer tracking room
          if (payload.orderId) {
            io?.to(`order_tracking:${payload.orderId}`).emit('order_tracking', {
              orderId: payload.orderId,
              riderLocation: { latitude, longitude, heading, speed },
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('[Socket GPS Stream Error]', error);
        }
      });

      socket.on('disconnect', () => {
        // Socket cleaned up
      });
    });

    console.log('✅ Socket.io Gateway initialized');
    return io;
  },

  getIo: () => io,

  emitToOrderTracking: (orderId: string, event: string, data: any) => {
    io?.to(`order_tracking:${orderId}`).emit(event, data);
  },

  emitToRestaurant: (restaurantId: string, event: string, data: any) => {
    io?.to(`restaurant:${restaurantId}`).emit(event, data);
  },

  emitToRider: (riderId: string, event: string, data: any) => {
    io?.to(`rider:${riderId}`).emit(event, data);
  },

  emitToUser: (userId: string, event: string, data: any) => {
    io?.to(`user:${userId}`).emit(event, data);
  },
};
