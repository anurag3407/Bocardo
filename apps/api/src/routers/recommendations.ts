import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { db, findTrendingDishesNearLocation } from '@bocardo/database';
import { MealSlot } from '@bocardo/shared-types';
import { redisService } from '../services/redis';

/**
 * Determines active Indian meal slot based on current hour:
 * BREAKFAST:  06:00 - 10:59
 * LUNCH:      11:00 - 15:59
 * SNACKS:     16:00 - 18:59
 * DINNER:     19:00 - 22:59
 * LATE_NIGHT: 23:00 - 05:59
 */
export function getCurrentMealSlot(): MealSlot {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) return MealSlot.BREAKFAST;
  if (hour >= 11 && hour < 16) return MealSlot.LUNCH;
  if (hour >= 16 && hour < 19) return MealSlot.SNACKS;
  if (hour >= 19 && hour < 23) return MealSlot.DINNER;
  return MealSlot.LATE_NIGHT;
}

export const recommendationsRouter = router({
  /**
   * 1. "Order It Again" (Personalized)
   * Fetches the user's top ordered items across delivered orders.
   * Cached in Redis (rec:user:<id>:again) with 1-hour TTL.
   * Enforces restaurant availability and captures recency timestamp.
   */
  orderItAgain: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const cacheKey = `rec:user:${userId}:again`;

    const cached = await redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        // Fallback to DB
      }
    }

    const sql = `
      SELECT d.id, d.name, d.price_paise as "pricePaise", d.image_url as "imageUrl",
             d.is_veg as "isVeg", d.restaurant_id as "restaurantId", r.name as "restaurantName",
             COUNT(oi.id) as "orderCount",
             MAX(o.created_at) as "lastOrderedAt"
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN dishes d ON oi.dish_id = d.id
      JOIN restaurants r ON d.restaurant_id = r.id
      WHERE o.customer_id = $1 
        AND o.status = 'DELIVERED'
        AND d.is_available = TRUE
        AND r.is_active = TRUE
        AND r.is_accepting_orders = TRUE
      GROUP BY d.id, r.id
      ORDER BY "orderCount" DESC, "lastOrderedAt" DESC
      LIMIT 8;
    `;

    const res = await db.query(sql, [userId]);
    const items = res.rows;

    await redisService.set(cacheKey, JSON.stringify(items), 'EX', 3600); // 1 hour TTL
    return items;
  }),

  /**
   * 2. "Contextual Meal-Time Cravings" (Dynamic & Geospatial)
   * Automatically calculates current slot (Breakfast/Lunch/Snacks/Dinner/Late Night),
   * applies optional geospatial PostGIS radius and veg-diet filters, and caches by geogrid.
   */
  mealTimeCravings: publicProcedure
    .input(
      z.object({
        slot: z.nativeEnum(MealSlot).optional(),
        limit: z.number().default(10),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        radiusMeters: z.number().positive().default(7000).optional(),
        isVeg: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      const activeSlot = input.slot || getCurrentMealSlot();
      const limit = input.limit;
      const vegKey = input.isVeg === true ? 'veg' : input.isVeg === false ? 'nonveg' : 'all';

      // Cache lookup
      let cacheKey: string;
      if (input.latitude !== undefined && input.longitude !== undefined) {
        const lat2 = input.latitude.toFixed(2);
        const lng2 = input.longitude.toFixed(2);
        cacheKey = `rec:geo:${lat2}_${lng2}:cravings:${activeSlot}:${vegKey}`;
      } else {
        cacheKey = `rec:global:cravings:${activeSlot}:${vegKey}`;
      }

      const cached = await redisService.get(cacheKey);
      if (cached) {
        try {
          return {
            activeSlot,
            dishes: JSON.parse(cached),
          };
        } catch (e) {
          // Fallback to DB
        }
      }

      const params: any[] = [activeSlot];
      let geoFilter = '';
      let distanceCol = '0 as "distanceMeters"';

      if (input.latitude !== undefined && input.longitude !== undefined) {
        params.push(input.longitude, input.latitude, input.radiusMeters || 7000);
        geoFilter = `AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)`;
        distanceCol = `ST_Distance(r.location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS "distanceMeters"`;
      }

      let vegFilter = '';
      if (input.isVeg !== undefined) {
        params.push(input.isVeg);
        vegFilter = `AND d.is_veg = $${params.length}`;
      }

      params.push(limit);
      const limitIndex = params.length;

      const sql = `
        SELECT d.id, d.name, d.description, d.price_paise as "pricePaise",
               d.image_url as "imageUrl", d.is_veg as "isVeg",
               d.restaurant_id as "restaurantId", r.name as "restaurantName",
               d.category,
               ${distanceCol}
        FROM dishes d
        JOIN restaurants r ON d.restaurant_id = r.id
        WHERE d.is_available = TRUE
          AND r.is_active = TRUE
          AND r.is_accepting_orders = TRUE
          AND $1 = ANY(d.meal_slots)
          ${geoFilter}
          ${vegFilter}
        ORDER BY r.rating DESC, d.name ASC
        LIMIT $${limitIndex};
      `;

      const res = await db.query(sql, params);
      const dishes = res.rows;

      await redisService.set(cacheKey, JSON.stringify(dishes), 'EX', 900); // 15 min TTL
      return {
        activeSlot,
        dishes,
      };
    }),

  /**
   * 3. "Trending Dishes Near You" (Hyperlocal)
   * Spatial query using PostGIS ST_DWithin(5km) + Redis geogrid caching (20 min TTL).
   */
  trendingNearYou: publicProcedure
    .input(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        limit: z.number().int().min(1).max(25).default(10),
      })
    )
    .query(async ({ input }) => {
      const activeSlot = getCurrentMealSlot();
      const lat2 = input.latitude.toFixed(2);
      const lng2 = input.longitude.toFixed(2);
      const cacheKey = `rec:geo:${lat2}_${lng2}:${activeSlot}`;

      const cached = await redisService.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (e) {
          // Fallback
        }
      }

      const dishes = await findTrendingDishesNearLocation(
        input.latitude,
        input.longitude,
        5000,
        activeSlot,
        input.limit
      );

      await redisService.set(cacheKey, JSON.stringify(dishes), 'EX', 1200); // 20 min TTL
      return dishes;
    }),

  /**
   * 4. "Frequently Bought Together" (Cart Upsell)
   * Bidirectional co-occurrence pairing with restaurant isolation and intelligent cold-start fallback.
   */
  frequentlyBoughtTogether: publicProcedure
    .input(
      z.object({
        dishIds: z.array(z.string().uuid()).min(1).max(25),
        restaurantId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(10).default(4).optional(),
      })
    )
    .query(async ({ input }) => {
      if (input.dishIds.length === 0) return [];

      const limit = input.limit ?? 4;
      const params: any[] = [input.dishIds];
      let restFilter = '';

      if (input.restaurantId) {
        params.push(input.restaurantId);
        restFilter = `AND d.restaurant_id = $2`;
      }
      params.push(limit);
      const limitIndex = params.length;

      // Bidirectional pair matching: checks (A -> B) OR (B -> A)
      const sql = `
        SELECT d.id, d.name, d.price_paise as "pricePaise", d.image_url as "imageUrl",
               d.is_veg as "isVeg", d.restaurant_id as "restaurantId",
               SUM(dpa.co_occurrence_count) as "pairWeight"
        FROM dish_pair_associations dpa
        JOIN dishes d ON (
          (dpa.dish_id_a = ANY($1::uuid[]) AND dpa.dish_id_b = d.id)
          OR
          (dpa.dish_id_b = ANY($1::uuid[]) AND dpa.dish_id_a = d.id)
        )
        WHERE NOT (d.id = ANY($1::uuid[]))
          AND d.is_available = TRUE
          ${restFilter}
        GROUP BY d.id
        ORDER BY "pairWeight" DESC
        LIMIT $${limitIndex};
      `;

      const res = await db.query(sql, params);
      const pairings = [...res.rows];

      // Cold-start fallback: If pairings don't fill the limit and restaurantId is known
      if (pairings.length < limit && input.restaurantId) {
        const excludedIds = [...input.dishIds, ...pairings.map((p) => p.id)];
        const fallbackCount = limit - pairings.length;

        try {
          const fallbackSql = `
            SELECT d.id, d.name, d.price_paise as "pricePaise", d.image_url as "imageUrl",
                   d.is_veg as "isVeg", d.restaurant_id as "restaurantId",
                   0 as "pairWeight"
            FROM dishes d
            WHERE d.restaurant_id = $1
              AND NOT (d.id = ANY($2::uuid[]))
              AND d.is_available = TRUE
            ORDER BY 
              CASE WHEN d.category IN ('Accompaniments', 'Beverages', 'Desserts', 'Breads', 'Sides') THEN 0 ELSE 1 END,
              d.price_paise ASC
            LIMIT $3;
          `;
          const fallbackRes = await db.query(fallbackSql, [input.restaurantId, excludedIds, fallbackCount]);
          pairings.push(...fallbackRes.rows);
        } catch (e) {
          // Gracefully continue with available pairings
        }
      }

      return pairings;
    }),
});
