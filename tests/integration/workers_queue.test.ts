import assert from 'node:assert/strict';
import {
  GHOST_CHECK_JOB,
  DISPATCH_NEXT_JOB,
  scheduleDispatchNext,
  scheduleGhostRestaurantCheck,
} from '../../apps/api/src/services/queue';
import { ghostRestaurantWorker } from '../../apps/api/src/workers/ghostRestaurantWorker';
import { startOutboxWorker } from '../../apps/api/src/workers/outboxWorker';
import { socketService } from '../../apps/api/src/services/socket';
import { enqueuedJobs, installPlatformDoubles, MockDb } from '../harness/db';
import { IDS } from '../harness/trpc';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · Durable Workers & Queues');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

runSuite(suite, async () => {
  let mockDb: MockDb;
  mockDb = installPlatformDoubles()
    .on(/SELECT \* FROM realtime_outbox/i, () => ({
      rows: [
        { id: 1, room: `restaurant:${IDS.restaurant}`, event: 'restaurant:new_order', payload: JSON.stringify({ orderId: IDS.order }) },
        { id: 2, room: `order_tracking:${IDS.order}`, event: 'order:status:update', payload: JSON.stringify({ status: 'PAID' }) },
      ],
      rowCount: 2,
    }))
    .on(/DELETE FROM realtime_outbox/i, () => ({ rows: [], rowCount: 1 }));

  await suite.test('the ghost restaurant check is scheduled with a 120s delay', async () => {
    enqueuedJobs.length = 0;
    await scheduleGhostRestaurantCheck(IDS.order);
    const job = enqueuedJobs.find((entry) => entry.name === GHOST_CHECK_JOB);
    assert.ok(job, 'ghost check not enqueued');
    assert.equal(job!.data.orderId, IDS.order);
    assert.equal(job!.options.delay, 120000);
    assert.equal(job!.options.jobId, `${GHOST_CHECK_JOB}:${IDS.order}`);
  });

  await suite.test('ghostRestaurantWorker.scheduleCheck delegates to the durable queue', async () => {
    enqueuedJobs.length = 0;
    ghostRestaurantWorker.scheduleCheck(IDS.order);
    await wait(20);
    assert.ok(enqueuedJobs.some((entry) => entry.name === GHOST_CHECK_JOB));
  });

  await suite.test('dispatch retries are enqueued with the expected candidate guard', async () => {
    enqueuedJobs.length = 0;
    await scheduleDispatchNext(IDS.order, 30000, IDS.rider);
    const job = enqueuedJobs.find((entry) => entry.name === DISPATCH_NEXT_JOB);
    assert.ok(job);
    assert.deepEqual(job!.data, { orderId: IDS.order, expectCandidateId: IDS.rider });
    assert.equal(job!.options.delay, 30000);
  });

  await suite.test('the realtime outbox worker drains events to socket rooms', async () => {
    const emitted: Array<{ room: string; event: string }> = [];
    const fakeIo = {
      to(room: string) {
        return {
          emit(event: string) {
            emitted.push({ room, event });
          },
        };
      },
    };
    (socketService as any).getIo = () => fakeIo;

    mockDb.clearLog();
    const stop = startOutboxWorker();
    await wait(1300);
    stop();

    assert.equal(emitted.length, 2);
    assert.deepEqual(emitted[0], { room: `restaurant:${IDS.restaurant}`, event: 'restaurant:new_order' });
    assert.deepEqual(emitted[1], { room: `order_tracking:${IDS.order}`, event: 'order:status:update' });
    assert.equal(mockDb.calls(/DELETE FROM realtime_outbox/i).length, 2);
  });
});
