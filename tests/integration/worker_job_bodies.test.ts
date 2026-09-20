import assert from 'node:assert/strict';
import {
  DISPATCH_NEXT_JOB,
  DISPATCH_QUEUE,
  GHOST_CHECK_JOB,
  ORDER_LIFECYCLE_QUEUE,
  RIDER_ABANDON_SWEEP_JOB,
  STALE_PAYMENT_SWEEP_JOB,
  startQueueWorkers,
  stopQueueWorkers,
} from '../../apps/api/src/services/queue';
import { startDispatchWorker } from '../../apps/api/src/workers/sequentialDispatchWorker';
import { paymentService } from '../../apps/api/src/services/payment';
import { socketService } from '../../apps/api/src/services/socket';
import { redisService } from '../../apps/api/src/services/redis';
import { OrderStatus } from '../../packages/shared-types/src';
import { enqueuedJobs, fakeJob, getJobProcessor, installPlatformDoubles, MockDb } from '../harness/db';
import { IDS } from '../harness/trpc';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Integration · BullMQ Job Bodies (ghost restaurant, sweeps, dispatch)');

runSuite(suite, async () => {
  // ---------------------------------------------------------------- doubles
  let ghostOrderRow: any = null;
  let ghostCancelRowCount = 1;
  let abandonRows: any[] = [];
  let staleSweepRowCount = 0;

  let mockDb: MockDb;
  mockDb = installPlatformDoubles()
    // ghost-restaurant check: order lookup
    .on(/SELECT o\.id, o\.restaurant_id, o\.status, o\.total_amount_paise,[\s\S]*FROM orders o\s+JOIN restaurants r/i, () =>
      ghostOrderRow ? { rows: [ghostOrderRow], rowCount: 1 } : { rows: [], rowCount: 0 }
    )
    // ghost-restaurant check: guarded cancel transition
    .on(/UPDATE orders\s+SET status = \$1, cancel_reason = \$2, updated_at = NOW\(\)\s+WHERE id = \$3 AND status = \$4/i, () => ({
      rows: ghostCancelRowCount ? [{ id: IDS.order }] : [],
      rowCount: ghostCancelRowCount,
    }))
    // ghost-restaurant check: restaurant safeguard
    .on(/UPDATE restaurants SET is_accepting_orders = FALSE/i, () => ({ rows: [], rowCount: 1 }))
    // stale PAYMENT_PENDING sweep
    .on(/UPDATE orders\s+SET status = \$1, cancel_reason = 'Payment abandoned or failed at checkout'/i, () => ({
      rows: staleSweepRowCount ? [{ id: IDS.order }] : [],
      rowCount: staleSweepRowCount,
    }))
    // rider-abandon sweep reaper
    .on(/WITH stuck AS[\s\S]*UPDATE orders o\s+SET rider_id = NULL, status = \$1/i, () => ({
      rows: abandonRows,
      rowCount: abandonRows.length,
    }))
    .on(/UPDATE rider_profiles SET active_order_id = NULL/i, () => ({ rows: [], rowCount: 1 }))
    // dispatch job body: order + restaurant join
    .on(/SELECT o\.id, o\.status, o\.rider_id, o\.delivery_fee_paise/i, () => ({
      rows: dispatchOrderRow ? [dispatchOrderRow] : [],
      rowCount: dispatchOrderRow ? 1 : 0,
    }))
    // dispatch job body: nearest online rider query (packages/database/src/geo.ts)
    .on(/FROM users u\s+JOIN rider_profiles rp ON u\.id = rp\.user_id/i, () => ({
      rows: nearestRider ? [nearestRider] : [],
      rowCount: nearestRider ? 1 : 0,
    }));

  let dispatchOrderRow: any = {
    id: IDS.order,
    status: OrderStatus.READY_FOR_PICKUP,
    rider_id: null,
    delivery_fee_paise: 3500,
    restaurant_id: IDS.restaurant,
    restaurant_name: 'Test Kitchen',
    restaurant_address: '1 Test Road',
    rest_lat: 12.9716,
    rest_lng: 77.5946,
    delivery_address: '2 Customer Street',
  };
  let nearestRider: any = null;

  // ------------------------------------------------------- captured spying
  const refunds: Array<{ paymentId: string; amountPaise: number; notes: any }> = [];
  const trackingEmits: Array<{ orderId: string; event: string; data: any }> = [];
  const riderOffers: Array<{ riderId: string; event: string; data: any }> = [];

  const realRefund = paymentService.refundPayment;
  const realEmitToOrderTracking = socketService.emitToOrderTracking;
  const realEmitToRider = socketService.emitToRider;

  paymentService.refundPayment = (async (paymentId: string, amountPaise: number, notes: any) => {
    refunds.push({ paymentId, amountPaise, notes });
    return { id: 'rfnd_test', payment_id: paymentId, amount: amountPaise, status: 'processed' };
  }) as typeof paymentService.refundPayment;

  socketService.emitToOrderTracking = ((orderId: string, event: string, data: any) => {
    trackingEmits.push({ orderId, event, data });
  }) as typeof socketService.emitToOrderTracking;

  socketService.emitToRider = ((riderId: string, event: string, data: any) => {
    riderOffers.push({ riderId, event, data });
  }) as typeof socketService.emitToRider;

  // --------------------------------------------------------------- wiring
  const workers = [...startQueueWorkers(), startDispatchWorker()];
  const lifecycleJob = getJobProcessor(workers, ORDER_LIFECYCLE_QUEUE);
  const dispatchJob = getJobProcessor(workers, DISPATCH_QUEUE);

  const dispatchStateKey = (orderId: string) => `dispatch:state:${orderId}`;

  await suite.test('starting the workers registers both durable queues', () => {
    assert.ok(workers.some((worker) => worker.name === ORDER_LIFECYCLE_QUEUE));
    assert.ok(workers.some((worker) => worker.name === DISPATCH_QUEUE));
  });

  await suite.test('the recurring sweeps are registered on cron-style schedules', () => {
    const stale = enqueuedJobs.find((job) => job.name === STALE_PAYMENT_SWEEP_JOB);
    const abandon = enqueuedJobs.find((job) => job.name === RIDER_ABANDON_SWEEP_JOB);
    assert.equal(stale?.options.repeat.every, 10 * 60 * 1000);
    assert.equal(stale?.options.jobId, 'repeat:stale-payment-sweep');
    assert.equal(abandon?.options.repeat.every, 15 * 60 * 1000);
    assert.equal(abandon?.options.jobId, 'repeat:rider-abandon-sweep');
  });

  // =========================================================================
  // Ghost restaurant 120s auto-refund
  // =========================================================================
  const resetGhost = () => {
    refunds.length = 0;
    trackingEmits.length = 0;
    mockDb.clearLog();
    ghostCancelRowCount = 1;
  };

  await suite.test('ghost check ignores orders that no longer exist', async () => {
    resetGhost();
    ghostOrderRow = null;
    await lifecycleJob(fakeJob(GHOST_CHECK_JOB, { orderId: IDS.order }));
    assert.equal(mockDb.calls(/UPDATE orders/i).length, 0);
    assert.equal(refunds.length, 0);
  });

  await suite.test('ghost check no-ops once the kitchen accepted (status advanced)', async () => {
    resetGhost();
    ghostOrderRow = {
      id: IDS.order,
      restaurant_id: IDS.restaurant,
      status: OrderStatus.PREPARING,
      total_amount_paise: 24900,
      razorpay_payment_id: 'pay_abc123',
      restaurant_name: 'Test Kitchen',
    };
    await lifecycleJob(fakeJob(GHOST_CHECK_JOB, { orderId: IDS.order }));
    assert.equal(mockDb.calls(/UPDATE orders/i).length, 0);
    assert.equal(refunds.length, 0);
    assert.equal(trackingEmits.length, 0);
  });

  await suite.test('ghost check auto-cancels, refunds, and disables the kitchen after 120s', async () => {
    resetGhost();
    ghostOrderRow = {
      id: IDS.order,
      restaurant_id: IDS.restaurant,
      status: OrderStatus.PAID,
      total_amount_paise: 24900,
      razorpay_payment_id: 'pay_ghost123',
      restaurant_name: 'Ghost Kitchen',
    };

    await lifecycleJob(fakeJob(GHOST_CHECK_JOB, { orderId: IDS.order }));

    const cancel = mockDb.calls(/UPDATE orders\s+SET status = \$1, cancel_reason = \$2[\s\S]*WHERE id = \$3 AND status = \$4/i)[0];
    assert.ok(cancel, 'guarded cancel transition was not issued');
    assert.deepEqual(cancel.params, [
      OrderStatus.CANCELLED_BY_SYSTEM,
      'Restaurant non-responsive within 120 seconds',
      IDS.order,
      OrderStatus.PAID,
    ]);

    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].paymentId, 'pay_ghost123');
    assert.equal(refunds[0].amountPaise, 24900);
    assert.equal(refunds[0].notes.reason, 'Restaurant non-responsive within 120 seconds');

    const safeguard = mockDb.calls(/UPDATE restaurants SET is_accepting_orders = FALSE/i);
    assert.equal(safeguard.length, 1);
    assert.equal(safeguard[0].params[0], IDS.restaurant);

    assert.equal(trackingEmits.length, 1);
    assert.equal(trackingEmits[0].orderId, IDS.order);
    assert.equal(trackingEmits[0].event, 'order:status:update');
    assert.equal(trackingEmits[0].data.status, OrderStatus.CANCELLED_BY_SYSTEM);
    assert.match(trackingEmits[0].data.message, /refunded automatically/i);
  });

  await suite.test('ghost check never double-refunds when the kitchen wins the race', async () => {
    resetGhost();
    ghostCancelRowCount = 0; // guarded UPDATE matched nothing: kitchen accepted first
    ghostOrderRow = {
      id: IDS.order,
      restaurant_id: IDS.restaurant,
      status: OrderStatus.PAID,
      total_amount_paise: 24900,
      razorpay_payment_id: 'pay_race',
      restaurant_name: 'Race Kitchen',
    };

    await lifecycleJob(fakeJob(GHOST_CHECK_JOB, { orderId: IDS.order }));

    assert.equal(refunds.length, 0, 'a refund was issued after losing the accept race');
    assert.equal(mockDb.calls(/UPDATE restaurants SET is_accepting_orders = FALSE/i).length, 0);
    assert.equal(trackingEmits.length, 0);
  });

  await suite.test('ghost check cancels unpaid orders without attempting a refund', async () => {
    resetGhost();
    ghostOrderRow = {
      id: IDS.order,
      restaurant_id: IDS.restaurant,
      status: OrderStatus.PAID,
      total_amount_paise: 24900,
      razorpay_payment_id: null,
      restaurant_name: 'Unpaid Kitchen',
    };

    await lifecycleJob(fakeJob(GHOST_CHECK_JOB, { orderId: IDS.order }));

    assert.equal(refunds.length, 0, 'refund attempted without a captured payment id');
    assert.equal(mockDb.calls(/UPDATE orders\s+SET status = \$1, cancel_reason = \$2/i).length, 1);
    assert.equal(trackingEmits.length, 1);
  });

  // =========================================================================
  // Stale PAYMENT_PENDING sweep (30 minutes)
  // =========================================================================
  await suite.test('stale payment sweep targets only 30-minute-old PAYMENT_PENDING orders', async () => {
    mockDb.clearLog();
    staleSweepRowCount = 3;
    await lifecycleJob(fakeJob(STALE_PAYMENT_SWEEP_JOB, {}));

    const sweep = mockDb.calls(/UPDATE orders\s+SET status = \$1, cancel_reason = 'Payment abandoned or failed at checkout'/i)[0];
    assert.ok(sweep, 'sweep statement was not issued');
    assert.deepEqual(sweep.params, [OrderStatus.CANCELLED_BY_SYSTEM, OrderStatus.PAYMENT_PENDING]);
    assert.match(sweep.sql, /INTERVAL '30 minutes'/i);
  });

  await suite.test('an empty stale payment sweep is a harmless no-op', async () => {
    mockDb.clearLog();
    staleSweepRowCount = 0;
    await lifecycleJob(fakeJob(STALE_PAYMENT_SWEEP_JOB, {}));
    assert.equal(mockDb.calls(/UPDATE orders/i).length, 1);
  });

  // =========================================================================
  // Rider-abandon sweep (2 hours)
  // =========================================================================
  await suite.test('rider-abandon sweep reaps only the assigned/en-route statuses older than 2 hours', async () => {
    mockDb.clearLog();
    refunds.length = 0;
    abandonRows = [];
    await lifecycleJob(fakeJob(RIDER_ABANDON_SWEEP_JOB, {}));

    const reap = mockDb.calls(/UPDATE orders o\s+SET rider_id = NULL/i)[0];
    assert.ok(reap, 'reaper statement was not issued');
    assert.equal(reap.params[0], OrderStatus.READY_FOR_PICKUP);
    assert.deepEqual(reap.params.slice(1), [OrderStatus.RIDER_ASSIGNED, OrderStatus.OUT_FOR_DELIVERY]);
    assert.match(reap.sql, /INTERVAL '2 hours'/i);
    // RETURNING must surface the PRE-update rider id: `SET rider_id = NULL`
    // would otherwise make `RETURNING rider_id` always NULL in PostgreSQL and
    // the abandoning rider would never be released from `rider_profiles`.
    assert.match(reap.sql, /RETURNING o\.id, stuck\.rider_id/i);
  });

  await suite.test('rider-abandon sweep releases the rider, notifies tracking, and re-dispatches', async () => {
    mockDb.clearLog();
    trackingEmits.length = 0;
    enqueuedJobs.length = 0;
    abandonRows = [{ id: IDS.order, rider_id: IDS.rider }];

    await lifecycleJob(fakeJob(RIDER_ABANDON_SWEEP_JOB, {}));

    const release = mockDb.calls(/UPDATE rider_profiles SET active_order_id = NULL/i);
    assert.equal(release.length, 1, 'abandoning rider was never released from the order');
    assert.deepEqual(release[0].params, [IDS.rider, IDS.order]);

    assert.equal(trackingEmits.length, 1);
    assert.deepEqual(trackingEmits[0].orderId, IDS.order);
    assert.equal(trackingEmits[0].data.status, OrderStatus.READY_FOR_PICKUP);
    assert.match(trackingEmits[0].data.message, /new delivery partner/i);

    const requeue = enqueuedJobs.find((job) => job.name === DISPATCH_NEXT_JOB);
    assert.ok(requeue, 'abandoned order was not re-queued for dispatch');
    assert.equal(requeue!.data.orderId, IDS.order);
  });

  await suite.test('rider-abandon sweep still cascades orders whose rider was already detached', async () => {
    mockDb.clearLog();
    trackingEmits.length = 0;
    enqueuedJobs.length = 0;
    abandonRows = [
      { id: IDS.order, rider_id: null },
      { id: IDS.dishA, rider_id: IDS.rider },
    ];

    await lifecycleJob(fakeJob(RIDER_ABANDON_SWEEP_JOB, {}));

    assert.equal(mockDb.calls(/UPDATE rider_profiles SET active_order_id = NULL/i).length, 1);
    assert.equal(trackingEmits.length, 2);
    const requeued = enqueuedJobs.filter((job) => job.name === DISPATCH_NEXT_JOB);
    assert.deepEqual(requeued.map((job) => job.data.orderId).sort(), [IDS.order, IDS.dishA].sort());
  });

  // =========================================================================
  // Dispatch job body (rider-dispatch queue)
  // =========================================================================
  await suite.test('dispatch job stops once an order already has a rider', async () => {
    mockDb.clearLog();
    riderOffers.length = 0;
    enqueuedJobs.length = 0;
    dispatchOrderRow = { ...dispatchOrderRow, rider_id: IDS.rider, status: OrderStatus.RIDER_ASSIGNED };

    await dispatchJob(fakeJob(DISPATCH_NEXT_JOB, { orderId: IDS.order }));

    assert.equal(riderOffers.length, 0);
    assert.equal(enqueuedJobs.length, 0, 'dispatch continued scheduling for an assigned order');
  });

  await suite.test('a stale timeout job is ignored when the candidate already responded', async () => {
    mockDb.clearLog();
    riderOffers.length = 0;
    dispatchOrderRow = { ...dispatchOrderRow, rider_id: null, status: OrderStatus.READY_FOR_PICKUP };
    // State was cleared on accept: no current candidate matches the timeout job.
    await redisService.del(dispatchStateKey(IDS.order));

    await dispatchJob(
      fakeJob(DISPATCH_NEXT_JOB, { orderId: IDS.order, expectCandidateId: IDS.rider })
    );

    assert.equal(riderOffers.length, 0, 'a stale offer was sent after the rider had responded');
  });

  await suite.test('an offer timeout rejects the candidate and cascades to the next rider', async () => {
    mockDb.clearLog();
    riderOffers.length = 0;
    enqueuedJobs.length = 0;
    await redisService.set(
      dispatchStateKey(IDS.order),
      JSON.stringify({ rejectedRiderIds: [], currentCandidateId: IDS.rider, attempt: 1 }),
      'EX',
      300
    );
    nearestRider = {
      id: IDS.admin,
      fullName: 'Next Rider',
      phone: '+919000000000',
      vehicleType: 'MOTORCYCLE',
      distanceMeters: 1234,
    };

    await dispatchJob(
      fakeJob(DISPATCH_NEXT_JOB, { orderId: IDS.order, expectCandidateId: IDS.rider })
    );

    const state = JSON.parse((await redisService.get(dispatchStateKey(IDS.order)))!);
    assert.deepEqual(state.rejectedRiderIds, [IDS.rider]);
    assert.equal(state.currentCandidateId, IDS.admin);
    assert.equal(state.attempt, 2);
    assert.equal(riderOffers.length, 1);
    assert.equal(riderOffers[0].riderId, IDS.admin);
    assert.match(riderOffers[0].data.restaurantName, /Test Kitchen/);

    const timeout = enqueuedJobs.find((job) => job.name === DISPATCH_NEXT_JOB);
    assert.equal(timeout?.data.expectCandidateId, IDS.admin);
    assert.equal(timeout?.options.delay, 30000);
    await redisService.del(dispatchStateKey(IDS.order));
  });

  await suite.test('dispatch retries after 15s when no rider is in range', async () => {
    mockDb.clearLog();
    riderOffers.length = 0;
    enqueuedJobs.length = 0;
    await redisService.del(dispatchStateKey(IDS.order));
    nearestRider = null;

    await dispatchJob(fakeJob(DISPATCH_NEXT_JOB, { orderId: IDS.order }));

    assert.equal(riderOffers.length, 0);
    const retry = enqueuedJobs.find((job) => job.name === DISPATCH_NEXT_JOB);
    assert.ok(retry, 'no retry was scheduled when the rider pool was empty');
    assert.equal(retry!.options.delay, 15000);
    assert.equal(retry!.data.expectCandidateId, undefined);
    await redisService.del(dispatchStateKey(IDS.order));
  });

  await suite.test('dispatch escalates to ops instead of looping forever', async () => {
    mockDb.clearLog();
    riderOffers.length = 0;
    trackingEmits.length = 0;
    enqueuedJobs.length = 0;
    await redisService.set(
      dispatchStateKey(IDS.order),
      JSON.stringify({ rejectedRiderIds: [], currentCandidateId: null, attempt: 20 }),
      'EX',
      300
    );
    nearestRider = null;

    await dispatchJob(fakeJob(DISPATCH_NEXT_JOB, { orderId: IDS.order }));

    assert.equal(riderOffers.length, 0);
    assert.equal(enqueuedJobs.length, 0, 'dispatch kept retrying past the attempt ceiling');
    assert.equal(trackingEmits.length, 1);
    assert.match(trackingEmits[0].data.message, /arranging a delivery partner/i);
    assert.equal(await redisService.get(dispatchStateKey(IDS.order)), null);
  });

  await suite.test('corrupted dispatch state is discarded rather than crashing the cascade', async () => {
    riderOffers.length = 0;
    enqueuedJobs.length = 0;
    nearestRider = null;
    await redisService.set(dispatchStateKey(IDS.order), '{not-json', 'EX', 300);

    await dispatchJob(fakeJob(DISPATCH_NEXT_JOB, { orderId: IDS.order }));

    const state = JSON.parse((await redisService.get(dispatchStateKey(IDS.order)))!);
    assert.equal(state.attempt, 1);
    await redisService.del(dispatchStateKey(IDS.order));
  });

  await suite.test('an unknown lifecycle job name is rejected so BullMQ retries it', async () => {
    await assert.rejects(
      () => lifecycleJob(fakeJob('totally-unknown-job', {})),
      /Unknown lifecycle job/
    );
  });

  // ------------------------------------------------------------- restore
  paymentService.refundPayment = realRefund;
  socketService.emitToOrderTracking = realEmitToOrderTracking;
  socketService.emitToRider = realEmitToRider;
  await stopQueueWorkers();
});
