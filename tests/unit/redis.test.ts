import assert from 'node:assert/strict';
import { redisService } from '../../apps/api/src/services/redis';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Redis Service (fallback cache & locks)');

const prefix = `test:${Date.now()}:`;

runSuite(suite, async () => {
  await suite.test('set/get round-trips values', async () => {
    const key = `${prefix}roundtrip`;
    await redisService.set(key, 'hello');
    assert.equal(await redisService.get(key), 'hello');
    await redisService.del(key);
    assert.equal(await redisService.get(key), null);
  });

  await suite.test('get returns null for unknown keys', async () => {
    assert.equal(await redisService.get(`${prefix}missing`), null);
  });

  await suite.test('EX TTL expires entries', async () => {
    const key = `${prefix}ttl`;
    await redisService.set(key, 'stale', 'EX', -1);
    assert.equal(await redisService.get(key), null);
  });

  await suite.test('del removes entries', async () => {
    const key = `${prefix}del`;
    await redisService.set(key, 'value');
    await redisService.del(key);
    assert.equal(await redisService.get(key), null);
  });

  await suite.test('acquireLock is exclusive until released', async () => {
    const lock = `${prefix}lock`;
    assert.equal(await redisService.acquireLock(lock, 10), true);
    assert.equal(await redisService.acquireLock(lock, 10), false);
    await redisService.releaseLock(lock);
    assert.equal(await redisService.acquireLock(lock, 10), true);
    await redisService.releaseLock(lock);
  });

  await suite.test('lock with zero TTL is immediately re-acquirable', async () => {
    const lock = `${prefix}zero-ttl`;
    assert.equal(await redisService.acquireLock(lock, 0), true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(await redisService.acquireLock(lock, 0), true);
    await redisService.releaseLock(lock);
  });

  await suite.test('releasing a free lock is a safe no-op', async () => {
    const lock = `${prefix}free-release`;
    await redisService.releaseLock(lock);
    assert.equal(await redisService.acquireLock(lock, 10), true, 'lock after free release must succeed');
    await redisService.releaseLock(lock);
  });

  await suite.test('JSON payloads survive the cache unchanged', async () => {
    const key = `${prefix}json`;
    const value = JSON.stringify({ latitude: 12.9716, accuracy: 8, tags: ['a', 'b'] });
    await redisService.set(key, value);
    assert.equal(await redisService.get(key), value);
    assert.deepEqual(JSON.parse((await redisService.get(key))!), {
      latitude: 12.9716,
      accuracy: 8,
      tags: ['a', 'b'],
    });
  });
});
