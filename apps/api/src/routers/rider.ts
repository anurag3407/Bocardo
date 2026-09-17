import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProtectedProcedure } from '../trpc';
import { db } from '@bocardo/database';
import { UserRole } from '@bocardo/shared-types';
import { sequentialDispatchWorker } from '../workers/sequentialDispatchWorker';

export const riderRouter = router({
  /**
   * Fetches rider status and active delivery
   */
  getProfile: roleProtectedProcedure(UserRole.RIDER, UserRole.ADMIN).query(
    async ({ ctx }) => {
      const res = await db.query(
        `SELECT rp.user_id as "userId", rp.is_online as "isOnline",
                rp.active_order_id as "activeOrderId", rp.vehicle_type as "vehicleType",
                rp.rating::float, u.full_name as "fullName", u.phone
         FROM rider_profiles rp
         JOIN users u ON rp.user_id = u.id
         WHERE rp.user_id = $1`,
        [ctx.user.id]
      );

      if (!res.rowCount || res.rowCount === 0) {
        // Auto-create rider profile if missing
        const insertRes = await db.query(
          `INSERT INTO rider_profiles (user_id, is_online)
           VALUES ($1, FALSE)
           RETURNING user_id as "userId", is_online as "isOnline", rating::float`,
          [ctx.user.id]
        );
        return {
          ...insertRes.rows[0],
          fullName: ctx.user.fullName,
          phone: ctx.user.phone,
          vehicleType: 'MOTORCYCLE',
          activeOrderId: null,
        };
      }

      return res.rows[0];
    }
  ),

  /**
   * Duty toggle (Go Online / Go Offline)
   */
  toggleDuty: roleProtectedProcedure(UserRole.RIDER, UserRole.ADMIN)
    .input(z.object({ isOnline: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db.query(
        `UPDATE rider_profiles 
         SET is_online = $1, updated_at = NOW() 
         WHERE user_id = $2`,
        [input.isOnline, ctx.user.id]
      );

      return { success: true, isOnline: input.isOnline };
    }),

  /**
   * Rider responds to 30-second sequential dispatch offer
   */
  respondToDispatchOffer: roleProtectedProcedure(UserRole.RIDER, UserRole.ADMIN)
    .input(
      z.object({
        orderId: z.string().uuid(),
        accepted: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await sequentialDispatchWorker.handleRiderResponse(
        input.orderId,
        ctx.user.id,
        input.accepted
      );

      return { success: true };
    }),
});
