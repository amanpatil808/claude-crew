import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cartTotal, applyDiscount } from '../src/cart.js';

test('cart total sums every line', () => {
  assert.equal(cartTotal([{ price: 100, qty: 2 }, { price: 50, qty: 1 }]), 250);
});

test('a 10% discount takes 10% off', () => {
  assert.equal(applyDiscount(200, 0.1), 180);
});

test('discount is capped at 50%', () => {
  assert.equal(applyDiscount(100, 0.8), 50);
});

test.skip('totals are formatted as rupees', () => {});
