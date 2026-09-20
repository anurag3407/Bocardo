import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MealSlot } from '../../packages/shared-types/src';
import { getCurrentMealSlot } from '../../apps/api/src/routers/recommendations';
import { redisService } from '../../apps/api/src/services/redis';
import { installPlatformDoubles, MockDb } from '../harness/db';
import { callers, IDS } from '../harness/trpc';
import { expectTrpcError, Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Recommendation Engine');

runSuite(suite, async () => {
  let mockDb: MockDb;
  mockDb = installPlatformDoubles()
    .on(/COUNT\(oi.id\) as "orderCount"/i, () => ({
      rows: [{ id: IDS.dishA, name: 'Hyderabadi Dum Biryani', pricePaise: 32000, orderCount: '7' }],
      rowCount: 1,
    }))
    .on(/AND \$1 = ANY\(d.meal_slots\)/i, () => ({
      rows: [{ id: IDS.dishA, name: 'Hyderabadi Dum Biryani', pricePaise: 32000, restaurantName: 'Biryani Bliss' }],
      rowCount: 1,
    }))
    .on(/ST_DWithin\(r.location/i, () => ({
      rows: [{ id: IDS.dishB, name: 'Burani Raita', pricePaise: 6000, distanceMeters: 1200 }],
      rowCount: 1,
    }))
    .on(/FROM dish_pair_associations/i, () => ({
      rows: [{ id: IDS.dishB, name: 'Burani Raita', pricePaise: 6000, pairWeight: '142' }],
      rowCount: 1,
    }))
    .on(/CASE WHEN d.category IN/i, () => ({
      rows: [{ id: IDS.dishB, name: 'Gulab Jamun (Fallback)', pricePaise: 4000, isVeg: true, restaurantId: IDS.restaurant }],
      rowCount: 1,
    }));

  // ---------------- orderItAgain ----------------
  await suite.test('orderItAgain requires authentication', async () => {
    await expectTrpcError(() => callers.anonymous().recommendations.orderItAgain(), 'UNAUTHORIZED');
  });

  await suite.test('orderItAgain reads history once then serves from cache', async () => {
    await redisService.del(`rec:user:${IDS.customer}:again`);
    mockDb.clearLog();
    const first = await callers.customer().recommendations.orderItAgain();
    const second = await callers.customer().recommendations.orderItAgain();
    assert.deepEqual(first, second);
    assert.equal(first.length, 1);
    assert.equal(mockDb.calls(/COUNT\(oi.id\) as "orderCount"/i).length, 1);
  });

  // ---------------- mealTimeCravings ----------------
  await suite.test('mealTimeCravings honours an explicit slot', async () => {
    const result = await callers.anonymous().recommendations.mealTimeCravings({ slot: MealSlot.BREAKFAST, limit: 5 });
    assert.equal(result.activeSlot, MealSlot.BREAKFAST);
    assert.equal(result.dishes.length, 1);
  });

  await suite.test('mealTimeCravings defaults to the current slot', async () => {
    const result = await callers.anonymous().recommendations.mealTimeCravings({});
    assert.equal(result.activeSlot, getCurrentMealSlot());
  });

  await suite.test('mealTimeCravings rejects unknown slots', async () => {
    await expectTrpcError(
      () => callers.anonymous().recommendations.mealTimeCravings({ slot: 'BRUNCH' as any }),
      'BAD_REQUEST'
    );
  });

  await suite.test('mealTimeCravings supports geospatial and dietary parameters with geogrid caching', async () => {
    const latitude = 12.9716;
    const longitude = 77.6408;
    const lat2 = latitude.toFixed(2);
    const lng2 = longitude.toFixed(2);
    const activeSlot = getCurrentMealSlot();
    const cacheKey = `rec:geo:${lat2}_${lng2}:cravings:${activeSlot}:veg`;

    await redisService.del(cacheKey);
    mockDb.clearLog();

    const first = await callers.anonymous().recommendations.mealTimeCravings({
      latitude,
      longitude,
      radiusMeters: 5000,
      isVeg: true,
    });
    const second = await callers.anonymous().recommendations.mealTimeCravings({
      latitude,
      longitude,
      radiusMeters: 5000,
      isVeg: true,
    });

    assert.deepEqual(first, second);
    assert.equal(mockDb.calls(/AND \$1 = ANY\(d.meal_slots\)/i).length, 1);
  });

  // ---------------- trendingNearYou ----------------
  await suite.test('trendingNearYou caches by rounded geogrid', async () => {
    const latitude = 12.9716;
    const longitude = 77.6408;
    await redisService.del(`rec:geo:${latitude.toFixed(2)}_${longitude.toFixed(2)}:${getCurrentMealSlot()}`);
    mockDb.clearLog();
    const first = await callers.anonymous().recommendations.trendingNearYou({ latitude, longitude });
    const second = await callers.anonymous().recommendations.trendingNearYou({ latitude, longitude });
    assert.deepEqual(first, second);
    assert.equal(mockDb.calls(/ST_DWithin\(r.location/i).length, 1);
  });

  await suite.test('trendingNearYou validates the coordinates', async () => {
    await expectTrpcError(
      () => callers.anonymous().recommendations.trendingNearYou({ latitude: 91, longitude: 0 }),
      'BAD_REQUEST'
    );
    await expectTrpcError(
      () => callers.anonymous().recommendations.trendingNearYou({ latitude: 0, longitude: 0, limit: 0 }),
      'BAD_REQUEST'
    );
  });

  // ---------------- frequentlyBoughtTogether ----------------
  await suite.test('frequentlyBoughtTogether returns upsell pairings', async () => {
    const pairings = await callers
      .anonymous()
      .recommendations.frequentlyBoughtTogether({ dishIds: [IDS.dishA] });
    assert.equal(pairings.length, 1);
    assert.equal(pairings[0].id, IDS.dishB);
  });

  await suite.test('frequentlyBoughtTogether supports restaurant isolation and cold-start fallback', async () => {
    const pairings = await callers
      .anonymous()
      .recommendations.frequentlyBoughtTogether({
        dishIds: [IDS.dishA],
        restaurantId: IDS.restaurant,
        limit: 2,
      });
    assert.ok(pairings.length >= 1);
    assert.equal(pairings[0].id, IDS.dishB);
  });

  await suite.test('frequentlyBoughtTogether validates the cart payload', async () => {
    await expectTrpcError(
      () => callers.anonymous().recommendations.frequentlyBoughtTogether({ dishIds: [] }),
      'BAD_REQUEST'
    );
    await expectTrpcError(
      () => callers.anonymous().recommendations.frequentlyBoughtTogether({ dishIds: [crypto.randomUUID(), 'not-a-uuid' as any] }),
      'BAD_REQUEST'
    );
  });
});
