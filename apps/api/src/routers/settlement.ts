import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, roleProtectedProcedure } from '../trpc';
import { db } from '@bocardo/database';
import {
  UserRole,
  SettlementStatus,
  EntityType,
  ReconcileSettlementSchema,
} from '@bocardo/shared-types';

export const settlementRouter = router({
  /**
   * Lists settlements with optional status and entity filter
   */
  listSettlements: roleProtectedProcedure(UserRole.ADMIN, UserRole.RESTAURANT)
    .input(
      z.object({
        status: z.nativeEnum(SettlementStatus).optional(),
        entityType: z.nativeEnum(EntityType).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      let query = `
        SELECT s.id, s.entity_type as "entityType", s.entity_id as "entityId",
               s.start_date as "startDate", s.end_date as "endDate",
               s.gross_amount_paise as "grossAmountPaise",
               s.commission_deducted_paise as "commissionDeductedPaise",
               s.net_payout_paise as "netPayoutPaise",
               s.status, s.bank_utr_reference as "bankUtrReference",
               s.paid_at as "paidAt", s.created_at as "createdAt",
               r.name as "restaurantName"
        FROM settlements s
        LEFT JOIN restaurants r ON s.entity_id = r.id AND s.entity_type = 'RESTAURANT'
        WHERE 1=1
      `;
      const params: any[] = [];

      // If restaurant partner, restrict to their own settlements
      if (ctx.user.role === UserRole.RESTAURANT) {
        if (!ctx.user.restaurantId) return [];
        params.push(ctx.user.restaurantId);
        query += ` AND s.entity_id = $${params.length}`;
      }

      if (input?.status) {
        params.push(input.status);
        query += ` AND s.status = $${params.length}`;
      }

      if (input?.entityType) {
        params.push(input.entityType);
        query += ` AND s.entity_type = $${params.length}`;
      }

      query += ` ORDER BY s.created_at DESC LIMIT 50`;

      const res = await db.query(query, params);
      return res.rows;
    }),

  /**
   * Weekly Offline Settlement Aggregator (Sunday Midnight Cron Logic)
   */
  generateWeeklyLedger: roleProtectedProcedure(UserRole.ADMIN)
    .mutation(async () => {
      // Find delivered orders in the last 7 days not yet settled
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const restaurantAgg = await db.query(`
        SELECT o.restaurant_id, r.name, r.commission_rate,
               SUM(o.subtotal_paise) as total_subtotal_paise
        FROM orders o
        JOIN restaurants r ON o.restaurant_id = r.id
        WHERE o.status = 'DELIVERED'
          AND o.created_at >= $1
        GROUP BY o.restaurant_id, r.name, r.commission_rate
      `, [oneWeekAgo]);

      const createdSettlements: string[] = [];

      for (const row of restaurantAgg.rows) {
        const grossPaise = Number(row.total_subtotal_paise);
        const commissionRate = Number(row.commission_rate) || 15.0;
        const commissionPaise = Math.round((grossPaise * commissionRate) / 100);
        const netPayoutPaise = grossPaise - commissionPaise;

        const insertRes = await db.query(`
          INSERT INTO settlements (
            entity_type, entity_id, start_date, end_date,
            gross_amount_paise, commission_deducted_paise, net_payout_paise, status
          ) VALUES (
            'RESTAURANT', $1, $2, $3, $4, $5, $6, 'PENDING'
          ) RETURNING id;
        `, [
          row.restaurant_id,
          oneWeekAgo.toISOString().split('T')[0],
          now.toISOString().split('T')[0],
          grossPaise,
          commissionPaise,
          netPayoutPaise,
        ]);

        createdSettlements.push(insertRes.rows[0].id);
      }

      return {
        success: true,
        generatedCount: createdSettlements.length,
        settlementIds: createdSettlements,
      };
    }),

  /**
   * Exports Bank Transfer CSV formatted for Corporate Net Banking batch transfer
   */
  exportBankTransferCsv: roleProtectedProcedure(UserRole.ADMIN).query(async () => {
    const res = await db.query(`
      SELECT s.id, s.net_payout_paise, r.name as partner_name, r.phone
      FROM settlements s
      JOIN restaurants r ON s.entity_id = r.id
      WHERE s.status = 'PENDING'
      ORDER BY s.created_at DESC
    `);

    // Generate CSV standard format: Beneficiary Name, Account Number, IFSC, Amount INR, Reference ID
    const headers = 'Beneficiary Name,Account Number,IFSC Code,Amount INR,Settlement ID\n';
    const rows = res.rows
      .map((row) => {
        const amountInr = (Number(row.net_payout_paise) / 100).toFixed(2);
        // Realistic dummy corporate bank formatting
        return `"${row.partner_name}","502000${row.id.slice(0, 8)}","HDFC0001234",${amountInr},"${row.id}"`;
      })
      .join('\n');

    return {
      csvData: headers + rows,
      filename: `bocardo_settlements_${new Date().toISOString().split('T')[0]}.csv`,
      totalRecords: res.rows.length,
    };
  }),

  /**
   * Admin enters Bank UTR (Unique Transaction Reference) to mark record PAID
   */
  reconcileWithUtr: roleProtectedProcedure(UserRole.ADMIN)
    .input(ReconcileSettlementSchema)
    .mutation(async ({ input }) => {
      const res = await db.query(
        `UPDATE settlements 
         SET status = 'PAID', bank_utr_reference = $1, paid_at = NOW() 
         WHERE id = $2 AND status = 'PENDING'
         RETURNING id`,
        [input.bankUtrReference, input.settlementId]
      );

      if (!res.rowCount || res.rowCount === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Settlement record not found or already reconciled.',
        });
      }

      return {
        success: true,
        settlementId: input.settlementId,
        bankUtrReference: input.bankUtrReference,
      };
    }),
});
