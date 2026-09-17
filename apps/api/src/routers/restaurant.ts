import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure, roleProtectedProcedure } from '../trpc';
import { db, findRestaurantsWithinRadius } from '@bocardo/database';
import { UserRole } from '@bocardo/shared-types';

export const restaurantRouter = router({
  listNearby: publicProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
        radiusMeters: z.number().default(7000),
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
