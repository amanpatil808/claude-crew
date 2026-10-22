// Prices are whole rupees; rounding happens once, at the total.
export function lineTotal(item) {
  return item.price * item.qty;
}

export function roundRupees(amount) {
  return Math.round(amount);
}
