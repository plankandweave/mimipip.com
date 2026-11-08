/** Buckets share infrastructure, never names or objects, with another brand. */
export function mimiBucket(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid storage bucket.');
  return name.startsWith('mimipip-') ? name : `mimipip-${name}`;
}
export function isolatedStorage<T extends { from(name: string): unknown }>(storage: T): T {
  return new Proxy(storage, {
    get(target, prop) {
      if (prop === 'from') return (name: string) => target.from(mimiBucket(name));
      // Bucket administration is done by reviewed migrations, never storefront APIs.
      throw new Error('Storage administration is unavailable to the storefront.');
    },
  });
}
export function isolatedStorageClient<T extends { storage: { from(name: string): unknown } }>(client: T): T {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'storage') return isolatedStorage(target.storage);
      const value=Reflect.get(target,prop,target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
