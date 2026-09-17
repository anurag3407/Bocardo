import { Server as HttpServer } from 'http';
import { Server as SocketIoServer, Socket } from 'socket.io';
import { GpsCoordinateSchema, RiderLocationUpdatePayload } from '@bocardo/shared-types';
import { redisService } from './redis';

let io: SocketIoServer | null = null;

export const socketService = {
  initialize: (httpServer: HttpServer) => {
    io = new SocketIoServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      pingTimeout: 10000,
      pingInterval: 5000,
    });

    io.on('connection', (socket: Socket) => {
      // Room subscription helper
      socket.on('join:room', (room: string) => {
        socket.join(room);
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
          // Anti-Cheat: Validate coordinate and reject mock GPS
          const parsedCoord = GpsCoordinateSchema.safeParse(payload.coordinate);
          if (!parsedCoord.success) {
            socket.emit('error', { message: 'Invalid or spoofed GPS location rejected.' });
            return;
          }

          const { latitude, longitude, heading, speed } = parsedCoord.data;

          // Write to Redis with 30-second TTL
          await redisService.set(
            `rider:loc:${payload.riderId}`,
            JSON.stringify({ latitude, longitude, heading, speed, updatedAt: Date.now() }),
            'EX',
            30
          );

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
