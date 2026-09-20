import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { OrderStatus } from '../../packages/shared-types/src';
import { redisService } from '../../apps/api/src/services/redis';
import { DISPATCH_NEXT_JOB } from '../../apps/api/src/services/queue';
import { sequentialDispatchWorker } from '../../apps/api/src/workers/sequentialDispatchWorker';
import { enqueuedJobs, installPlatformDoubles, MockDb } from '../harness/db';
import { callers, IDS } from '../harness/trpc';
import { expectTrpcError, Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Rider Router & Sequential Dispatch');

const stateKey = (orderId: string) => `dispatch:state:${orderId}`;

runSuite(suite, async () => {
  let profileRow: any = null;
  let assignmentRowCount = 1;

  let mockDb: MockDb;
  mockDb = installPlatformDoubles()
    .on(/FROM rider_profiles rp\s+JOIN users u/i, (params) => {
      if (params[0] !== IDS.rider) {
        return {
          rows: [{ userId: params[0], isOnline: false, activeOrderId: null, vehicleType: 'MOTORCYCLE', rating: 5, fullName: 'Admin', phone: '+91' }],
          rowCount: 1,
        };
      }
      return profileRow ? { rows: [profileRow], rowCount: 1 } : { rows: [], rowCount: 0 };
    })
    .on(/INSERT INTO rider_profiles \(user_id, is_online\)/i, () => ({
      rows: [{ userId: IDS.rider, isOnline: false, rating: 5 }],
      rowCount: 1,
    }))
    .on(/UPDATE rider_profiles\s+SET is_online/i, () => ({ rows: [], rowCount: 1 }))
    .on(/UPDATE orders\s+SET rider_id = \$1, status = \$2/i, () => ({
      rows: assignmentRowCount ? [{ id: IDS.order }] : [],
      rowCount: assignmentRowCount,
    }))
    .on(/UPDATE rider_profiles SET active_order_id = \$1/i, () => ({ rows: [], rowCount: 1 }));

  // ---------------- rider.getProfile ----------------
  await suite.test('getProfile returns the rider record', async () => {
    profileRow = {
      userId: IDS.rider,
      isOnline: true,
      activeOrderId: null,
      vehicleType: 'MOTORCYCLE',
      rating: 4.9,
      fullName: 'Test Rider',
      phone: '+919876500003',
    };
    const profile = await callers.rider().rider.getProfile();
    assert.equal(profile.userId, IDS.rider);
    assert.equal(profile.isOnline, true);
  });

  await suite.test('getProfile auto-creates a missing rider profile', async () => {
    profileRow = null;
    const profile = await callers.rider().rider.getProfile();
    assert.equal(profile.userId, IDS.rider);
    assert.equal(profile.isOnline, false);
    assert.equal(profile.vehicleType, 'MOTORCYCLE');
  });

  await suite.test('getProfile is rider/admin only', async () => {
    await expectTrpcError(() => callers.customer().rider.getProfile(), 'FORBIDDEN');
    const adminProfile = await callers.admin().rider.getProfile();
    assert.equal(adminProfile.userId, IDS.admin);
  });

  // ---------------- rider.toggleDuty ----------------
  await suite.test('toggleDuty flips the online flag', async () => {
    profileRow = { userId: IDS.rider, isOnline: true, activeOrderId: null, vehicleType: 'MOTORCYCLE', rating: 4.9, fullName: 'Test Rider', phone: '+91' };
    const online = await callers.rider().rider.toggleDuty({ isOnline: false });
    assert.deepEqual(online, { success: true, isOnline: false });
    const offline = await callers.rider().rider.toggleDuty({ isOnline: true });
    assert.deepEqual(offline, { success: true, isOnline: true });
  });

  await suite.test('toggleDuty is rider/admin only', async () => {
    await expectTrpcError(() => callers.customer().rider.toggleDuty({ isOnline: true }), 'FORBIDDEN');
    await expectTrpcError(() => callers.anonymous().rider.toggleDuty({ isOnline: true }), 'UNAUTHORIZED');
  });

  // ---------------- sequential dispatch ----------------
  await suite.test('responses from non-candidates are ignored', async () => {
    mockDb.clearLog();
    await redisService.del(stateKey(IDS.order));
    await sequentialDispatchWorker.handleRiderResponse(IDS.order, IDS.rider, true);
    assert.equal(mockDb.calls(/UPDATE orders\s+SET rider_id/i).length, 0);
  });

  await suite.test('a different rider cannot steal the offer', async () => {
    await redisService.set(
      stateKey(IDS.order),
      JSON.stringify({ rejectedRiderIds: [], currentCandidateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', attempt: 1 }),
      'EX',
      300
    );
    mockDb.clearLog();
    await sequentialDispatchWorker.handleRiderResponse(IDS.order, IDS.rider, true);
    assert.equal(mockDb.calls(/UPDATE orders\s+SET rider_id/i).length, 0);
    await redisService.del(stateKey(IDS.order));
  });

  await suite.test('accepting the offer atomically assigns the rider', async () => {
    await redisService.set(
      stateKey(IDS.order),
      JSON.stringify({ rejectedRiderIds: [], currentCandidateId: IDS.rider, attempt: 1 }),
      'EX',
      300
    );
    assignmentRowCount = 1;
    mockDb.clearLog();
    await callers.rider().rider.respondToDispatchOffer({ orderId: IDS.order, accepted: true });

    const assignment = mockDb.calls(/UPDATE orders\s+SET rider_id = \$1, status = \$2/i)[0];
    assert.deepEqual(assignment.params, [IDS.rider, OrderStatus.RIDER_ASSIGNED, IDS.order]);
    assert.equal(mockDb.calls(/UPDATE rider_profiles SET active_order_id = \$1/i).length, 1);
    assert.equal(await redisService.get(stateKey(IDS.order)), null);
  });

  await suite.test('losing an assignment race clears dispatch state safely', async () => {
    await redisService.set(
      stateKey(IDS.order),
      JSON.stringify({ rejectedRiderIds: [], currentCandidateId: IDS.rider, attempt: 1 }),
      'EX',
      300
    );
    assignmentRowCount = 0;
    mockDb.clearLog();
    await callers.rider().rider.respondToDispatchOffer({ orderId: IDS.order, accepted: true });
    assert.equal(mockDb.calls(/UPDATE rider_profiles SET active_order_id = \$1/i).length, 0);
    assert.equal(await redisService.get(stateKey(IDS.order)), null);
    assignmentRowCount = 1;
  });

  await suite.test('declining the offer cascades to the next rider', async () => {
    await redisService.set(
      stateKey(IDS.order),
      JSON.stringify({ rejectedRiderIds: [], currentCandidateId: IDS.rider, attempt: 1 }),
      'EX',
      300
    );
    enqueuedJobs.length = 0;
    await callers.rider().rider.respondToDispatchOffer({ orderId: IDS.order, accepted: false });

    const state = JSON.parse((await redisService.get(stateKey(IDS.order)))!);
    assert.deepEqual(state.rejectedRiderIds, [IDS.rider]);
    assert.equal(state.currentCandidateId, null);
    assert.ok(enqueuedJobs.some((job) => job.name === DISPATCH_NEXT_JOB));
  });

  await suite.test('dispatchNextRider enqueues a durable dispatch job', async () => {
    enqueuedJobs.length = 0;
    await sequentialDispatchWorker.dispatchNextRider(IDS.order);
    assert.ok(enqueuedJobs.some((job) => job.name === DISPATCH_NEXT_JOB && job.data.orderId === IDS.order));
  });

  await suite.test('respondToDispatchOffer rejects malformed payloads', async () => {
    await expectTrpcError(
      () => callers.rider().rider.respondToDispatchOffer({ orderId: crypto.randomUUID(), accepted: 'yes' as any }),
      'BAD_REQUEST'
    );
    await expectTrpcError(
      () => callers.customer().rider.respondToDispatchOffer({ orderId: IDS.order, accepted: true }),
      'FORBIDDEN'
    );
  });
});
