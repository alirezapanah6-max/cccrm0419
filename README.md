# Micro CRM شیپور

سیستم مدیریت ارتباط با مشتری (CRM) مرکز تماس شیپور — یک اپلیکیشن Full-stack برای ثبت، پیگیری و گزارش‌گیری تماس‌های پشتیبانی.

A full-stack Call Center CRM for Sheypoor, built for registering, tracking, and reporting support calls with Persian (Jalali) calendar, RTL layout, and multi-user concurrent access.

## فناوری‌ها / Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16.x |
| Language | TypeScript | 5.x |
| Runtime | React | 19.x |
| Database | PostgreSQL | 17 |
| ORM | Prisma | 7.x |
| Auth | Auth.js (NextAuth v5) | 5.x |
| UI | Tailwind CSS 4 + Custom Components | 4.x |
| Charts | Recharts | latest |
| Calendar | jalaali-js | latest |
| Validation | Zod | latest |
| Testing | Vitest + fast-check | latest |
| Container | Docker + Docker Compose | latest |

## پیش‌نیازها / Prerequisites

- Node.js 22+
- Docker & Docker Compose
- npm 10+

## شروع سریع / Quick Start

### 1. Clone and install

```bash
git clone <repository-url>
cd micro-crm
cp .env.example .env
```

### 2. Start database (development)

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run migrations

```bash
npx prisma migrate deploy
```

### 5. (Optional) Seed database

```bash
npm run prisma:seed
```

### 6. Start development server

```bash
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

On first visit, you'll be prompted to create the initial admin account (bootstrap flow).

## متغیرهای محیطی / Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/microcrm?schema=public` |
| `AUTH_SECRET` | Auth.js secret key (generate with `openssl rand -base64 32`) | — |
| `NEXTAUTH_URL` | Application base URL | `http://localhost:3000` |
| `NODE_ENV` | Environment mode | `development` |
| `POSTGRES_USER` | Docker PostgreSQL user | `postgres` |
| `POSTGRES_PASSWORD` | Docker PostgreSQL password | `postgres` |
| `POSTGRES_DB` | Docker PostgreSQL database name | `microcrm` |

## استقرار با Docker / Docker Deployment

### Production (single command)

```bash
docker compose up --build
```

This starts both the Next.js app (port 3000) and PostgreSQL (port 5432) in production mode.

### Development (database only)

```bash
docker compose -f docker-compose.dev.yml up -d
```

## دستورات توسعه / Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Turbopack) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking |
| `npm run test` | Run unit and property-based tests |
| `npx prisma migrate dev` | Create new migration |
| `npx prisma migrate deploy` | Apply migrations |
| `npx prisma studio` | Open Prisma Studio (DB GUI) |
| `npm run prisma:seed` | Seed database with initial data |

## ساختار پروژه / Project Structure

```
micro-crm/
├── docker-compose.yml          # Production deployment
├── docker-compose.dev.yml      # Development (DB only)
├── Dockerfile                  # Multi-stage production build
├── .env.example                # Environment variables template
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts            # Test configuration
├── prisma/
│   ├── schema.prisma           # Database schema
│   ├── migrations/             # SQL migrations
│   └── seed.ts                 # Database seeding
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout (RTL, font, theme)
│   │   ├── login/              # Login page
│   │   ├── (authenticated)/    # Protected routes
│   │   │   ├── calls/          # Call registration & list
│   │   │   ├── customers/      # Customer profiles
│   │   │   ├── dashboard/      # Analytics dashboard
│   │   │   ├── performance/    # Agent performance
│   │   │   ├── settings/       # Categories & users management
│   │   │   └── account/        # Password change
│   │   └── api/                # API routes
│   ├── components/
│   │   ├── layout/             # Sidebar, Topbar, ThemeToggle
│   │   ├── calls/              # Call form, table, follow-up
│   │   ├── customers/          # Customer timeline, search
│   │   ├── dashboard/          # Charts, stat cards
│   │   ├── filters/            # Date pickers, multi-select
│   │   └── shared/             # Modal, Toast, Pagination
│   ├── lib/                    # Utilities (prisma, auth, jalali, validators)
│   ├── hooks/                  # Custom React hooks
│   └── types/                  # TypeScript type definitions
├── tests/
│   └── unit/                   # Unit & property-based tests
└── public/
    └── fonts/                  # Vazirmatn font files
```

## ویژگی‌ها / Features

- ثبت و مدیریت تماس‌ها با تقویم جلالی
- زنجیره پیگیری (Follow-up chains) با لینک خودکار
- پروفایل مشتری با تاریخچه تماس‌ها
- داشبورد تحلیلی با نمودارهای تعاملی
- گزارش عملکرد کارشناسان
- مدیریت دسته‌بندی‌ها (3 سطحی)
- مدیریت کاربران با نقش‌های ادمین/کارشناس
- خروجی CSV
- حالت تاریک/روشن
- طراحی واکنش‌گرا (Responsive) — موبایل تا نمایشگرهای عریض
- لاگ تغییرات (Audit trail)

## License

Private — Sheypoor © 2024
