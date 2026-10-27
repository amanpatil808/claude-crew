// Plain JSON records keyed by names from outside (project folders, task ids). `o[k] = v` with k = "__proto__"
// replaces the object's prototype instead of adding a key, so that project would silently vanish from the page.
// Plain {} objects are kept (not Object.create(null)), so the records still compare and print as ordinary objects.

// Sets `k` as an own, enumerable data property, whatever its name.
export function putOwn<T>(o: Record<string, T>, k: string, v: T): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

// Reads an own property only: an inherited one ("__proto__", "constructor") is not a record.
export const getOwn = <T>(o: Record<string, T>, k: string): T | undefined => (Object.hasOwn(o, k) ? o[k] : undefined);
