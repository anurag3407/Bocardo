import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { installPlatformDoubles } from '../harness/db';
import { callers, IDS } from '../harness/trpc';
import { expectTrpcError, Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Restaurant Router');

const RESTAURANT_ROW = {
  id: IDS.restaurant,
  name: 'Biryani Bliss & Kebabs',
  slug: 'biryani-bliss-indiranagar',
  address: '100 Feet Rd, Indiranagar',
  phone: '+918041234567',
  rating: 4.6,
  cuisine: ['Biryani', 'Mughlai'],
  imageUrl: 'https://images.example.com/biryani.jpg',
  isActive: true,
  isAcceptingOrders: true,
  latitude: 12.9719,
  longitude: 77.6412,
  distanceMeters: 120,
};

runSuite(suite, async () => {
  let restaurantById: any = RESTAURANT_ROW;
  let dishOwnerRestaurantId: string = IDS.restaurant;

  installPlatformDoubles()
    .on(/CASE\s+WHEN r.name ILIKE/i, () => ({
      rows: [{ dishId: IDS.dishA, dishName: 'Hyderabadi Dum Biryani', pricePaise: 32000, restaurantId: IDS.restaurant, restaurantName: 'Biryani Bliss', rank: 1 }],
      rowCount: 1,
    }))
    .on(/FROM restaurants r\s+WHERE r.is_active/i, (params) => ({
      rows: [{ ...RESTAURANT_ROW, distanceMeters: params[0] === undefined ? 0 : 120 }],
      rowCount: 1,
    }))
    .on(/FROM restaurants WHERE id = \$1/i, () =>
      restaurantById ? { rows: [restaurantById], rowCount: 1 } : { rows: [], rowCount: 0 }
    )
    .on(/FROM dishes\s+WHERE restaurant_id = \$1/i, () => ({
      rows: [{ id: IDS.dishA, restaurantId: IDS.restaurant, name: 'Biryani', pricePaise: 32000, isVeg: false, isAvailable: true }],
      rowCount: 1,
    }))
    .on(/SELECT restaurant_id FROM dishes WHERE id = \$1/i, () => ({
      rows: [{ restaurant_id: dishOwnerRestaurantId }],
      rowCount: 1,
    }))
    .on(/UPDATE restaurants SET is_accepting_orders/i, () => ({ rows: [], rowCount: 1 }))
    .on(/UPDATE dishes SET is_available/i, () => ({ rows: [], rowCount: 1 }));

  await suite.test('listNearby returns nearby restaurants', async () => {
    const restaurants = await callers.anonymous().restaurant.listNearby({ latitude: 12.9716, longitude: 77.6408 });
    assert.equal(restaurants.length, 1);
    assert.equal(restaurants[0].name, 'Biryani Bliss & Kebabs');
  });

  await suite.test('listNearby validates coordinates and radius', async () => {
    await expectTrpcError(
      () => callers.anonymous().restaurant.listNearby({ latitude: 91, longitude: 0 }),
      'BAD_REQUEST'
    );
    await expectTrpcError(
      () => callers.anonymous().restaurant.listNearby({ latitude: 0, longitude: 181 }),
      'BAD_REQUEST'
    );
    await expectTrpcError(
      () => callers.anonymous().restaurant.listNearby({ latitude: 0, longitude: 0, radiusMeters: 100 }),
      'BAD_REQUEST'
    );
  });

  await suite.test('getById returns the restaurant with its menu', async () => {
    restaurantById = RESTAURANT_ROW;
    const restaurant = await callers.anonymous().restaurant.getById({ restaurantId: IDS.restaurant });
    assert.equal(restaurant.id, IDS.restaurant);
    assert.equal(restaurant.dishes.length, 1);
  });

  await suite.test('getById reports missing restaurants', async () => {
    restaurantById = null;
    await expectTrpcError(
      () => callers.anonymous().restaurant.getById({ restaurantId: IDS.restaurant }),
      'NOT_FOUND'
    );
    restaurantById = RESTAURANT_ROW;
  });

  await suite.test('getById rejects malformed ids', async () => {
    await expectTrpcError(
      () => callers.anonymous().restaurant.getById({ restaurantId: 'not-a-uuid' as any }),
      'BAD_REQUEST'
    );
  });

  await suite.test('search validates the query string and returns ranked matches', async () => {
    const results = await callers.anonymous().restaurant.search({ query: 'biryani' });
    assert.equal(results.length, 1);
    await expectTrpcError(() => callers.anonymous().restaurant.search({ query: 'a' }), 'BAD_REQUEST');
  });

  await suite.test('kitchen toggles its own accepting-orders flag', async () => {
    const result = await callers.restaurant().restaurant.toggleAcceptingOrders({
      restaurantId: IDS.restaurant,
      isAcceptingOrders: false,
    });
    assert.equal(result.success, true);
    assert.equal(result.isAcceptingOrders, false);
  });

  await suite.test('kitchen cannot toggle another restaurant', async () => {
    await expectTrpcError(
      () =>
        callers.restaurant().restaurant.toggleAcceptingOrders({
          restaurantId: crypto.randomUUID(),
          isAcceptingOrders: true,
        }),
      'FORBIDDEN'
    );
  });

  await suite.test('admin and customer role gates for kitchen controls', async () => {
    const adminResult = await callers.admin().restaurant.toggleAcceptingOrders({
      restaurantId: IDS.restaurant,
      isAcceptingOrders: true,
    });
    assert.equal(adminResult.success, true);
    await expectTrpcError(
      () => callers.customer().restaurant.toggleAcceptingOrders({ restaurantId: IDS.restaurant, isAcceptingOrders: false }),
      'FORBIDDEN'
    );
  });

  await suite.test('kitchen 86-es its own dishes', async () => {
    dishOwnerRestaurantId = IDS.restaurant;
    const result = await callers.restaurant().restaurant.toggleDishAvailability({
      dishId: IDS.dishA,
      isAvailable: false,
    });
    assert.equal(result.success, true);
    assert.equal(result.isAvailable, false);
  });

  await suite.test('kitchen cannot 86 another restaurant dish', async () => {
    dishOwnerRestaurantId = crypto.randomUUID();
    await expectTrpcError(
      () =>
        callers.restaurant().restaurant.toggleDishAvailability({ dishId: IDS.dishA, isAvailable: false }),
      'FORBIDDEN'
    );
    dishOwnerRestaurantId = IDS.restaurant;
  });
});
