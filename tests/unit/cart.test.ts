import assert from 'node:assert/strict';
import { cartStore } from '../../apps/customer/src/lib/cart';
import { calculateOrderTaxBreakdown } from '../../packages/shared-types/src';
import { Suite, runSuite } from '../harness/suite';

const suite = new Suite('Unit · Customer Cart Store');

const REST_A = { restaurantId: 'rest-a', restaurantName: 'Biryani Bliss' };
const REST_B = { restaurantId: 'rest-b', restaurantName: 'South Kitchen' };

runSuite(suite, async () => {
  const reset = () => cartStore.clear();

  await suite.test('starts empty with a safe default bill', () => {
    reset();
    assert.deepEqual(cartStore.getItems(), []);
    assert.equal(cartStore.getRestaurantId(), null);
    assert.equal(cartStore.getRestaurantName(), null);
    assert.equal(cartStore.getSubtotalPaise(), 0);
    // Empty cart still quotes the platform delivery + convenience fee.
    assert.deepEqual(cartStore.getTotals(), calculateOrderTaxBreakdown(0));
  });

  await suite.test('adds items and accumulates subtotal in integer paise', () => {
    reset();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A });
    cartStore.addItem({ dishId: 'd2', name: 'Raita', pricePaise: 6000, isVeg: true, ...REST_A });
    assert.equal(cartStore.getItems().length, 2);
    assert.equal(cartStore.getItemQuantity('d1'), 1);
    assert.equal(cartStore.getSubtotalPaise(), 38000);
    assert.equal(cartStore.getRestaurantId(), 'rest-a');
    assert.deepEqual(cartStore.getTotals(), calculateOrderTaxBreakdown(38000));
  });

  await suite.test('adding the same dish increments quantity instead of duplicating', () => {
    reset();
    const item = { dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A };
    cartStore.addItem(item);
    cartStore.addItem(item);
    cartStore.addItem(item);
    assert.equal(cartStore.getItems().length, 1);
    assert.equal(cartStore.getItemQuantity('d1'), 3);
    assert.equal(cartStore.getSubtotalPaise(), 96000);
  });

  await suite.test('switching restaurant discards the previous cart', () => {
    reset();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A });
    cartStore.addItem({ dishId: 'd9', name: 'Dosa', pricePaise: 14000, isVeg: true, ...REST_B });
    assert.equal(cartStore.getItems().length, 1);
    assert.equal(cartStore.getRestaurantId(), 'rest-b');
    assert.equal(cartStore.getSubtotalPaise(), 14000);
  });

  await suite.test('removeItem decrements then drops the line', () => {
    reset();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A });
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A });
    cartStore.removeItem('d1');
    assert.equal(cartStore.getItemQuantity('d1'), 1);
    cartStore.removeItem('d1');
    assert.equal(cartStore.getItemQuantity('d1'), 0);
    assert.equal(cartStore.getItems().length, 0);
  });

  await suite.test('emptying the cart clears the restaurant context', () => {
    reset();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A });
    cartStore.removeItem('d1');
    assert.equal(cartStore.getRestaurantId(), null);
    assert.equal(cartStore.getRestaurantName(), null);
  });

  await suite.test('removing an unknown dish is a no-op', () => {
    reset();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A });
    cartStore.removeItem('missing');
    assert.equal(cartStore.getItemQuantity('d1'), 1);
  });

  await suite.test('subscribers are notified on every mutation and can unsubscribe', () => {
    reset();
    let notifications = 0;
    const unsubscribe = cartStore.subscribe(() => {
      notifications += 1;
    });
    const item = { dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A };
    cartStore.addItem(item);
    cartStore.addItem(item);
    cartStore.removeItem('d1');
    assert.equal(notifications, 3);
    unsubscribe();
    cartStore.clear();
    assert.equal(notifications, 3);
  });

  await suite.test('getItems returns a defensive copy', () => {
    reset();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A });
    const snapshot = cartStore.getItems();
    snapshot.push({ lineId: 'hacked', dishId: 'hacked', name: 'Free Food', pricePaise: 0, quantity: 99, isVeg: true, ...REST_A });
    assert.equal(cartStore.getItems().length, 1);
  });

  await suite.test('explicit quantity and lineId are honoured', () => {
    reset();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A, quantity: 3 });
    assert.equal(cartStore.getItemQuantity('d1'), 3);
    assert.equal(cartStore.getSubtotalPaise(), 96000);
    cartStore.clear();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A, lineId: 'custom-line', quantity: 2 });
    assert.equal(cartStore.getItems()[0].lineId, 'custom-line');
    assert.equal(cartStore.getItemQuantity('custom-line'), 2);
  });

  await suite.test('same dish with different customizations splits into lines', () => {
    reset();
    const half = { variantId: 'half', addOns: [] };
    const full = { variantId: 'full', addOns: [] };
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 18000, isVeg: false, ...REST_A, customization: half });
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A, customization: full });
    assert.equal(cartStore.getItems().length, 2);
    assert.equal(cartStore.getDishTotalQuantity('d1'), 2);
    assert.equal(cartStore.getDishLines('d1').length, 2);
    const last = cartStore.getLastCustomization('d1');
    assert.equal(last?.customization?.variantId, 'full');
  });

  await suite.test('removeDish drops every line and clears context', () => {
    reset();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A, customization: { variantId: 'half', addOns: [] } });
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A, customization: { variantId: 'full', addOns: [] } });
    cartStore.addItem({ dishId: 'd2', name: 'Raita', pricePaise: 6000, isVeg: true, ...REST_A });
    cartStore.removeDish('d1');
    assert.deepEqual(cartStore.getDishLines('d1'), []);
    assert.equal(cartStore.getLastCustomization('d1'), null);
    assert.equal(cartStore.getRestaurantId(), 'rest-a');
    cartStore.removeDish('d2');
    assert.equal(cartStore.getRestaurantId(), null);
    assert.equal(cartStore.getRestaurantName(), null);
  });

  await suite.test('removeItem prefers lineId over dishId', () => {
    reset();
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 18000, isVeg: false, ...REST_A, customization: { variantId: 'half', addOns: [] } });
    cartStore.addItem({ dishId: 'd1', name: 'Biryani', pricePaise: 32000, isVeg: false, ...REST_A, customization: { variantId: 'full', addOns: [] } });
    const lines = cartStore.getDishLines('d1');
    assert.equal(lines.length, 2);
    cartStore.removeItem(lines[0].lineId);
    assert.equal(cartStore.getDishLines('d1').length, 1);
    assert.equal(cartStore.getDishLines('d1')[0].customization?.variantId, 'full');
  });

  await suite.test('double unsubscribe and clear-on-empty are safe', () => {
    reset();
    let notifications = 0;
    const unsubscribe = cartStore.subscribe(() => {
      notifications += 1;
    });
    unsubscribe();
    unsubscribe();
    cartStore.clear();
    assert.equal(notifications, 0);
    assert.equal(cartStore.getLastCustomization('ghost'), null);
    assert.equal(cartStore.getDishTotalQuantity('ghost'), 0);
  });
});
