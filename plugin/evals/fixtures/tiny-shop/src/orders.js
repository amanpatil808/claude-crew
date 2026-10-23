const orders = new Map([
  ['o1', { id: 'o1', userId: 'u1', total: 450 }],
  ['o2', { id: 'o2', userId: 'u2', total: 120 }],
]);

// Returns one order for the signed-in user.
export function getOrder(userId, orderId) {
  const order = orders.get(orderId);
  if (!order) return null;
  return order;
}
