# Micro-CRM — Project Context

## What This Is
A Call Center CRM panel for Sheypoor's customer support team. Currently a single-file HTML application (`index.html`) that uses Google Apps Script + Google Sheets as its backend.

## Goal
Replace the Google Sheets backend with a proper Node.js API server + database while keeping the HTML frontend **completely untouched** (zero changes to UI/UX/design/structure).

## Architecture Constraint (CRITICAL)
- `index.html` is the **sacred artifact** — its HTML structure, CSS, and UI behavior must NOT be modified
- The only change allowed in `index.html` is swapping the `GAS_URL` to point to the new backend API
- The backend must expose the exact same API contract that the Google Apps Script currently provides

## Current State
- **Frontend**: Single `index.html` file (~6300 lines) with inline CSS + JavaScript
- **Backend**: Google Apps Script web app acting as key-value store on Google Sheets
- **Auth**: Client-side SHA-256 password hashing, users stored in the same Google Sheet
- **Data model**: Key-value storage (`storageGet`, `storageSet`, `storageDelete`, `storageList`)
- **Session**: localStorage-based, per-browser

## What The HTML Does
- Login/Registration (bootstrap mode for first admin, then normal login)
- Call logging (date, phone, customer name, category, subcategory, status, description)
- Call list with filtering, pagination, search
- Customer profile view (by phone number)
- Dashboard with stats (admin only)
- Performance reports (admin only)
- User management (admin: add/edit/deactivate agents)
- Category management (admin: tree of category > subcategory > sub-subcategory)
- Data export to CSV
- Dark mode, Jalali calendar, RTL layout
- Follow-up tracking with aging

## Tech Decisions
- **Runtime**: Node.js
- **Database**: PostgreSQL (already has Prisma setup from previous iteration)
- **Auth**: Server-side (JWT or session-based) — must match the HTML's login flow
- **API style**: REST endpoints that mirror the GAS actions (get, set, delete, list)
- **Deployment**: Docker (docker-compose already exists)

## Roles
- **admin**: Full access (dashboard, performance, user mgmt, category mgmt, all calls)
- **agent**: Can only log calls, see own calls, see customer profiles

## Language
- UI is Persian (Farsi), RTL
- Code and docs in English
- Variable names in English
