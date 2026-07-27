import { prisma } from '../utils/prisma.js';

/**
 * Get a value from the kv_store by key.
 * Returns the value string or null if key does not exist.
 */
export async function kvGet(key: string): Promise<{ value: string | null }> {
  const record = await prisma.kvStore.findUnique({
    where: { key },
  });
  return { value: record?.value ?? null };
}

/**
 * Set (upsert) a key-value pair in the kv_store.
 * Creates the record if it doesn't exist, updates it if it does.
 */
export async function kvSet(key: string, value: string): Promise<{ success: true }> {
  await prisma.kvStore.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  return { success: true };
}

/**
 * Delete a key from the kv_store.
 * No error is thrown if the key does not exist.
 */
export async function kvDelete(key: string): Promise<{ success: true }> {
  await prisma.kvStore.deleteMany({
    where: { key },
  });
  return { success: true };
}

/**
 * List all key-value pairs whose key starts with the given prefix.
 */
export async function kvList(prefix: string): Promise<{ items: { key: string; value: string }[] }> {
  const records = await prisma.kvStore.findMany({
    where: { key: { startsWith: prefix } },
  });
  const items = records.map((r) => ({ key: r.key, value: r.value }));
  return { items };
}
