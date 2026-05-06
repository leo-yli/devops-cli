import Keyv from 'keyv';
import { join } from 'path';
import { homedir } from 'os';

const CACHE_PATH = join(homedir(), '.dops', 'cache.sqlite');

const cache = new Keyv(`sqlite://${CACHE_PATH}`, { namespace: 'dops' });

cache.on('error', (err) => {
  console.error('Cache error:', err);
});

export { cache };

export async function getCached<T>(key: string, ttlMs: number = 60000): Promise<T | undefined> {
  const value = await cache.get(key);
  if (value) {
    return value as T;
  }
  return undefined;
}

export async function setCached<T>(key: string, value: T, ttlMs?: number): Promise<void> {
  await cache.set(key, value, ttlMs);
}

export async function clearCache(): Promise<void> {
  await cache.clear();
}
