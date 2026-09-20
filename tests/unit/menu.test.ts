import assert from 'node:assert/strict';
import {
  priceCustomization,
  buildCartLineId,
  serializeCustomization,
  AddOnGroupSchema,
  DishVariantSchema,
  MenuCustomizationSchema,
} from '../../packages/shared-types/src';
import type { DishCustomizationConfig, MenuCustomization } from '../../packages/shared-types/src';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Menu Customization Pricing');

const config: DishCustomizationConfig = {
  variants: [
    { id: 'half', name: 'Half', pricePaise: 18000, isDefault: false },
    { id: 'full', name: 'Full', pricePaise: 32000, isDefault: true },
  ],
  addOnGroups: [
    {
      id: 'raita',
      name: 'Choose your raita',
      minSelections: 1,
      maxSelections: 1,
      isMultiSelect: false,
      options: [
        { id: 'plain', name: 'Plain Raita', pricePaise: 4000, isAvailable: true },
        { id: 'garlic', name: 'Garlic Raita', pricePaise: 6000, isAvailable: true },
        { id: 'soldout', name: 'Special Raita', pricePaise: 9000, isAvailable: false },
      ],
    },
    {
      id: 'toppings',
      name: 'Extra toppings',
      minSelections: 0,
      maxSelections: 3,
      isMultiSelect: true,
      options: [
        { id: 'cheese', name: 'Extra Cheese', pricePaise: 5000, isAvailable: true },
        { id: 'egg', name: 'Boiled Egg', pricePaise: 3000, isAvailable: true },
      ],
    },
  ],
};

function selection(overrides: Partial<MenuCustomization> = {}): MenuCustomization {
  return { variantId: null, addOns: [], ...overrides };
}

runSuite(suite, async () => {
  await suite.test('plain dish with no config prices from base price', () => {
    const priced = priceCustomization(20000, {}, selection());
    assert.deepEqual(priced, {
      variantId: null,
      variantName: null,
      unitBasePaise: 20000,
      addOnsPaise: 0,
      unitPricePaise: 20000,
      addOnSummary: [],
    });
  });

  await suite.test('explicit variant overrides the default', () => {
    const priced = priceCustomization(20000, config, selection({ variantId: 'half', addOns: [{ groupId: 'raita', optionId: 'plain', quantity: 1 }] }));
    assert.equal(priced.variantId, 'half');
    assert.equal(priced.variantName, 'Half');
    assert.equal(priced.unitBasePaise, 18000);
  });

  await suite.test('default variant is used when none selected', () => {
    const priced = priceCustomization(20000, config, selection({ addOns: [{ groupId: 'raita', optionId: 'plain', quantity: 1 }] }));
    assert.equal(priced.variantId, 'full');
    assert.equal(priced.unitBasePaise, 32000);
  });

  await suite.test('first variant is the fallback when no default is flagged', () => {
    const fallback: DishCustomizationConfig = {
      variants: [
        { id: 'a', name: 'A', pricePaise: 10000, isDefault: false },
        { id: 'b', name: 'B', pricePaise: 12000, isDefault: false },
      ],
    };
    assert.equal(priceCustomization(9000, fallback, selection()).variantId, 'a');
  });

  await suite.test('add-ons are priced by quantity and summarised', () => {
    const priced = priceCustomization(
      20000,
      config,
      selection({
        addOns: [
          { groupId: 'raita', optionId: 'garlic', quantity: 1 },
          { groupId: 'toppings', optionId: 'cheese', quantity: 2 },
        ],
      })
    );
    assert.equal(priced.addOnsPaise, 6000 + 5000 * 2);
    assert.equal(priced.unitPricePaise, 32000 + 16000);
    assert.deepEqual(priced.addOnSummary, ['Garlic Raita', 'Extra Cheese x2']);
  });

  await suite.test('unavailable add-ons are rejected', () => {
    assert.throws(
      () => priceCustomization(20000, config, selection({ addOns: [{ groupId: 'raita', optionId: 'soldout', quantity: 1 }] })),
      /unavailable/
    );
  });

  await suite.test('mandatory group must be satisfied', () => {
    assert.throws(() => priceCustomization(20000, config, selection()), /Choose your raita/);
  });

  await suite.test('single-select group caps at one option', () => {
    assert.throws(
      () =>
        priceCustomization(
          20000,
          config,
          selection({
            addOns: [
              { groupId: 'raita', optionId: 'plain', quantity: 1 },
              { groupId: 'raita', optionId: 'garlic', quantity: 1 },
            ],
          })
        ),
      /up to 1 option/
    );
  });

  await suite.test('multi-select group honours maxSelections', () => {
    const ok = priceCustomization(20000, config, selection({
      addOns: [
        { groupId: 'raita', optionId: 'plain', quantity: 1 },
        { groupId: 'toppings', optionId: 'cheese', quantity: 3 },
      ],
    }));
    assert.equal(ok.addOnsPaise, 4000 + 15000);
  });

  await suite.test('maxSelections breach throws a user-safe error', () => {
    assert.throws(
      () =>
        priceCustomization(20000, config, selection({
          addOns: [
            { groupId: 'raita', optionId: 'plain', quantity: 1 },
            { groupId: 'toppings', optionId: 'cheese', quantity: 4 },
          ],
        })),
      /up to 3 options/
    );
  });

  await suite.test('stale selections for removed groups/options are ignored', () => {
    const priced = priceCustomization(20000, config, selection({
      addOns: [
        { groupId: 'raita', optionId: 'plain', quantity: 1 },
        { groupId: 'ghost-group', optionId: 'x', quantity: 2 },
        { groupId: 'toppings', optionId: 'ghost-option', quantity: 1 },
      ],
    }));
    assert.equal(priced.addOnsPaise, 4000);
  });

  await suite.test('negative base price is floored to zero', () => {
    assert.equal(priceCustomization(-500, {}, selection()).unitBasePaise, 0);
  });

  await suite.test('buildCartLineId is stable regardless of add-on order', () => {
    const a = buildCartLineId('dish-1', {
      variantId: 'full',
      addOns: [
        { groupId: 'toppings', optionId: 'cheese', quantity: 2 },
        { groupId: 'raita', optionId: 'garlic', quantity: 1 },
      ],
    });
    const b = buildCartLineId('dish-1', {
      variantId: 'full',
      addOns: [
        { groupId: 'raita', optionId: 'garlic', quantity: 1 },
        { groupId: 'toppings', optionId: 'cheese', quantity: 2 },
      ],
    });
    assert.equal(a, b);
    assert.equal(a, 'dish-1::full::raita:garlicx1,toppings:cheesex2');
  });

  await suite.test('buildCartLineId distinguishes base vs variant lines', () => {
    assert.notEqual(
      buildCartLineId('dish-1', { variantId: null, addOns: [] }),
      buildCartLineId('dish-1', { variantId: 'full', addOns: [] })
    );
  });

  await suite.test('serializeCustomization strips the leading separator', () => {
    const serialized = serializeCustomization({ variantId: 'half', addOns: [{ groupId: 'raita', optionId: 'plain', quantity: 1 }] });
    assert.equal(serialized, 'half::raita:plainx1');
    assert.equal(serialized.startsWith('::'), false);
  });

  await suite.test('menu schemas apply documented defaults', () => {
    const group = AddOnGroupSchema.parse({
      id: 'g1',
      name: 'Sides',
      options: [{ id: 'o1', name: 'Fries', pricePaise: 9000 }],
    });
    assert.equal(group.minSelections, 0);
    assert.equal(group.maxSelections, 1);
    assert.equal(group.isMultiSelect, false);

    const variant = DishVariantSchema.parse({ id: 'v1', name: 'Large', pricePaise: 12000 });
    assert.equal(variant.isDefault, false);

    const customization = MenuCustomizationSchema.parse({});
    assert.deepEqual(customization.addOns, []);

    assert.equal(AddOnGroupSchema.safeParse({ id: 'g1', name: 'Sides', options: [] }).success, false);
    assert.equal(DishVariantSchema.safeParse({ id: 'v1', name: 'Large', pricePaise: -1 }).success, false);
    assert.equal(
      MenuCustomizationSchema.safeParse({ addOns: [{ groupId: 'g', optionId: 'o', quantity: 21 }] }).success,
      false,
      'quantity above max(20) must be rejected'
    );
  });

  await suite.test('unknown variant id silently falls back to the default', () => {
    const priced = priceCustomization(20000, config, selection({ variantId: 'ghost', addOns: [{ groupId: 'raita', optionId: 'plain', quantity: 1 }] }));
    assert.equal(priced.variantId, 'full', 'stale variant id should fall back to the default, not throw');
  });

  await suite.test('zero-quantity add-on fails selection validation', () => {
    const parsed = MenuCustomizationSchema.safeParse({ addOns: [{ groupId: 'raita', optionId: 'plain', quantity: 0 }] });
    assert.equal(parsed.success, false, 'quantity 0 must be rejected by AddOnSelectionSchema');
  });

  await suite.test('mandatory multi-select minimum is enforced', () => {
    const strict: DishCustomizationConfig = {
      addOnGroups: [
        { id: 'sides', name: 'Pick sides', minSelections: 2, maxSelections: 3, isMultiSelect: true, options: [{ id: 'a', name: 'A', pricePaise: 1000, isAvailable: true }, { id: 'b', name: 'B', pricePaise: 1000, isAvailable: true }] },
      ],
    };
    assert.throws(
      () => priceCustomization(10000, strict, selection({ addOns: [{ groupId: 'sides', optionId: 'a', quantity: 1 }] })),
      /at least 2 options/
    );
  });

  await suite.test('buildCartLineId separates quantity variants of the same option', () => {
    const a = buildCartLineId('dish-1', { variantId: null, addOns: [{ groupId: 'toppings', optionId: 'cheese', quantity: 1 }] });
    const b = buildCartLineId('dish-1', { variantId: null, addOns: [{ groupId: 'toppings', optionId: 'cheese', quantity: 2 }] });
    assert.notEqual(a, b);
    assert.equal(serializeCustomization({ variantId: null, addOns: [] }), 'base::');
  });
});
