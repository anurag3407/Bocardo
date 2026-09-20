import assert from 'node:assert/strict';
import { riderLocationStream } from '../../apps/rider/src/services/locationStream';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Rider GPS Location Stream');

function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error('timed out waiting for condition'));
      }
    }, 20);
  });
}

runSuite(suite, async () => {
  riderLocationStream.stopStreaming();

  await suite.test('current coordinate is hardware (non-mocked) telemetry', () => {
    const coord = riderLocationStream.getCurrentCoord();
    assert.equal(coord.isMocked, false);
    assert.ok(coord.latitude > -90 && coord.latitude < 90);
    assert.ok(coord.longitude > -180 && coord.longitude < 180);
  });

  await suite.test('subscribers receive the current coordinate immediately', () => {
    const seen: number[] = [];
    const unsubscribe = riderLocationStream.subscribe((coord) => seen.push(coord.latitude));
    assert.equal(seen.length, 1);
    unsubscribe();
  });

  await suite.test('start/stop streaming emits movement without leaving timers open', async () => {
    const updates: number[] = [];
    const unsubscribe = riderLocationStream.subscribe((coord) => updates.push(coord.latitude));
    const initialCount = updates.length;

    riderLocationStream.startStreaming('rider-test', 'order-test');
    riderLocationStream.startStreaming('rider-test', 'order-test'); // idempotent
    await waitFor(() => updates.length > initialCount);

    riderLocationStream.stopStreaming();
    const countAfterStop = updates.length;
    await new Promise((resolve) => setTimeout(resolve, 3200));
    assert.equal(updates.length, countAfterStop, 'stream kept emitting after stopStreaming');
    unsubscribe();
  });

  await suite.test('stopStreaming is safe when idle', () => {
    riderLocationStream.stopStreaming();
    riderLocationStream.stopStreaming();
    assert.equal(riderLocationStream.getCurrentCoord().isMocked, false);
  });
});
