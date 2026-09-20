import assert from 'node:assert/strict';
import { getCurrentMealSlot } from '../../apps/api/src/routers/recommendations';
import { MealSlot } from '../../packages/shared-types/src';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Recommendation Meal Slot');

/** Runs `fn` while `new Date()` reports the given local hour. */
function withHour(hour: number, fn: () => void): void {
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(2026, 0, 1, hour, 30, 0);
      else super(...(args as []));
    }
    static now(): number {
      return new RealDate(2026, 0, 1, hour, 30, 0).getTime();
    }
  }
  (globalThis as any).Date = MockDate;
  try {
    fn();
  } finally {
    (globalThis as any).Date = RealDate;
  }
}

runSuite(suite, async () => {
  const boundaries: Array<[number, MealSlot]> = [
    [0, MealSlot.LATE_NIGHT],
    [5, MealSlot.LATE_NIGHT],
    [6, MealSlot.BREAKFAST],
    [10, MealSlot.BREAKFAST],
    [11, MealSlot.LUNCH],
    [15, MealSlot.LUNCH],
    [16, MealSlot.SNACKS],
    [18, MealSlot.SNACKS],
    [19, MealSlot.DINNER],
    [22, MealSlot.DINNER],
    [23, MealSlot.LATE_NIGHT],
  ];

  for (const [hour, expected] of boundaries) {
    await suite.test(`hour ${hour} resolves to ${expected}`, () => {
      withHour(hour, () => assert.equal(getCurrentMealSlot(), expected));
    });
  }
});
