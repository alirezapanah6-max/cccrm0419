# Implementation Plan: Node.js Backend

## Overview

Replace the Next.js framework with a standalone Express.js/TypeScript backend that replicates the Google Apps Script storage API contract. The implementation follows an incremental approach: project setup → database schema → core storage API → authentication → specialized key handlers → RBAC → validation/security → export → static serving → Docker → tests.

## Tasks

- [x] 1. Project setup — Strip Next.js, configure Express/TypeScript
  - [x] 1.1 Remove Next.js and configure Express project structure
    - Remove `next.config.ts`, `next-env.d.ts`, Next.js app directory (`src/app/`)
    - Remove `next`, `next-auth`, `react`, `react-dom`, `@tailwindcss/postcss`, `tailwindcss`, `postcss.config.mjs`, `eslint-config-next` from dependencies
    - Install `express`, `cookie-parser`, `jsonwebtoken`, `express-rate-limit`, `helmet` and their `@types/*` devDependencies
    - Install `supertest` and `@types/supertest` as devDependencies for HTTP testing
    - Create `server/` directory structure: `server/app.ts`, `server/index.ts`, `server/routes/`, `server/handlers/`, `server/middleware/`, `server/utils/`
    - Update `package.json` scripts: `"dev": "tsx watch server/index.ts"`, `"build": "tsc -p tsconfig.server.json"`, `"start": "node dist/server/index.js"`
    - Create `tsconfig.server.json` extending base tsconfig with `outDir: "./dist"`, `rootDir: "."`, targeting ES2022/Node
    - _Requirements: 5.4, 10.1_

  - [x] 1.2 Create Express application entry point (`server/app.ts` and `server/index.ts`)
    - Configure middleware stack in order: `express.urlencoded({ extended: false, limit: '1mb' })`, `express.json({ limit: '1mb' })`, `cookieParser()`, CORS (same-origin), static file serving
    - `server/index.ts` starts the server on `process.env.PORT || 3000` with database connection retry logic (exponential backoff: 1s, 2s, 4s, 8s, 16s — max 5 attempts)
    - Export `app` from `server/app.ts` for testing with supertest
    - _Requirements: 1.1, 5.4, 10.6, 11.4, 11.6_

- [x] 2. Database schema — Prisma models
  - [x] 2.1 Update Prisma schema with `kv_store` model and verify existing models
    - Add `KvStore` model: `key String @id @db.VarChar(500)`, `value String @db.Text`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
    - Verify existing `users`, `calls`, `categories`, `call_logs` models match the design's field requirements
    - Ensure `users` table has: `id`, `username`, `displayName`, `passwordHash`, `role` (enum: admin, agent), `isActive`, `createdAt`
    - Ensure `calls` table has: `id`, `date`, `phone`, `customerName`, `category`, `subCategory`, `subSubCategory`, `status`, `description`, `agentId`, `agentName`, `followupRootId`, `createdAt`, `updatedAt`
    - Ensure `call_logs` table has: `id`, `callId`, `action`, `userId`, `username`, `changes`, `createdAt`
    - Generate a new migration and run `npx prisma generate`
    - _Requirements: 1.3, 6.3, 6.4, 7.1, 8.1_

  - [x] 2.2 Create Prisma client singleton (`server/utils/prisma.ts`)
    - Export a singleton PrismaClient instance for use across the application
    - Include a `disconnect()` helper for graceful shutdown
    - _Requirements: 10.4, 10.5_

- [x] 3. Core storage API — kv_store fallback handler and routing
  - [x] 3.1 Implement kv_store fallback handler (`server/handlers/kv.handler.ts`)
    - Implement `get`: query `kv_store` by key, return `{ value }` or `{ value: null }`
    - Implement `set`: upsert key-value pair in `kv_store`, return `{ success: true }`
    - Implement `delete`: delete key from `kv_store` (no error if missing), return `{ success: true }`
    - Implement `list`: query `kv_store` where key starts with prefix, return `{ items: [{key, value}] }`
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [x] 3.2 Implement Key Router (`server/routes/storage.ts`)
    - Create `POST /api/storage` route that parses `action`, `key`, `value`, `prefix` from the urlencoded body
    - Validate `action` is one of `get`, `set`, `delete`, `list` — return 400 for unknown actions
    - Validate `key` is present for get/set/delete actions — return 400 if missing
    - Validate `value` is present for set action — return 400 if missing
    - Dispatch to appropriate handler based on key/prefix pattern: `users-data` → users handler, `categories-data` → categories handler, `call:*` → calls handler, `session` → return null, default → kv_store handler
    - Wrap all handlers in try/catch; return 500 with `{ error: "Internal server error" }` on database errors
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 4. Authentication — login, register, JWT, cookie, middleware
  - [x] 4.1 Implement auth utilities (`server/utils/auth.ts`)
    - `hashPassword(plain: string): Promise<string>` — bcrypt hash with cost factor 12
    - `verifyPassword(plain: string, hash: string): Promise<boolean>` — bcrypt compare
    - `verifySha256Migration(sha256Hash: string, stored: string): Promise<boolean>` — verify old SHA-256 hash, re-hash with bcrypt
    - `signToken(payload: { userId, username, role }): string` — JWT sign with `process.env.JWT_SECRET`, 7-day expiry
    - `verifyToken(token: string): JwtPayload | null` — JWT verify, return null on failure
    - _Requirements: 2.1, 2.2, 2.5_

  - [x] 4.2 Implement auth routes (`server/routes/auth.ts`)
    - `POST /api/auth/login`: accept `{ username, password }`, validate against DB, handle SHA-256 migration, set HttpOnly cookie with JWT, return `{ success, user: { id, username, displayName, role } }`
    - `POST /api/auth/register`: only allowed in bootstrap mode (no users exist) or by authenticated admin; create user with bcrypt hash, assign admin role in bootstrap mode
    - `POST /api/auth/logout`: clear the session cookie
    - Return generic error message for invalid credentials (no username/password distinction)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4_

  - [x] 4.3 Implement auth middleware (`server/middleware/auth.middleware.ts`)
    - Extract JWT from HttpOnly cookie (`token` cookie) OR `Authorization: Bearer <token>` header
    - Verify token, attach user payload (`{ userId, username, role }`) to `req.user`
    - Skip auth for: `GET /api/health`, `POST /api/auth/login`, `POST /api/auth/register` (in bootstrap mode)
    - Return 401 `{ error: "Authentication required" }` for missing/invalid tokens
    - Check if user is still active in DB (handle deactivated users)
    - _Requirements: 2.4, 8.3, 9.5_

- [x] 5. Checkpoint — Verify core storage and auth
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Key handlers — Specialized data handlers
  - [x] 6.1 Implement users-data handler (`server/handlers/users.handler.ts`)
    - `get`: query all users from DB, serialize to frontend format (JSON array), replace `passwordHash` with `"***"` placeholder
    - `set`: parse user array from value JSON, validate fields, upsert users in DB with bcrypt hashing for any new/changed passwords
    - Enforce last-admin protection: reject deactivation if it would leave zero active admins
    - _Requirements: 4.2, 8.1, 8.2, 8.4_

  - [x] 6.2 Implement categories-data handler (`server/handlers/categories.handler.ts`)
    - `get`: query categories from DB, reconstruct 3-level tree structure matching frontend format
    - `set`: parse category tree from value JSON, validate max 3 levels, sync to `categories` table (upsert/delete as needed)
    - Preserve call references when categories are deleted (calls store category names as strings)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 6.3 Implement call handlers (`server/handlers/calls.handler.ts`)
    - `get` (key = `call:<id>`): return single call record serialized as JSON value
    - `set` (key = `call:<id>`): validate required fields (date, phone, agentId, status) with Zod, validate `followupRootId` if present (must exist, must not self-reference), persist to `calls` table, create `call_logs` entry
    - `delete` (key = `call:<id>`): soft-delete or remove call record, create audit log entry
    - `list` (prefix = `call:`): return all calls sorted by createdAt desc; for agents, filter to own calls only
    - Handle customer profile queries: filter by phone number, support pagination (default 50, max 100), include summary stats
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 12.1, 12.2, 12.3, 12.4, 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 7. RBAC middleware
  - [x] 7.1 Implement RBAC middleware (`server/middleware/rbac.middleware.ts`)
    - Define permission matrix: which roles can access which key patterns and actions
    - Agent restrictions: cannot write `users-data`, cannot access dashboard/performance data keys
    - Agent call list scoping: automatically filter call lists to agent's own calls
    - Admin: full access to all keys and actions
    - Return 403 `{ error: "Insufficient permissions" }` on violation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 8. Validation and security
  - [x] 8.1 Implement Zod validation schemas (`server/utils/schemas.ts`)
    - `StorageRequestSchema`: validates `action` enum, conditional `key`/`value`/`prefix` requirements
    - `CallRecordSchema`: validates date (ISO format), phone (string), agentId, status (enum), optional fields
    - `UserRecordSchema`: validates username, displayName, role, password requirements
    - `CategoryTreeSchema`: validates recursive tree structure up to 3 levels
    - `LoginSchema`: validates username and password presence
    - `RegisterSchema`: validates username, displayName, password with minimum length
    - _Requirements: 11.1, 11.5_

  - [x] 8.2 Implement validation middleware (`server/middleware/validation.middleware.ts`)
    - Apply Zod schema validation to request body before handler execution
    - On failure: return HTTP 400 with `{ message: "Validation failed", errors: [{ path, message }] }` format
    - _Requirements: 11.1, 11.5_

  - [x] 8.3 Implement rate limiting (`server/middleware/rate-limit.middleware.ts`)
    - Apply `express-rate-limit` to `/api/auth/*` endpoints: 10 requests per minute per IP
    - Return HTTP 429 with `{ error: "Too many requests", retryAfter: <seconds> }` when exceeded
    - _Requirements: 11.2, 11.3_

  - [x] 8.4 Implement input sanitization (`server/utils/sanitize.ts`)
    - `stripHtmlTags(input: string): string` — remove all HTML tags, preserve text content
    - Apply sanitization to all user-provided string values before storage
    - Prisma parameterized queries prevent SQL injection by default
    - _Requirements: 11.7_

- [x] 9. Export endpoint
  - [x] 9.1 Implement CSV export route (`server/routes/export.ts`)
    - `GET /api/export/calls?dateFrom=<ISO>&dateTo=<ISO>` — requires authentication
    - Agent: export only own calls; Admin: export all calls (with date filters)
    - Generate CSV with UTF-8 BOM (U+FEFF) prefix for Persian text compatibility
    - Cap at 50,000 records per export
    - Return header-only CSV when no records match filters
    - Set `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment` headers
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 10. Static file serving and health check
  - [x] 10.1 Implement static file serving and health check route
    - Serve `index.html` at root (`/`) using `express.static` or explicit route
    - Serve `/public/*` files with correct MIME types
    - `GET /api/health`: no auth required, check DB connectivity with 5-second timeout, return `{ status: "healthy" }` or `{ status: "unhealthy" }` with 503
    - Return 404 for unmatched routes
    - _Requirements: 5.1, 5.2, 5.3, 10.4, 10.5_

- [x] 11. Checkpoint — Full API verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Docker configuration
  - [x] 12.1 Update Dockerfile for Express backend
    - Multi-stage build: build stage (compile TypeScript), production stage (minimal Node.js image)
    - Copy compiled JS, prisma schema, package.json, public assets, index.html
    - Entrypoint script: run `npx prisma migrate deploy`, then start server
    - Exit with non-zero code if migration fails
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 12.2 Update docker-compose files
    - `docker-compose.yml`: Express backend service + PostgreSQL, health check on `/api/health`, port 3000
    - `docker-compose.dev.yml`: development mode with volume mounts, hot-reload via tsx watch
    - Set environment variables: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`
    - _Requirements: 10.1, 10.4, 10.5, 10.6_

- [x] 13. Tests
  - [x]* 13.1 Write property tests for storage round-trip (Properties 1, 2, 3)
    - **Property 1: Key-Value Storage Round-Trip** — set then get returns original value
    - **Property 2: Delete Then Get Returns Null** — delete then get returns null
    - **Property 3: List Returns Exactly Prefix-Matched Items** — list returns exactly matching keys
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

  - [x]* 13.2 Write property tests for authentication and RBAC (Properties 4, 5, 6, 7, 8, 14)
    - **Property 4: Password Hashing Round-Trip** — bcrypt verify matches original password
    - **Property 5: Unauthenticated Requests Rejected** — no token → 401
    - **Property 6: Login Error Indistinguishability** — wrong user vs wrong password same response
    - **Property 7: Role-Based Access Control Enforcement** — agent denied restricted keys
    - **Property 8: Agent Call List Scoping** — agent sees only own calls
    - **Property 14: Last Admin Protection** — cannot deactivate last admin
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.6, 4.2, 4.3, 4.4, 4.5, 8.2, 9.5**

  - [x]* 13.3 Write property tests for call validation (Properties 9, 10, 11)
    - **Property 9: Call Record Validation** — missing required fields → 400 with field names
    - **Property 10: Call List Sort Invariant** — calls sorted by createdAt desc
    - **Property 11: Audit Log Completeness** — every call mutation has audit log entry
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.5**

  - [x]* 13.4 Write property tests for categories and follow-ups (Properties 12, 13, 18, 19)
    - **Property 12: Category Tree Round-Trip** — set then get preserves structure
    - **Property 13: Category Deletion Preserves Call References** — calls keep category names
    - **Property 18: Follow-Up Root Validation** — invalid/self-referencing rootId rejected
    - **Property 19: Follow-Up Chain Query Ordering** — chain ordered by createdAt asc
    - **Validates: Requirements 7.1, 7.3, 7.4, 12.1, 12.2, 12.4**

  - [x]* 13.5 Write property tests for export, pagination, sanitization (Properties 15, 16, 17, 20, 21, 22)
    - **Property 15: CSV Export Date Range Filtering** — only records in range exported
    - **Property 16: Validation Error Structure** — failed Zod → 400 with errors array
    - **Property 17: HTML Tag Sanitization** — tags stripped, text preserved
    - **Property 20: Customer Profile Phone Query** — all records for phone, sorted desc
    - **Property 21: Pagination Bounds Enforcement** — page size capped at 100, default 50
    - **Property 22: Customer Profile Summary Accuracy** — computed stats match manual calc
    - **Validates: Requirements 9.3, 11.5, 11.7, 13.1, 13.2, 13.3, 13.5**

  - [x]* 13.6 Write integration tests for auth flow and storage API
    - Test full auth flow: register (bootstrap) → login → use token → logout
    - Test storage API end-to-end through HTTP layer with supertest
    - Test Docker startup with migrations (document-only, not automated)
    - Test health check (healthy and unhealthy scenarios)
    - **Validates: Requirements 1.1, 2.1, 2.3, 3.1, 3.2, 10.4, 10.5**

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The frontend (`index.html`) is never modified — only the backend is implemented
- All code is TypeScript; the project uses Vitest for tests and fast-check for property-based tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["3.1", "4.1", "8.1"] },
    { "id": 5, "tasks": ["3.2", "4.2", "8.4"] },
    { "id": 6, "tasks": ["4.3", "8.2", "8.3"] },
    { "id": 7, "tasks": ["6.1", "6.2", "6.3", "7.1"] },
    { "id": 8, "tasks": ["9.1", "10.1"] },
    { "id": 9, "tasks": ["12.1", "12.2"] },
    { "id": 10, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6"] }
  ]
}
```
