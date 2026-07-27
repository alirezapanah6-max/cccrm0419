# Micro-CRM — Conventions

## Code Style
- TypeScript for all backend code
- ESLint for linting
- Prettier conventions (no explicit config needed — follow existing patterns)

## Project Structure
```
/
├── index.html          ← NEVER MODIFY (served as static file)
├── docs/               ← Project documentation, stakeholder docs
├── server/             ← Node.js backend source
│   ├── routes/         ← API route handlers
│   ├── middleware/     ← Auth, validation, error handling
│   ├── models/         ← Database models / Prisma schema
│   └── utils/          ← Shared utilities
├── prisma/             ← Prisma schema + migrations
├── docker-compose.yml  ← Production docker setup
├── package.json        ← Dependencies and scripts
└── .kiro/              ← Kiro config (steering, specs)
```

## API Design Rules
- All endpoints under `/api/` prefix
- JSON request/response bodies
- Standard HTTP status codes
- Auth via session cookie or Authorization header (Bearer token)
- The storage API (`/api/storage`) must match the GAS contract exactly:
  - `POST /api/storage` with `action=get|set|delete|list`
  - Same request/response shape as the GAS web app

## Database
- PostgreSQL via Prisma ORM
- Migrations tracked in `prisma/migrations/`
- Seed script for initial data: `prisma/seed.ts`

## Testing
- Vitest for unit and integration tests
- fast-check for property-based tests
- Test files: `*.test.ts` or `*.spec.ts`

## Docker
- Multi-stage build for production image
- `docker-compose.dev.yml` for local development (includes PostgreSQL)
- `docker-compose.yml` for production

## Security
- Passwords: bcrypt hashing (server-side) — migrate from SHA-256 client-side hashing
- CORS: allow only the served origin
- Rate limiting on auth endpoints
- Input validation via Zod schemas
