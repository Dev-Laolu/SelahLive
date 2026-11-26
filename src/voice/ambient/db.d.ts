export function getKey(store: string, key: string, fallback?: unknown): Promise<unknown>;
export function setKey(store: string, key: string, value: unknown): Promise<void>;
export function delKey(store: string, key: string): Promise<void>;
