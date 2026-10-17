import {AsyncLocalStorage} from 'node:async_hooks';
// Match Next's Node server bootstrap before its storage modules are imported.
(globalThis as typeof globalThis&{AsyncLocalStorage:typeof AsyncLocalStorage}).AsyncLocalStorage=AsyncLocalStorage;
