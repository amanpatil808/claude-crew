import { lineTotal } from './price.js';

// Exports orders as CSV, one row per order.
export function toCsv(orders) {
  const rows = orders.map((o) => `${o.id},${o.total}`);
  return ['id,total', ...rows].join('\n');
}

export function itemsCsv(items) {
  return items.map((i) => `${i.name},${lineTotal(i)}`).join('\n');
}
