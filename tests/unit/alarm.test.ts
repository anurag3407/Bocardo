import assert from 'node:assert/strict';
import { kitchenAlarmService } from '../../apps/hotel/src/services/alarm';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Kitchen Alarm Service');

runSuite(suite, async () => {
  await suite.test('alarm is idle by default', () => {
    assert.equal(kitchenAlarmService.getIsPlaying(), false);
  });

  await suite.test('startAlarm begins the looping alarm and notifies subscribers', () => {
    const states: boolean[] = [];
    const unsubscribe = kitchenAlarmService.subscribe((isPlaying) => states.push(isPlaying));
    kitchenAlarmService.startAlarm();
    assert.equal(kitchenAlarmService.getIsPlaying(), true);
    assert.deepEqual(states, [false, true]);
    unsubscribe();
    kitchenAlarmService.stopAlarm();
  });

  await suite.test('startAlarm is idempotent while ringing', () => {
    kitchenAlarmService.startAlarm();
    kitchenAlarmService.startAlarm();
    assert.equal(kitchenAlarmService.getIsPlaying(), true);
    kitchenAlarmService.stopAlarm();
  });

  await suite.test('stopAlarm silences the loop and notifies subscribers', () => {
    kitchenAlarmService.startAlarm();
    const states: boolean[] = [];
    const unsubscribe = kitchenAlarmService.subscribe((isPlaying) => states.push(isPlaying));
    kitchenAlarmService.stopAlarm();
    assert.equal(kitchenAlarmService.getIsPlaying(), false);
    assert.deepEqual(states, [true, false]);
    unsubscribe();
  });

  await suite.test('stopAlarm on an idle alarm is a no-op', () => {
    let notifications = 0;
    const unsubscribe = kitchenAlarmService.subscribe(() => {
      notifications += 1;
    });
    kitchenAlarmService.stopAlarm();
    assert.equal(notifications, 1); // only the immediate subscribe callback
    unsubscribe();
  });
});
