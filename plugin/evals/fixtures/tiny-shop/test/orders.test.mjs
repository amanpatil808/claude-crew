import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOrder } from '../src/orders.js';

test('a user can read their own order', () => {
  assert.equal(getOrder('u1', 'o1').total, 450);
});
