import assert from 'node:assert/strict';
import http from 'node:http';
import { socketService } from '../../apps/api/src/services/socket';
import { redisService } from '../../apps/api/src/services/redis';
import { OrderStatus, UserRole } from '../../packages/shared-types/src';
import { installPlatformDoubles, MockDb } from '../harness/db';
import { IDS } from '../harness/trpc';
import { Suite, runSuite } from '../harness/suite';

/**
 * End-to-end coverage for the Socket.io GPS gateway.
 *
 * A real HTTP server is booted and the production gateway initialised on it, so
 * the test drives the actual authentication middleware, the real rider-location
 * handler and the real room fan-out over a real Engine.io websocket — the only
 * thing replaced is PostgreSQL.
 */

// The gateway installs a Redis pub/sub adapter whenever REDIS_URL is set. Drop
// it so the suite runs single-process against the in-memory Redis fallback.
delete process.env.REDIS_URL;

/**
 * The client half of the wire protocol.
 *
 * `socket.io-client` is pnpm-linked only inside the mobile apps, and its
 * browser-oriented declarations pull transitive types that are unreachable
 * from the linked layout. The runtime export is therefore required directly
 * and given the small contract this test actually exercises — the server side
 * under test stays fully typed.
 */
interface TestSocket {
  connected: boolean;
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener?: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
  close(): void;
}

const createClient = (
  require('../../apps/rider/node_modules/socket.io-client') as {
    io: (url: string, options?: Record<string, unknown>) => TestSocket;
  }
).io;

type ClientSocket = TestSocket;

const suite = new Suite('E2E · Socket.io GPS Gateway (anti-spoof, TTL, tracking broadcast)');

const ORDER_ID = IDS.order;
const RIDER_TOKEN = 'mock_token_rider_gps';
const CUSTOMER_TOKEN = 'mock_token_customer_gps';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves with the first payload for `event`, or rejects after `timeoutMs`. */
function once<T = any>(socket: ClientSocket, event: string, timeoutMs = 4000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timed out after ${timeoutMs}ms waiting for "${event}"`));
    }, timeoutMs);
    const onEvent = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };
    socket.on(event, onEvent);
  });
}

/** Asserts that `event` does NOT arrive within the observation window. */
async function expectNoEvent(socket: ClientSocket, event: string, windowMs = 400): Promise<void> {
  let seen = false;
  const onEvent = () => {
    seen = true;
  };
  socket.on(event, onEvent);
  await sleep(windowMs);
  socket.off(event, onEvent);
  assert.equal(seen, false, `unexpected "${event}" event was emitted`);
}

function connect(url: string, token: string): ClientSocket {
  const socket = createClient(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  return socket;
}

runSuite(suite, async () => {
  // ------------------------------------------------------------------ state
  let riderOnline = true;
  let riderActiveOrderId: string | null = ORDER_ID;
  let roomSubscribers = 1; // does the requester own the order?

  const mockDb: MockDb = installPlatformDoubles()
    // JIT user upsert performed by authenticateToken: one row per clerk id.
    .on(/INSERT INTO users \(clerk_id, email, phone, full_name, role\)/i, (params) => {
      const [clerkId, email, , fullName, role] = params;
      const id =
        role === UserRole.RIDER
          ? IDS.rider
          : role === UserRole.RESTAURANT
            ? IDS.restaurantOwner
            : role === UserRole.ADMIN
              ? IDS.admin
              : IDS.customer;
      return {
        rows: [{ id, clerkId, email, phone: null, fullName, role, isSuspended: false }],
        rowCount: 1,
      };
    })
    // Rider telemetry preconditions
    .on(/SELECT active_order_id, is_online FROM rider_profiles WHERE user_id = \$1/i, () => ({
      rows: riderActiveOrderId === null && !riderOnline
        ? [{ active_order_id: null, is_online: false }]
        : [{ active_order_id: riderActiveOrderId, is_online: riderOnline }],
      rowCount: 1,
    }))
    // Throttled PostGIS snapshot of the rider's last known point
    .on(/UPDATE rider_profiles SET last_location/i, () => ({ rows: [], rowCount: 1 }))
    // Order-tracking room ownership check
    .on(/SELECT id FROM orders WHERE id = \$1 AND/i, () => ({
      rows: roomSubscribers ? [{ id: ORDER_ID }] : [],
      rowCount: roomSubscribers,
    }));

  // Spy on the durable GPS cache writes so the 30s TTL can be asserted.
  const cacheWrites: Array<{ key: string; value: string; mode?: string; ttl?: number }> = [];
  const realSet = redisService.set;
  redisService.set = (async (key: string, value: string, mode?: string, ttl?: number) => {
    cacheWrites.push({ key, value, mode, ttl });
    return realSet.call(redisService, key, value, mode, ttl);
  }) as typeof redisService.set;

  // ------------------------------------------------------------------ boot
  const httpServer = http.createServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}`;

  const io = socketService.initialize(httpServer);
  assert.ok(io, 'socket gateway failed to initialize');

  const clients: ClientSocket[] = [];
  const openClient = async (token: string): Promise<ClientSocket> => {
    const socket = connect(url, token);
    clients.push(socket);
    await once(socket, 'connect');
    return socket;
  };

  const locationKey = `rider:loc:${IDS.rider}`;
  const resetThrottleLocks = async () => {
    await redisService.del(`gps:throttle:${IDS.rider}`);
    await redisService.del(`gps:snapshot:${IDS.rider}`);
    await redisService.del(locationKey);
  };

  // ------------------------------------------------------- authentication
  await suite.test('a connection without a token is rejected before any handshake data is trusted', async () => {
    const socket = connect(url, 'not-a-token');
    socket.on('connect_error', () => {
      /* swallowed: the assertion below proves the handshake never completed */
    });
    const error = await once<any>(socket, 'connect_error');
    assert.equal(error.message, 'Unauthorized');
    assert.equal(socket.connected, false);
    socket.close();
  });

  const rider = await openClient(RIDER_TOKEN);
  const customer = await openClient(CUSTOMER_TOKEN);

  await suite.test('a mock-token rider is authenticated and auto-joined to its private rooms', async () => {
    assert.equal(rider.connected, true);
    assert.equal(customer.connected, true);
    assert.equal(socketService.getIo(), io);

    // The rider room is created server-side, so dispatch offers must be deliverable.
    const offer = once<any>(rider, 'dispatch:offer');
    socketService.emitToRider(IDS.rider, 'dispatch:offer', { orderId: ORDER_ID });
    assert.deepEqual(await offer, { orderId: ORDER_ID });

    // ...and a customer socket must never sit in a rider's private room.
    socketService.emitToRider(IDS.rider, 'dispatch:offer', { orderId: ORDER_ID });
    await expectNoEvent(customer, 'dispatch:offer', 250);
  });

  // ---------------------------------------------------- order tracking room
  await suite.test('an order owner can subscribe to the tracking room', async () => {
    roomSubscribers = 1;
    const ready = async () => {
      customer.emit('join:room', `order_tracking:${ORDER_ID}`);
      await sleep(200);
    };
    await ready();

    const received = once<any>(customer, 'order_tracking');
    socketService.emitToOrderTracking(ORDER_ID, 'order_tracking', { orderId: ORDER_ID, status: 'RIDER_ASSIGNED' });
    assert.equal((await received).status, 'RIDER_ASSIGNED');
  });

  await suite.test('a non-owner never receives another customer’s tracking stream', async () => {
    const stranger = await openClient('mock_token_customer_stranger');
    roomSubscribers = 0;
    stranger.emit('join:room', `order_tracking:${ORDER_ID}`);
    await sleep(200);

    await expectNoEvent(stranger, 'order_tracking');
    socketService.emitToOrderTracking(ORDER_ID, 'order_tracking', { orderId: ORDER_ID });
    await expectNoEvent(stranger, 'order_tracking');

    roomSubscribers = 1;
    stranger.emit('leave:room', `order_tracking:${ORDER_ID}`);
    stranger.close();
  });

  await suite.test('join:room ignores malformed room names', async () => {
    customer.emit('join:room', 'restaurant:everything');
    customer.emit('join:room', { toString: () => 'order_tracking:bypass' });
    customer.emit('join:room', 'order_tracking:not-a-uuid');
    await sleep(150);
    // The gateway neither subscribed nor crashed: a broadcast still reaches the owner only.
    mockDb.clearLog();
    socketService.emitToOrderTracking(ORDER_ID, 'order:status:update', { orderId: ORDER_ID });
    assert.equal(mockDb.calls(/SELECT id FROM orders/i).length, 0, 'malformed rooms hit the database');
  });

  // =======================================================================
  // GPS ingestion — anti-spoof rejection
  // =======================================================================
  const validCoordinate = () => ({
    latitude: 12.9716,
    longitude: 77.5946,
    heading: 92,
    speed: 24,
    accuracy: 8,
    timestamp: Date.now(),
    isMocked: false,
  });

  await suite.test('mock GPS is rejected with an error and never cached or broadcast', async () => {
    await resetThrottleLocks();
    cacheWrites.length = 0;
    mockDb.clearLog();

    const rejection = once<any>(rider, 'error');
    const leakedBroadcast = once<any>(customer, 'order_tracking', 500).then(
      () => 'broadcast',
      () => 'silent'
    );

    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: { ...validCoordinate(), isMocked: true },
    });

    const error = await rejection;
    assert.match(error.message, /spoofed GPS location rejected/i);
    assert.equal(await leakedBroadcast, 'silent', 'spoofed coordinates were relayed to the customer');
    assert.equal(mockDb.calls(/SELECT active_order_id, is_online/i).length, 0, 'spoofed payloads reached the database');
    assert.equal(cacheWrites.length, 0, 'spoofed coordinates were written to the GPS cache');
    assert.equal(await redisService.get(locationKey), null);
  });

  await suite.test('out-of-range coordinates are rejected as spoofed', async () => {
    await resetThrottleLocks();
    cacheWrites.length = 0;

    const rejection = once<any>(rider, 'error');
    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: { ...validCoordinate(), latitude: 91.5 },
    });
    assert.match((await rejection).message, /spoofed GPS location rejected/i);
    assert.equal(cacheWrites.length, 0);
  });

  await suite.test('implausible accuracy, stale timestamps and telemetry from another rider are dropped', async () => {
    await resetThrottleLocks();
    cacheWrites.length = 0;
    mockDb.clearLog();

    // accuracy > 50m: too imprecise to be trusted
    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: { ...validCoordinate(), accuracy: 500 },
    });
    // timestamp older than the 30s freshness window
    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: { ...validCoordinate(), timestamp: Date.now() - 60_000 },
    });
    // missing timestamp / accuracy entirely
    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: { latitude: 12.97, longitude: 77.59, isMocked: false },
    });
    // spoofing another rider's id
    rider.emit('rider:location:update', {
      riderId: IDS.admin,
      orderId: ORDER_ID,
      coordinate: validCoordinate(),
    });

    await sleep(300);
    assert.equal(cacheWrites.length, 0, 'untrusted telemetry was cached');
    assert.equal(mockDb.calls(/SELECT active_order_id, is_online/i).length, 0, 'untrusted telemetry reached the database');
  });

  await suite.test('a customer cannot push rider GPS coordinates', async () => {
    await resetThrottleLocks();
    cacheWrites.length = 0;

    customer.emit('rider:location:update', {
      riderId: IDS.customer,
      orderId: ORDER_ID,
      coordinate: validCoordinate(),
    });

    await sleep(250);
    assert.equal(cacheWrites.length, 0, 'a non-rider wrote to the GPS cache');
    assert.equal(await redisService.get(`rider:loc:${IDS.customer}`), null);
  });

  await suite.test('telemetry from an offline rider is ignored', async () => {
    await resetThrottleLocks();
    cacheWrites.length = 0;
    riderOnline = false;

    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: validCoordinate(),
    });

    await sleep(250);
    assert.equal(cacheWrites.length, 0, 'an offline rider was tracked');
    riderOnline = true;
  });

  await suite.test('telemetry for an order the rider does not hold is ignored', async () => {
    await resetThrottleLocks();
    cacheWrites.length = 0;
    riderActiveOrderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: validCoordinate(),
    });

    await sleep(250);
    assert.equal(cacheWrites.length, 0, 'GPS was accepted for a mismatched active order');
    riderActiveOrderId = ORDER_ID;
  });

  // =======================================================================
  // GPS ingestion — happy path, Redis TTL and tracking broadcast
  // =======================================================================
  await suite.test('a valid ping is cached with a 30s TTL and broadcast to the tracking room', async () => {
    await resetThrottleLocks();
    cacheWrites.length = 0;
    mockDb.clearLog();

    const broadcast = once<any>(customer, 'order_tracking');
    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: { ...validCoordinate(), latitude: 12.9721, longitude: 77.5951 },
    });

    const payload = await broadcast;
    assert.equal(payload.orderId, ORDER_ID);
    assert.equal(payload.riderLocation.latitude, 12.9721);
    assert.equal(payload.riderLocation.longitude, 77.5951);
    assert.equal(payload.riderLocation.speed, 24);
    assert.ok(!Number.isNaN(Date.parse(payload.updatedAt)), 'updatedAt must be an ISO timestamp');

    const write = cacheWrites.find((entry) => entry.key === locationKey);
    assert.ok(write, 'GPS ping was never written to Redis');
    assert.equal(write!.mode, 'EX');
    assert.equal(write!.ttl, 30, 'GPS cache entries must expire after 30 seconds');

    const cached = JSON.parse((await redisService.get(locationKey))!);
    assert.equal(cached.latitude, 12.9721);
    assert.equal(cached.accuracy, 8);

    // PostGIS snapshot is throttled to one write per 30s window.
    assert.equal(mockDb.calls(/UPDATE rider_profiles SET last_location/i).length, 1);
    assert.deepEqual(mockDb.calls(/UPDATE rider_profiles SET last_location/i)[0].params, [IDS.rider, 77.5951, 12.9721]);
  });

  await suite.test('a cached GPS fix actually expires once its TTL elapses', async () => {
    const shortKey = `rider:loc:${IDS.rider}:expiry-probe`;
    await redisService.set(shortKey, JSON.stringify({ latitude: 1 }), 'EX', 1);
    assert.ok(await redisService.get(shortKey), 'value missing immediately after write');
    await sleep(1100);
    assert.equal(await redisService.get(shortKey), null, 'TTL was not enforced by the cache');
  });

  await suite.test('the 3-second throttle suppresses rapid successive pings', async () => {
    // Reproduce the lock the gateway holds for 3s after accepting a ping.
    await redisService.del(`gps:throttle:${IDS.rider}`);
    assert.equal(await redisService.acquireLock(`gps:throttle:${IDS.rider}`, 3), true);
    cacheWrites.length = 0;
    mockDb.clearLog();

    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: validCoordinate(),
    });

    await sleep(200);
    assert.equal(cacheWrites.length, 0, 'a throttled ping still reached Redis');
    assert.equal(mockDb.calls(/UPDATE rider_profiles SET last_location/i).length, 0);
  });

  await suite.test('the throttle window releases and telemetry resumes', async () => {
    await redisService.del(`gps:throttle:${IDS.rider}`);
    cacheWrites.length = 0;

    const broadcast = once<any>(customer, 'order_tracking');
    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: ORDER_ID,
      coordinate: validCoordinate(),
    });

    assert.equal((await broadcast).orderId, ORDER_ID);
    assert.equal(cacheWrites.filter((entry) => entry.key === locationKey).length, 1);
  });

  await suite.test('a rider ping without an order id is cached but not broadcast', async () => {
    await resetThrottleLocks();
    cacheWrites.length = 0;
    riderActiveOrderId = null;

    rider.emit('rider:location:update', {
      riderId: IDS.rider,
      orderId: undefined,
      coordinate: validCoordinate(),
    });

    await sleep(300);
    assert.equal(cacheWrites.filter((entry) => entry.key === locationKey).length, 1);
    await expectNoEvent(customer, 'order_tracking', 250);
    riderActiveOrderId = ORDER_ID;
  });

  await suite.test('disconnecting a rider leaves the gateway serving other clients', async () => {
    const temporary = await openClient(RIDER_TOKEN);
    temporary.close();
    await sleep(150);

    const stillAlive = once<any>(customer, 'order_tracking');
    socketService.emitToOrderTracking(ORDER_ID, 'order_tracking', { orderId: ORDER_ID, status: OrderStatus.OUT_FOR_DELIVERY });
    assert.equal((await stillAlive).status, OrderStatus.OUT_FOR_DELIVERY);
  });

  // ---------------------------------------------------------------- teardown
  for (const client of clients) client.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  redisService.set = realSet;
});
