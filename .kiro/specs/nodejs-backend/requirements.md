# Requirements Document

## Introduction

This document defines the requirements for building a Node.js backend that replaces the Google Apps Script + Google Sheets backend of the Micro-CRM application. The backend must expose a storage API fully compatible with the existing frontend's contract (get, set, delete, list actions via POST), serve the HTML frontend as a static file, and implement server-side authentication with bcrypt password hashing. The existing `index.html` remains untouched except for changing the `GAS_URL` constant to the new backend endpoint.

## Glossary

- **Backend**: The Node.js/TypeScript server application that handles API requests, authentication, and database operations
- **Frontend**: The single-file HTML application (`index.html`) that communicates with the Backend via the Storage_API
- **Storage_API**: The REST endpoint (`POST /api/storage`) that accepts `action`, `key`, `value`, and `prefix` parameters, replicating the Google Apps Script contract
- **GAS_Contract**: The existing API interface defined by the Google Apps Script web app — four actions: `get`, `set`, `delete`, `list` via POST with URLSearchParams body
- **Bootstrap_Mode**: The initial state when no users exist; the first registered user automatically becomes an admin
- **Admin**: A user with the `admin` role who has full access to all features including dashboard, performance reports, user management, and category management
- **Agent**: A user with the `agent` role who can log calls, view own calls, and view customer profiles
- **Session**: A server-side session or token that authenticates a user after login, stored client-side in localStorage
- **Prisma**: The ORM used to interact with the PostgreSQL database
- **Call_Record**: A database entry representing a logged customer call with metadata (date, phone, customer name, category hierarchy, status, description, agent)
- **Category_Tree**: A hierarchical structure of up to three levels (category > subcategory > sub-subcategory) used to classify calls

## Requirements

### Requirement 1: Storage API Compatibility

**User Story:** As a frontend developer, I want the backend to expose the same API contract as the Google Apps Script, so that the existing HTML frontend works without modification.

#### Acceptance Criteria

1. THE Backend SHALL expose a `POST /api/storage` endpoint that accepts `application/x-www-form-urlencoded` request bodies with fields: `action`, `key`, `value`, `prefix`, and SHALL return responses with `Content-Type: application/json` and HTTP status 200 for all successful operations
2. WHEN `action=get` is received with a `key` field, THE Storage_API SHALL return a JSON response with a `value` property containing the stored string value for that key, or `null` if the key does not exist
3. WHEN `action=set` is received with `key` and `value` fields, THE Storage_API SHALL persist the key-value pair to the database and return a JSON response with `{success: true}`
4. WHEN `action=delete` is received with a `key` field, THE Storage_API SHALL remove the key from the database and return a JSON response with `{success: true}`, regardless of whether the key previously existed
5. WHEN `action=list` is received with a `prefix` field, THE Storage_API SHALL return a JSON response with an `items` array containing objects with `key` and `value` properties for all keys whose key string starts with the given prefix
6. IF an unknown action is received, THEN THE Storage_API SHALL return a JSON response with an `error` property describing the invalid action and HTTP status 400
7. IF a database error occurs during any storage operation, THEN THE Storage_API SHALL return a JSON response with an `error` property and HTTP status 500
8. IF `action=get`, `action=set`, or `action=delete` is received without a `key` field or with an empty `key` field, THEN THE Storage_API SHALL return a JSON response with an `error` property indicating the missing key and HTTP status 400
9. IF `action=set` is received without a `value` field, THEN THE Storage_API SHALL return a JSON response with an `error` property indicating the missing value and HTTP status 400

### Requirement 2: Server-Side Authentication

**User Story:** As a system administrator, I want authentication handled server-side with bcrypt hashing, so that passwords are stored securely instead of using client-side SHA-256.

#### Acceptance Criteria

1. THE Backend SHALL hash passwords using bcrypt before storing them in the database
2. WHEN a login request is received (via `storageSet` of the session key or a dedicated auth endpoint), THE Backend SHALL verify the provided password against the stored bcrypt hash
3. THE Backend SHALL issue a session token upon successful authentication that the frontend stores in localStorage
4. WHEN a Storage_API request is received without a valid session token, THE Backend SHALL reject the request with an appropriate error response
5. THE Backend SHALL provide a password migration path that accepts SHA-256 hashed passwords from existing users and re-hashes them with bcrypt on first login
6. IF an invalid username or password is provided during login, THEN THE Backend SHALL return a generic error message without revealing which field is incorrect

### Requirement 3: Bootstrap Mode Registration

**User Story:** As a new system deployer, I want the first registered user to automatically become an admin, so that initial system setup requires no manual database intervention.

#### Acceptance Criteria

1. WHILE no users exist in the database, THE Backend SHALL allow registration without authentication (bootstrap mode)
2. WHEN the first user registers during Bootstrap_Mode, THE Backend SHALL assign the `admin` role to that user
3. WHEN a user attempts to register after Bootstrap_Mode has ended, THE Backend SHALL reject the registration unless the requester is an authenticated Admin
4. THE Backend SHALL store the new user with fields: id, username, displayName, passwordHash (bcrypt), role, isActive, createdAt

### Requirement 4: Role-Based Access Control

**User Story:** As a system administrator, I want role-based access control enforced server-side, so that agents cannot access admin-only features.

#### Acceptance Criteria

1. THE Backend SHALL enforce two roles: `admin` and `agent`
2. WHEN an Agent attempts to access user management data (keys prefixed with `users-data`), THE Backend SHALL deny the write operation unless the Agent is updating their own profile
3. WHEN an Agent attempts to list all calls, THE Backend SHALL filter results to return only calls belonging to that Agent
4. THE Backend SHALL allow Admin users full read and write access to all storage keys
5. WHEN an Agent attempts to access dashboard or performance report data, THE Backend SHALL deny the request

### Requirement 5: Static File Serving

**User Story:** As an end user, I want to access the CRM panel through the same server that provides the API, so that deployment is simple with a single service.

#### Acceptance Criteria

1. WHEN a GET request is made to the root URL path (`/`), THE Backend SHALL respond with the `index.html` file and HTTP status 200
2. WHEN a GET request is made for a file that exists in the `/public` directory, THE Backend SHALL serve the file with the correct MIME content-type header and HTTP status 200
3. WHEN a request is made to a path that does not match any defined API route or static file, THE Backend SHALL respond with HTTP status 404
4. THE Backend SHALL serve both the frontend pages and the API routes from a single server process on a single port

### Requirement 6: Call Record Management

**User Story:** As a call center agent, I want to log, view, edit, and search calls, so that customer interactions are tracked.

#### Acceptance Criteria

1. WHEN `action=set` is received with a key prefixed with `call:`, THE Storage_API SHALL validate that the value contains required fields (date, phone, agentId, status) before persisting
2. WHEN `action=list` is received with `prefix=call:`, THE Storage_API SHALL return call records sorted by creation date (newest first)
3. THE Backend SHALL store Call_Record data in the PostgreSQL `calls` table using the Prisma schema
4. WHEN a call record is created or updated, THE Backend SHALL log the change in the `call_logs` audit table with the acting user's identity
5. IF a call record fails validation, THEN THE Backend SHALL return a JSON error response describing which fields are invalid

### Requirement 7: Category Management

**User Story:** As an admin, I want to manage the category hierarchy, so that calls can be properly classified.

#### Acceptance Criteria

1. WHEN `action=set` is received with key `categories-data`, THE Backend SHALL validate and persist the Category_Tree to the `categories` table
2. THE Backend SHALL support up to three levels of category hierarchy (category > subcategory > sub-subcategory)
3. WHEN `action=get` is received with key `categories-data`, THE Backend SHALL return the full category tree as a JSON structure compatible with the frontend's expected format
4. WHEN an Admin deletes a category, THE Backend SHALL preserve existing call records that reference the deleted category (soft reference via name fields)

### Requirement 8: User Management

**User Story:** As an admin, I want to create, edit, and deactivate user accounts, so that team membership is controlled.

#### Acceptance Criteria

1. WHEN an Admin stores user data via `action=set` with key `users-data`, THE Backend SHALL validate and persist user records to the `users` table
2. THE Backend SHALL prevent deactivation of the last remaining active Admin account
3. WHEN a user is deactivated, THE Backend SHALL invalidate any active sessions for that user
4. THE Backend SHALL allow Admins to reset passwords for other users, storing the new password with bcrypt hashing

### Requirement 9: Data Export

**User Story:** As an admin, I want to export call data to CSV, so that I can analyze data externally.

#### Acceptance Criteria

1. WHEN a CSV export is requested, THE Backend SHALL generate a CSV file containing call records with UTF-8 encoding and BOM (U+FEFF) prefix for Persian text compatibility, limited to a maximum of 50,000 records per export
2. IF the requesting user has the "agent" role, THEN THE Backend SHALL include only call records where the agent is the assigned agent; IF the requesting user has the "admin" role, THEN THE Backend SHALL include all call records matching the applied filters
3. WHEN date range filter parameters (dateFrom, dateTo) are provided as ISO 8601 date strings, THE Backend SHALL return only call records with a creation timestamp within the specified inclusive range
4. IF no call records match the applied filters, THEN THE Backend SHALL return a CSV file containing only the header row with no data rows
5. IF the export request is made by an unauthenticated user, THEN THE Backend SHALL reject the request with an error indicating authentication is required

### Requirement 10: Docker Deployment

**User Story:** As a DevOps engineer, I want the application containerized with Docker, so that deployment is reproducible and portable.

#### Acceptance Criteria

1. WHEN `docker-compose up` is executed, THE Backend SHALL start and begin accepting HTTP requests on port 3000 within 120 seconds, with PostgreSQL running as a companion service defined in the same compose file
2. WHEN the Backend container starts, THE Backend SHALL run `prisma migrate deploy` to apply all pending migrations before accepting any HTTP requests
3. IF a Prisma migration fails during container startup, THEN THE Backend SHALL exit with a non-zero exit code and log an error message indicating the migration failure reason
4. WHEN a GET request is made to `/api/health` and the database connection is responsive (responds to a query within 5 seconds), THE Backend SHALL return HTTP 200 with a JSON body containing a status field set to "healthy"
5. IF a GET request is made to `/api/health` and the database connection is unresponsive (fails to respond within 5 seconds), THEN THE Backend SHALL return HTTP 503 with a JSON body containing a status field set to "unhealthy"
6. IF the database connection fails during startup, THEN THE Backend SHALL retry the connection with exponential backoff starting at 1 second delay and doubling on each attempt, up to 5 attempts (maximum ~31 seconds total wait), before exiting with a non-zero exit code

### Requirement 11: Input Validation and Security

**User Story:** As a security engineer, I want all inputs validated server-side, so that the system is protected against injection and malformed data.

#### Acceptance Criteria

1. THE Backend SHALL validate all incoming request bodies (POST, PUT, PATCH) using Zod schemas before executing business logic
2. THE Backend SHALL apply rate limiting to authentication endpoints (maximum 10 attempts per IP per minute)
3. IF the rate limit is exceeded, THEN THE Backend SHALL reject the request with HTTP 429 and include a response indicating how many seconds remain until the limit resets
4. THE Backend SHALL set CORS headers to allow requests only from the same origin that serves the application, rejecting cross-origin requests from other domains
5. IF a request body fails Zod validation, THEN THE Backend SHALL return HTTP 400 with a JSON response containing a message field and an errors array where each entry includes the field path and a human-readable validation message
6. THE Backend SHALL enforce a maximum request body size of 1 MB, rejecting payloads that exceed this limit with HTTP 413
7. THE Backend SHALL sanitize all user-provided string inputs by stripping HTML tags before storage to prevent XSS, and SHALL use Prisma parameterized queries for all database operations to prevent SQL injection

### Requirement 12: Follow-Up Chain Tracking

**User Story:** As an agent, I want to link follow-up calls to previous interactions, so that ongoing customer issues are tracked over time.

#### Acceptance Criteria

1. WHEN a call record includes a `followupRootId` field, THE Backend SHALL validate that the referenced root call exists and that the `followupRootId` does not equal the call's own ID before persisting
2. IF the `followupRootId` references a call that does not exist, THEN THE Backend SHALL reject the request with an error response indicating the referenced root call was not found, and SHALL NOT persist the call record
3. WHEN a list request is received with `open_followups=true` and a `phone` parameter, THE Backend SHALL return only calls matching that phone number with status `in_progress`, grouped by their follow-up chain root ID
4. WHEN a follow-up chain query is requested for a given root call ID, THE Backend SHALL return all calls whose `followupRootId` matches the given root call ID, ordered by creation date ascending

### Requirement 13: Customer Profile Aggregation

**User Story:** As an agent, I want to view all calls associated with a phone number, so that I have context on the customer's history.

#### Acceptance Criteria

1. WHEN calls are queried by phone number, THE Backend SHALL return all Call_Records matching that phone number (from all agents), sorted by creation timestamp descending
2. THE Backend SHALL support pagination for customer profile queries with a default page size of 50 and a maximum page size of 100
3. WHEN an Agent queries a customer profile, THE Backend SHALL require the Agent to be authenticated and SHALL return calls from all agents for the given phone number to provide full customer context
4. IF no Call_Records exist for the queried phone number, THEN THE Backend SHALL return an empty result set with a total count of 0 and no error
5. WHEN a customer profile is returned, THE Backend SHALL include a summary containing total calls, open follow-ups count, resolved count, and total follow-up chains count for that phone number
