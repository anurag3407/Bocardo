import { db } from './client';

export interface NearestRiderResult {
  id: string;
  fullName: string;
  phone: string;
  vehicleType: string;
  distanceMeters: number;
}

export interface NearbyRestaurantResult {
  id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  rating: number;
  cuisine: string[];
  imageUrl?: string;
  distanceMeters: number;
  isAcceptingOrders: boolean;
  latitude: number;
  longitude: number;
}

export interface TrendingDishResult {
  id: string;
  name: string;
  description?: string;
  pricePaise: number;
  imageUrl?: string;
  isVeg: boolean;
  restaurantId: string;
  restaurantName: string;
  category: string;
  distanceMeters: number;
}

/**
 * Sequential 1-to-1 Rider Dispatch Query:
 * Selects the single nearest available online rider within radius (default 4km)
 * excluding any riders who already rejected this order.
 */
export async function findNearestOnlineRider(
  latitude: number,
  longitude: number,
  rejectedRiderIds: string[] = [],
  maxDistanceMeters: number = 4000
): Promise<NearestRiderResult | null> {
  const sql = `
    SELECT u.id,
           u.full_name as "fullName",
           u.phone,
           rp.vehicle_type as "vehicleType",
           ST_Distance(rp.last_location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS "distanceMeters"
    FROM users u
    JOIN rider_profiles rp ON u.id = rp.user_id
    WHERE u.role = 'RIDER' 
      AND rp.is_online = TRUE 
      AND rp.active_order_id IS NULL
      AND u.is_suspended = FALSE
      AND rp.updated_at > NOW() - INTERVAL '60 seconds'
      AND NOT (u.id = ANY($3::uuid[]))
      AND ST_DWithin(rp.last_location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $4)
    ORDER BY "distanceMeters" ASC
    LIMIT 1;
  `;

  const res = await db.query<NearestRiderResult>(sql, [
    longitude,
    latitude,
    rejectedRiderIds,
    maxDistanceMeters,
  ]);

  return res.rows[0] || null;
}

/**
 * Hyperlocal Nearby Restaurant Discovery:
 * Finds active restaurants within radius (default 7km) ordered by proximity.
 */
export async function findRestaurantsWithinRadius(
  latitude: number,
  longitude: number,
  radiusMeters: number = 7000,
  limit: number = 20
): Promise<NearbyRestaurantResult[]> {
  const sql = `
    SELECT r.id,
           r.name,
           r.slug,
           r.address,
           r.phone,
           r.rating::float,
           r.cuisine,
           r.image_url as "imageUrl",
           r.is_accepting_orders as "isAcceptingOrders",
           ST_Y(r.location::geometry) as latitude,
           ST_X(r.location::geometry) as longitude,
           ST_Distance(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS "distanceMeters"
    FROM restaurants r
    WHERE r.is_active = TRUE
      AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
    ORDER BY "distanceMeters" ASC
    LIMIT $4;
  `;

  const res = await db.query<NearbyRestaurantResult>(sql, [
    longitude,
    latitude,
    radiusMeters,
    limit,
  ]);

  return res.rows;
}

/**
 * Hyperlocal Trending Dishes Near Customer:
 * Finds popular dishes in restaurants within 5km, optionally filtered by current meal slot.
 */
export async function findTrendingDishesNearLocation(
  latitude: number,
  longitude: number,
  radiusMeters: number = 5000,
  mealSlot?: string,
  limit: number = 10
): Promise<TrendingDishResult[]> {
  const params: any[] = [longitude, latitude, radiusMeters];
  let slotFilter = '';

  if (mealSlot) {
    params.push(mealSlot);
    slotFilter = `AND $4 = ANY(d.meal_slots)`;
  }
  params.push(limit);
  const limitParamIndex = params.length;

  const sql = `
    SELECT d.id,
           d.name,
           d.description,
           d.price_paise as "pricePaise",
           d.image_url as "imageUrl",
           d.is_veg as "isVeg",
           d.restaurant_id as "restaurantId",
           r.name as "restaurantName",
           d.category,
           ST_Distance(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS "distanceMeters"
    FROM dishes d
    JOIN restaurants r ON d.restaurant_id = r.id
    WHERE d.is_available = TRUE
      AND r.is_active = TRUE
      AND r.is_accepting_orders = TRUE
      AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
      ${slotFilter}
    ORDER BY "distanceMeters" ASC
    LIMIT $${limitParamIndex};
  `;

  const res = await db.query<TrendingDishResult>(sql, params);
  return res.rows;
}
