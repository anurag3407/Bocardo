import assert from 'node:assert/strict';
import { theme } from '../../packages/ui/src/theme';
import { OrderStatus } from '../../packages/shared-types/src';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · UI Theme Coverage');

runSuite(suite, async () => {
  await suite.test('every OrderStatus has a status pill colour', () => {
    for (const status of Object.values(OrderStatus)) {
      const config = theme.statusColors[status];
      assert.ok(config, `missing colour config for ${status}`);
      assert.match(config.bg, /^#[0-9A-Fa-f]{6}$/);
      assert.match(config.text, /^#[0-9A-Fa-f]{6}$/);
      assert.match(config.border, /^#[0-9A-Fa-f]{6}$/);
    }
  });

  await suite.test('cancellation statuses share the danger colour family', () => {
    const danger = theme.colors.zomatoRed;
    assert.equal(theme.statusColors.CANCELLED_BY_CUSTOMER.text, theme.statusColors.CANCELLED_BY_KITCHEN.text);
    assert.equal(theme.statusColors.CANCELLED_BY_KITCHEN.text, theme.statusColors.CANCELLED_BY_SYSTEM.text);
    assert.ok(danger.length === 7);
  });

  await suite.test('brand and semantic colours are valid hex values', () => {
    const palette = [
      theme.colors.primary.DEFAULT,
      theme.colors.primary.dark,
      theme.colors.primary.light,
      theme.colors.secondary.DEFAULT,
      theme.colors.emerald.DEFAULT,
      theme.colors.veg,
      theme.colors.nonVeg,
      theme.colors.background,
      theme.colors.surface,
      theme.colors.border,
      theme.colors.text.primary,
      theme.colors.text.secondary,
      theme.colors.text.muted,
    ];
    for (const value of palette) assert.match(value, /^#[0-9A-Fa-f]{6}$/);
  });
});
