import { z } from 'zod';

/**
 * Storage API request body validation.
 *
 * The combination of required fields depends on the action:
 * - get/delete: key is required
 * - set: key and value are required
 * - list: prefix is optional
 *
 * Conditional validation is handled at the router level;
 * this schema validates the shape loosely.
 */
export const StorageRequestSchema = z.object({
  action: z.enum(['get', 'set', 'delete', 'list']),
  key: z.string().optional(),
  value: z.string().optional(),
  prefix: z.string().optional(),
});

export type StorageRequest = z.infer<typeof StorageRequestSchema>;

/**
 * Call record validation (parsed from the JSON value of a `call:*` key).
 *
 * Required: id, date, phone, status, agentId, agentName
 * Optional: customerName, category, subCategory, subSubCategory, description,
 *           followupRootId (nullable), createdAt, updatedAt
 */
export const CallRecordSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid ISO date (YYYY-MM-DD)'),
  phone: z.string().regex(/^\d+$/, 'Must contain only digits').max(11, 'Must be at most 11 characters'),
  customerName: z.string().optional(),
  category: z.string().optional(),
  subCategory: z.string().optional(),
  subSubCategory: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'escalated', 'resolved', 'closed']),
  description: z.string().optional(),
  agentId: z.string(),
  agentName: z.string(),
  followupRootId: z.string().nullable().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export type CallRecord = z.infer<typeof CallRecordSchema>;

/**
 * Login request validation.
 */
export const LoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginRequest = z.infer<typeof LoginSchema>;

/**
 * Registration request validation.
 */
export const RegisterSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100, 'Username must be at most 100 characters'),
  displayName: z.string().min(1, 'Display name is required').max(200, 'Display name must be at most 200 characters'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
});

export type RegisterRequest = z.infer<typeof RegisterSchema>;

/**
 * Category node — recursive structure up to 3 levels deep.
 *
 * Level 3 nodes have an empty children array (no deeper nesting).
 */
const CategoryLevel3Schema = z.object({
  id: z.string(),
  name: z.string(),
  children: z.array(z.never()).default([]),
});

const CategoryLevel2Schema = z.object({
  id: z.string(),
  name: z.string(),
  children: z.array(CategoryLevel3Schema).default([]),
});

const CategoryLevel1Schema = z.object({
  id: z.string(),
  name: z.string(),
  children: z.array(CategoryLevel2Schema).default([]),
});

/**
 * Category tree — array of top-level categories (max 3 levels).
 */
export const CategoryTreeSchema = z.array(CategoryLevel1Schema);

export type CategoryTree = z.infer<typeof CategoryTreeSchema>;
