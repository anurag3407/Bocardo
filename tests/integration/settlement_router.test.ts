import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EntityType, SettlementStatus } from '../../packages/shared-types/src';
import { installPlatformDoubles, MockDb } from '../harness/db';
import { callers, IDS } from '../harness/trpc';
import { expectTrpcError, Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Settlement Router');

const SETTLEMENT_ROW = {
  id: IDS.settlement,
  entityType: EntityType.RESTAURANT,
  entityId: IDS.restaurant,
  startDate: '2026-09-10',
  endDate: '2026-09-17',
  grossAmountPaise: 4200000,
  commissionDeductedPaise: 630000,
  netPayoutPaise: 3570000,
  status: SettlementStatus.PENDING,
  bankUtrReference: null,
  createdAt: '2026-09-18',
};

runSuite(suite, async () => {
  let reconcileRowCount = 1;

  let mockDb: MockDb;
  mockDb = installPlatformDoubles()
    .on(/SUM\(o.subtotal_paise\) as total_subtotal_paise/i, () => ({
      rows: [
        { restaurant_id: IDS.restaurant, name: 'Biryani Bliss', commission_rate: '15.00', total_subtotal_paise: '4200000' },
        { restaurant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'South Kitchen', commission_rate: '12.50', total_subtotal_paise: '2800000' },
      ],
      rowCount: 2,
    }))
    .on(/INSERT INTO settlements/i, () => ({ rows: [{ id: crypto.randomUUID() }], rowCount: 1 }))
    .on(/SELECT s.id, s.net_payout_paise, r.name as partner_name/i, () => ({
      rows: [{ id: IDS.settlement, net_payout_paise: '3570000', partner_name: 'Biryani Bliss', phone: '+91' }],
      rowCount: 1,
    }))
    .on(/UPDATE settlements\s+SET status = 'PAID'/i, () => ({
      rows: reconcileRowCount ? [{ id: IDS.settlement }] : [],
      rowCount: reconcileRowCount,
    }))
    .on(/FROM settlements s\s+LEFT JOIN restaurants r/i, (params) => ({
      rows: [{ ...SETTLEMENT_ROW, restaurantName: 'Biryani Bliss', __params: params }],
      rowCount: 1,
    }));

  await suite.test('admin lists settlements', async () => {
    const settlements = await callers.admin().settlement.listSettlements({});
    assert.equal(settlements.length, 1);
    assert.equal(settlements[0].id, IDS.settlement);
  });

  await suite.test('restaurant partners are scoped to their own settlements', async () => {
    mockDb.clearLog();
    await callers.restaurant().settlement.listSettlements({});
    const query = mockDb.calls(/FROM settlements s\s+LEFT JOIN restaurants r/i)[0];
    assert.equal(query.params[0], IDS.restaurant);
  });

  await suite.test('restaurant partners without a restaurant get an empty ledger', async () => {
    const settlements = await callers.restaurant({ restaurantId: null }).settlement.listSettlements({});
    assert.deepEqual(settlements, []);
  });

  await suite.test('status and entity filters are applied', async () => {
    mockDb.clearLog();
    await callers.admin().settlement.listSettlements({ status: SettlementStatus.PENDING, entityType: EntityType.RIDER });
    const query = mockDb.calls(/FROM settlements s\s+LEFT JOIN restaurants r/i)[0];
    assert.deepEqual(query.params, [SettlementStatus.PENDING, EntityType.RIDER]);
  });

  await suite.test('customers cannot read the ledger', async () => {
    await expectTrpcError(() => callers.customer().settlement.listSettlements({}), 'FORBIDDEN');
  });

  await suite.test('weekly ledger aggregation computes commission and net payout', async () => {
    mockDb.clearLog();
    const result = await callers.admin().settlement.generateWeeklyLedger();
    assert.equal(result.success, true);
    assert.equal(result.generatedCount, 2);
    assert.equal(result.settlementIds.length, 2);

    const inserts = mockDb.calls(/INSERT INTO settlements/i);
    assert.equal(inserts.length, 2);
    // 15% of ₹42,000 = ₹6,300 commission, net ₹35,700
    assert.deepEqual(inserts[0].params.slice(3, 6), [4200000, 630000, 3570000]);
    // Statutory deductions: 18% Commission GST (₹1,134), 1% TDS (₹420), 1% TCS (₹420), packaging (₹0)
    assert.deepEqual(inserts[0].params.slice(6), [113400, 42000, 42000, 0]);
    // 12.5% of ₹28,000 = ₹3,500 commission, net ₹24,500
    assert.deepEqual(inserts[1].params.slice(3, 6), [2800000, 350000, 2450000]);
    // Statutory deductions: 18% Commission GST (₹630), 1% TDS (₹280), 1% TCS (₹280), packaging (₹0)
    assert.deepEqual(inserts[1].params.slice(6), [63000, 28000, 28000, 0]);
  });

  await suite.test('weekly ledger is admin-only', async () => {
    await expectTrpcError(() => callers.restaurant().settlement.generateWeeklyLedger(), 'FORBIDDEN');
    await expectTrpcError(() => callers.customer().settlement.generateWeeklyLedger(), 'FORBIDDEN');
  });

  await suite.test('bank transfer CSV is formatted for corporate net banking', async () => {
    const exportResult = await callers.admin().settlement.exportBankTransferCsv();
    assert.match(exportResult.filename, /^bocardo_settlements_\d{4}-\d{2}-\d{2}\.csv$/);
    assert.equal(exportResult.totalRecords, 1);
    assert.match(exportResult.csvData, /^Beneficiary Name,Account Number,IFSC Code,Amount INR,Settlement ID\n/);
    assert.match(exportResult.csvData, /"Biryani Bliss","50200088888888","HDFC0001234",35700\.00,"88888888-8888-4888-8888-888888888888"/);
  });

  await suite.test('bank transfer CSV is admin-only', async () => {
    await expectTrpcError(() => callers.restaurant().settlement.exportBankTransferCsv(), 'FORBIDDEN');
  });

  await suite.test('admin reconciles a payout with a bank UTR', async () => {
    reconcileRowCount = 1;
    const result = await callers
      .admin()
      .settlement.reconcileWithUtr({ settlementId: IDS.settlement, bankUtrReference: 'HDFCN2628192019' });
    assert.deepEqual(result, {
      success: true,
      settlementId: IDS.settlement,
      bankUtrReference: 'HDFCN2628192019',
    });
  });

  await suite.test('unknown or already-reconciled settlements are not found', async () => {
    reconcileRowCount = 0;
    await expectTrpcError(
      () => callers.admin().settlement.reconcileWithUtr({ settlementId: IDS.settlement, bankUtrReference: 'HDFCN2628192019' }),
      'NOT_FOUND'
    );
    reconcileRowCount = 1;
  });

  await suite.test('reconciliation validates the UTR and admin role', async () => {
    await expectTrpcError(
      () => callers.admin().settlement.reconcileWithUtr({ settlementId: IDS.settlement, bankUtrReference: 'SHORT' }),
      'BAD_REQUEST'
    );
    await expectTrpcError(
      () => callers.restaurant().settlement.reconcileWithUtr({ settlementId: IDS.settlement, bankUtrReference: 'HDFCN2628192019' }),
      'FORBIDDEN'
    );
  });
});
