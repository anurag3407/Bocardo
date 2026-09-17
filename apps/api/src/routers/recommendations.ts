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
             COUNT(oi.id) as "orderCount"
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN dishes d ON oi.dish_id = d.id
      JOIN restaurants r ON d.restaurant_id = r.id
      WHERE o.customer_id = $1 
        AND o.status = 'DELIVERED'
        AND d.is_available = TRUE
      GROUP BY d.id, r.id
      ORDER BY "orderCount" DESC
      LIMIT 8;
    `;

    const res = await db.query(sql, [userId]);
    const items = res.rows;

    await redisService.set(cacheKey, JSON.stringify(items), 'EX', 3600); // 1 hour TTL
    return items;
  }),

  /**
   * 2. "Contextual Meal-Time Cravings" (Dynamic)
   * Automatically calculates current slot (Breakfast/Lunch/Snacks/Dinner/Late Night)
   * and returns dishes specifically available for this slot.
   */
  mealTimeCravings: publicProcedure
    .input(
      z.object({
        slot: z.nativeEnum(MealSlot).optional(),
        limit: z.number().default(10),
      })
    )
    .query(async ({ input }) => {
      const activeSlot = input.slot || getCurrentMealSlot();

      const sql = `
        SELECT d.id, d.name, d.description, d.price_paise as "pricePaise",
               d.image_url as "imageUrl", d.is_veg as "isVeg",
               d.restaurant_id as "restaurantId", r.name as "restaurantName",
               d.category
        FROM dishes d
        JOIN restaurants r ON d.restaurant_id = r.id
        WHERE d.is_available = TRUE
          AND r.is_active = TRUE
          AND r.is_accepting_orders = TRUE
          AND $1 = ANY(d.meal_slots)
        ORDER BY r.rating DESC, d.name ASC
        LIMIT $2;
      `;

      const res = await db.query(sql, [activeSlot, input.limit]);
      return {
        activeSlot,
        dishes: res.rows,
      };
    }),

  /**
   * 3. "Trending Dishes Near You" (Hyperlocal)
   * Spatial query using PostGIS ST_DWithin(5km) + Redis geogrid caching (20 min TTL).
   */
  trendingNearYou: publicProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
        limit: z.number().default(10),
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
   * Queries co-occurrence matrix (dish_pair_associations) to suggest pairings.
   */
  frequentlyBoughtTogether: publicProcedure
    .input(z.object({ dishIds: z.array(z.string().uuid()) }))
    .query(async ({ input }) => {
      if (input.dishIds.length === 0) return [];

      const sql = `
        SELECT d.id, d.name, d.price_paise as "pricePaise", d.image_url as "imageUrl",
               d.is_veg as "isVeg", d.restaurant_id as "restaurantId",
               SUM(dpa.co_occurrence_count) as "pairWeight"
        FROM dish_pair_associations dpa
        JOIN dishes d ON (dpa.dish_id_b = d.id)
        WHERE dpa.dish_id_a = ANY($1::uuid[])
          AND NOT (d.id = ANY($1::uuid[]))
          AND d.is_available = TRUE
        GROUP BY d.id
        ORDER BY "pairWeight" DESC
        LIMIT 4;
      `;

      const res = await db.query(sql, [input.dishIds]);
      return res.rows;
    }),
});
