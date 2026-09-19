import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// In-memory fallback map when Redis server is unreachable in development
const inMemoryCache = new Map<string, { value: string; expiresAt?: number }>();

function requireDevelopmentFallback() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Redis is unavailable');
}

let redisClient: Redis | null = null;
let isRedisConnected = false;

try {
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times <= 2 ? 1000 : null),
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
    console.log('✅ Redis connected successfully');
  });

  redisClient.on('error', (err) => {
    isRedisConnected = false;
    // Log once as warning in dev
  });
} catch (e) {
  isRedisConnected = false;
}

export const redisService = {
  get: async (key: string): Promise<string | null> => {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.get(key);
      } catch (e) {
        // Fallback to in-memory
      }
    }
    requireDevelopmentFallback();
    const item = inMemoryCache.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      inMemoryCache.delete(key);
      return null;
    }
    return item.value;
  },

  set: async (key: string, value: string, mode?: string, durationSeconds?: number): Promise<void> => {
    if (isRedisConnected && redisClient) {
      try {
        if (mode === 'EX' && durationSeconds) {
          await redisClient.set(key, value, 'EX', durationSeconds);
          return;
        }
        await redisClient.set(key, value);
        return;
      } catch (e) {
        // Fallback to in-memory
      }
    }
    requireDevelopmentFallback();
    const expiresAt = mode === 'EX' && durationSeconds ? Date.now() + durationSeconds * 1000 : undefined;
    inMemoryCache.set(key, { value, expiresAt });
  },

  del: async (key: string): Promise<void> => {
    if (isRedisConnected && redisClient) {
      try {
        await redisClient.del(key);
        return;
      } catch (e) {
        // Fallback
      }
    }
    requireDevelopmentFallback();
    inMemoryCache.delete(key);
  },

  /**
   * Acquire distributed cart lock: `lock:cart:<userId>`
   * Returns true if lock acquired, false if already locked
   */
  acquireLock: async (lockKey: string, ttlSeconds = 10): Promise<boolean> => {
    if (isRedisConnected && redisClient) {
      try {
        const result = await redisClient.set(lockKey, 'locked', 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      } catch (e) {
        // Fallback to memory
      }
    }
    requireDevelopmentFallback();
    const existing = inMemoryCache.get(lockKey);
    if (existing && (!existing.expiresAt || Date.now() <= existing.expiresAt)) {
      return false; // already locked
    }
    inMemoryCache.set(lockKey, { value: 'locked', expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  },

  releaseLock: async (lockKey: string): Promise<void> => {
    await redisService.del(lockKey);
  },
};
