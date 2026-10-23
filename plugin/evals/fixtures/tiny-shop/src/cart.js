import { lineTotal, roundRupees } from './price.js';

export function cartTotal(items) {
  return roundRupees(items.reduce((sum, item) => sum + lineTotal(item), 0));
}

// Discount is a fraction (0.1 = 10%). Business rule: never more than 50%.
export function applyDiscount(total, discount) {
  return roundRupees(total * (1 - discount));
}
