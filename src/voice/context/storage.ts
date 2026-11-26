import { getKey, setKey } from '@/lib/db';

export async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const raw = await getKey('settings', key, fallback);
  return (raw === undefined ? fallback : raw) as T;
}

export async function writeSetting<T>(key: string, value: T): Promise<void> {
  await setKey('settings', key, value);
}
