import type { Pool } from 'pg';

/** Keep lazy initialization without changing the receiver of stateful pg methods. */
export function createLazyPool(resolve: () => Pool): Pool {
  return new Proxy({} as Pool, {
    get(_target, property) {
      const instance = resolve();
      const value: unknown = Reflect.get(instance, property, instance);
      return typeof value === 'function' ? value.bind(instance) : value;
    },
  });
}
