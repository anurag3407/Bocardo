import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, roleProtectedProcedure } from '../trpc';
import { db, findRestaurantsWithinRadius } from '@bocardo/database';
import { UserRole } from '@bocardo/shared-types';

export const restaurantRouter = router({
  listNearby: publicProcedure
    .input(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: z.number().int().min(500).max(15000).default(7000),
      })
    )
    .query(async ({ input }) => {
      return await findRestaurantsWithinRadius(
        input.latitude,
        input.longitude,
        input.radiusMeters
      );
    }),

  getById: publicProcedure
    .input(z.object({ restaurantId: z.string().uuid() }))
    .query(async ({ input }) => {
      const restRes = await db.query(
        `SELECT id, name, slug, address, phone, rating::float, cuisine, image_url as "imageUrl",
                is_active as "isActive", is_accepting_orders as "isAcceptingOrders",
                ST_Y(location::geometry) as latitude, ST_X(location::geometry) as longitude
         FROM restaurants WHERE id = $1`,
        [input.restaurantId]
      );

      if (!restRes.rowCount || restRes.rowCount === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Restaurant not found' });
      }

      const restaurant = restRes.rows[0];

      // Fetch active menu items
      const dishesRes = await db.query(
        `SELECT id, restaurant_id as "restaurantId", name, description,
                price_paise as "pricePaise", image_url as "imageUrl",
                is_veg as "isVeg", is_available as "isAvailable",
                meal_slots as "mealSlots", preparation_time_minutes as "preparationTimeMinutes",
                category
         FROM dishes 
         WHERE restaurant_id = $1 
         ORDER BY category ASC, is_veg DESC, name ASC`,
        [input.restaurantId]
      );

      return {
        ...restaurant,
        dishes: dishesRes.rows,
      };
    }),

  /**
   * Full-text dish & restaurant search (Swiggy-style discovery).
   * Ranked: exact restaurant match > dish name match > cuisine match.
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().trim().min(2).max(80),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        limit: z.number().int().min(1).max(30).default(15),
      })
    )
    .query(async ({ input }) => {
      const pattern = `%${input.query.replace(/[%_\\]/g, '')}%`;

      const params: any[] = [pattern, input.limit];
      let geoSelect = 'NULL::float as "distanceMeters"';
      let geoFilter = '';
      if (input.latitude !== undefined && input.longitude !== undefined) {
        params.push(input.longitude, input.latitude);
        geoSelect = `ST_Distance(r.location, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography)::float as "distanceMeters"`;
        geoFilter = `AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 10000)`;
      }

      const sql = `
        SELECT d.id as "dishId", d.name as "dishName", d.price_paise as "pricePaise",
               d.image_url as "imageUrl", d.is_veg as "isVeg",
               r.id as "restaurantId", r.name as "restaurantName", r.rating::float,
               ${geoSelect},
               CASE
                 WHEN r.name ILIKE $1 THEN 0
                 WHEN d.name ILIKE $1 THEN 1
                 ELSE 2
               END as rank
        FROM dishes d
        JOIN restaurants r ON d.restaurant_id = r.id
        WHERE d.is_available = TRUE
          AND r.is_active = TRUE
          AND r.is_accepting_orders = TRUE
          AND (d.name ILIKE $1 OR r.name ILIKE $1 OR EXISTS (
            SELECT 1 FROM unnest(r.cuisine) c WHERE c ILIKE $1
          ))
          ${geoFilter}
        ORDER BY rank ASC, r.rating DESC
        LIMIT $2
      `;

      const res = await db.query(sql, params);
      return res.rows;
    }),


  /**
   * Kitchen Partner switches online/offline status
   */
  toggleAcceptingOrders: roleProtectedProcedure(UserRole.RESTAURANT, UserRole.ADMIN)
    .input(
      z.object({
        restaurantId: z.string().uuid(),
        isAcceptingOrders: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // BOLA check
      if (ctx.user.role === UserRole.RESTAURANT && ctx.user.restaurantId !== input.restaurantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not manage this restaurant' });
      }

      await db.query(
        'UPDATE restaurants SET is_accepting_orders = $1, updated_at = NOW() WHERE id = $2',
        [input.isAcceptingOrders, input.restaurantId]
      );

      return { success: true, isAcceptingOrders: input.isAcceptingOrders };
    }),

  /**
   * Kitchen Partner 86-es an item (instant toggle out-of-stock)
   */
  toggleDishAvailability: roleProtectedProcedure(UserRole.RESTAURANT, UserRole.ADMIN)
    .input(
      z.object({
        dishId: z.string().uuid(),
        isAvailable: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dishRes = await db.query(
        'SELECT restaurant_id FROM dishes WHERE id = $1',
        [input.dishId]
      );

      if (!dishRes.rowCount || dishRes.rowCount === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dish not found' });
      }

      if (
        ctx.user.role === UserRole.RESTAURANT &&
        ctx.user.restaurantId !== dishRes.rows[0].restaurant_id
      ) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not own this dish' });
      }

      await db.query(
        'UPDATE dishes SET is_available = $1, updated_at = NOW() WHERE id = $2',
        [input.isAvailable, input.dishId]
      );

      return { success: true, isAvailable: input.isAvailable };
    }),
});
