import { prisma } from '../utils/prisma.js';

/**
 * The frontend stores categories as a flat JSON string in kv_store.
 * The actual format used by the HTML is:
 *
 * [
 *   { "id": "cat_xxx", "name": "...", "subs": [
 *     { "id": "sub_xxx", "name": "...", "subsubs": [
 *       { "id": "ssc_xxx", "name": "..." }
 *     ]}
 *   ]}
 * ]
 *
 * Rather than mapping this to a relational categories table with UUIDs
 * (which the HTML IDs are not), we store the full JSON as-is in kv_store
 * under the key "categories-data". This is the simplest correct approach
 * that preserves the frontend's exact data shape.
 *
 * The `categories` table in Prisma is kept for future use but is not
 * used here since the frontend's ID scheme is incompatible with UUID PKs.
 */

const CATEGORIES_KEY = 'categories-data';

/**
 * GET categories-data — return the raw JSON stored in kv_store.
 */
export async function categoriesGet(): Promise<{ value: string | null }> {
  const kv = await prisma.kvStore.findUnique({
    where: { key: CATEGORIES_KEY },
  });
  return { value: kv?.value ?? null };
}

/**
 * SET categories-data — store the raw JSON in kv_store.
 * Validates it's a valid JSON array before storing.
 */
export async function categoriesSet(value: string): Promise<{ success: true } | { error: string }> {
  // Validate it's a valid JSON array
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { error: 'Invalid JSON for categories-data' };
  }

  if (!Array.isArray(parsed)) {
    return { error: 'categories-data must be a JSON array' };
  }

  await prisma.kvStore.upsert({
    where: { key: CATEGORIES_KEY },
    update: { value },
    create: { key: CATEGORIES_KEY, value },
  });

  return { success: true };
}

/**
 * DELETE categories-data — remove from kv_store.
 */
export async function categoriesDelete(): Promise<{ success: true }> {
  await prisma.kvStore.deleteMany({ where: { key: CATEGORIES_KEY } });
  return { success: true };
}
