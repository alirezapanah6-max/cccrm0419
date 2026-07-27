# Requirements Document

## Introduction

سیستم Micro CRM شیپور یک اپلیکیشن تحت وب برای تیم مرکز تماس شیپور است که جایگزین پنل فعلی (مبتنی بر Google Sheets) می‌شود. این سیستم شامل ثبت و مدیریت تماس‌ها، پیگیری مشتریان، گزارش‌دهی و داشبورد مدیریتی با پشتوانه پایگاه‌داده و بک‌اند مناسب برای محیط production است.

## Glossary

- **System**: The Micro CRM web application as a whole
- **Auth_Module**: The authentication and authorization subsystem
- **Call_Registry**: The module responsible for creating, editing, and managing call records
- **Report_Module**: The module responsible for filtering, searching, and displaying call data
- **Customer_Profile_Module**: The module for viewing customer history and follow-up chains
- **Dashboard_Module**: The admin-only module for viewing statistics and charts
- **User_Performance_Module**: The admin-only module for viewing agent performance metrics
- **Category_Manager**: The admin-only module for managing the 3-level category hierarchy
- **User_Manager**: The admin-only module for CRUD operations on user accounts
- **Agent**: A call center operator (role: کارشناس) who registers calls and views reports
- **Admin**: A manager (role: مدیر) with full access to all modules including settings
- **Call_Record**: A single registered call entry with all associated metadata
- **Follow_Up_Chain**: A linked sequence of Call_Records sharing the same followupRootId
- **Request_ID**: A unique identifier for each call in format YYMMDDNNN (Jalali date + sequence)
- **Jalali_Calendar**: The Persian (Solar Hijri) calendar system used throughout the application
- **Category_Tree**: A 3-level hierarchy of categories (category → subcategory → sub-subcategory)

## Requirements

### Requirement 1: User Authentication

**User Story:** As a call center team member, I want to log in with my credentials, so that I can securely access the CRM system with my assigned role.

#### Acceptance Criteria

1. WHEN a user submits valid credentials, THE Auth_Module SHALL authenticate the user and redirect to the main application with the appropriate role context.
2. WHEN a user submits invalid credentials, THE Auth_Module SHALL display an error message in Persian without revealing which field is incorrect.
3. WHEN no users exist in the database, THE Auth_Module SHALL present a bootstrap form to create the first Admin account.
4. WHILE a user session is active, THE Auth_Module SHALL maintain the session for the configured duration.
5. WHERE the "remember me" option is selected, THE Auth_Module SHALL persist the session for 30 days.
6. WHERE the "remember me" option is not selected, THE Auth_Module SHALL expire the session when the browser is closed.
7. WHEN a user clicks the logout button, THE Auth_Module SHALL terminate the session and redirect to the login screen.

### Requirement 2: Role-Based Access Control

**User Story:** As an Admin, I want role-based permissions, so that Agents can only access features appropriate to their role.

#### Acceptance Criteria

1. THE System SHALL enforce two roles: Admin (مدیر) and Agent (کارشناس).
2. WHILE a user is authenticated as Agent, THE System SHALL restrict access to: call registration, calls list and report, and customer profile modules only.
3. WHILE a user is authenticated as Admin, THE System SHALL grant access to all modules including dashboard, user performance, category settings, and user management.
4. WHILE a user is authenticated as Agent, THE Call_Registry SHALL allow editing and deleting only Call_Records created by that Agent.
5. WHILE a user is authenticated as Admin, THE Call_Registry SHALL allow editing and deleting all Call_Records regardless of creator.

### Requirement 3: Call Registration

**User Story:** As an Agent, I want to register incoming calls with relevant details, so that all customer interactions are documented.

#### Acceptance Criteria

1. WHEN an Agent submits the call registration form with valid data, THE Call_Registry SHALL create a new Call_Record with a unique auto-generated Request_ID.
2. THE Call_Registry SHALL generate Request_ID in the format YYMMDDNNN where YY is the 2-digit Jalali year, MM is the month, DD is the day, and NNN is a zero-padded daily sequence number.
3. WHEN a phone number is entered, THE Call_Registry SHALL validate it as exactly 11 digits starting with 09.
4. WHEN the status is set to "در حال پیگیری" (In Progress), THE Call_Registry SHALL require the customer name field.
5. WHEN the status is set to "حل‌شده" (Resolved), THE Call_Registry SHALL record the resolver identity and resolution timestamp.
6. THE Call_Registry SHALL require selection of at least the first-level category for every call.
7. THE Call_Registry SHALL support a Jalali date picker defaulting to the current date.
8. WHEN a Call_Record is created or modified, THE Call_Registry SHALL append an entry to the Call_Record's change log with action type, timestamp, user identity, and description.

### Requirement 4: Follow-Up Chain Management

**User Story:** As an Agent, I want to link related calls into follow-up chains, so that I can track ongoing customer issues across multiple interactions.

#### Acceptance Criteria

1. WHEN a phone number with existing open follow-ups is entered, THE Call_Registry SHALL display an alert showing all open follow-up chains for that phone number.
2. WHEN the "ادامه همین پیگیری" (Continue this follow-up) option is selected, THE Call_Registry SHALL link the new Call_Record to the selected existing Follow_Up_Chain.
3. WHEN the "مشکل جدید" (New issue) option is selected, THE Call_Registry SHALL create a new Follow_Up_Chain with its own followupRootId.
4. WHEN the "ثبت تماس جدید و بستن پیگیری‌های قبلی" option is selected, THE Call_Registry SHALL create a new Call_Record and mark all previous open follow-ups for that phone number as resolved.
5. WHEN a follow-up is resolved, THE Call_Registry SHALL record the closing Call_Record ID, resolver identity, and resolution timestamp on the original follow-up root.

### Requirement 5: Call Editing and Deletion

**User Story:** As a user, I want to edit or delete call records within my permissions, so that I can correct mistakes or remove erroneous entries.

#### Acceptance Criteria

1. WHEN a user edits a Call_Record, THE Call_Registry SHALL populate the registration form with all existing field values.
2. WHEN a user saves edits to a Call_Record, THE Call_Registry SHALL update the record's updatedAt timestamp and append a change log entry.
3. WHEN a user requests deletion of a Call_Record, THE System SHALL display a confirmation modal before proceeding.
4. WHEN deletion is confirmed, THE Call_Registry SHALL remove the Call_Record and update any Follow_Up_Chain links affected.
5. IF a deletion would break a Follow_Up_Chain linkage, THEN THE Call_Registry SHALL reassign chain links to maintain chain integrity.

### Requirement 6: Calls List and Reporting

**User Story:** As a user, I want to search and filter call records with various criteria, so that I can find specific calls and generate reports.

#### Acceptance Criteria

1. THE Report_Module SHALL display Call_Records in a paginated table with configurable page size (25, 50, or 100 records per page).
2. THE Report_Module SHALL support filtering by: date range (Jalali), category, status, agent (multi-select), resolver (multi-select), phone number, Request_ID, free-text search, time of day shift (day 8-17, evening 17-1, night 1-8), and open follow-up age.
3. THE Report_Module SHALL provide quick filter presets: Today, Yesterday, Last 7 days, Last 14 days, Last 30 days, My open follow-ups, and Old open follow-ups.
4. WHEN the "Export Excel" button is clicked, THE Report_Module SHALL generate a CSV file containing all filtered records with proper Persian headers.
5. THE Report_Module SHALL display table columns: Date, Time, Request_ID, Phone, Category, Agent, Resolver, Status, Description, and Actions.
6. WHILE a user is authenticated as Agent, THE Report_Module SHALL display a personal performance panel showing the Agent's statistics.

### Requirement 7: Customer Profile

**User Story:** As a user, I want to view a customer's complete interaction history, so that I can understand their relationship and outstanding issues.

#### Acceptance Criteria

1. THE Customer_Profile_Module SHALL support searching customers by phone number, Request_ID, or customer name.
2. WHEN a customer is found, THE Customer_Profile_Module SHALL display a summary including: total calls, open follow-ups count, resolved count, and total follow-up chains.
3. THE Customer_Profile_Module SHALL display call history as a timeline grouped by Follow_Up_Chains.
4. THE Customer_Profile_Module SHALL support filtering customer calls by: date range, category, status, sort order, and an open-only toggle.
5. THE Customer_Profile_Module SHALL support pagination with configurable page size (5, 10, 25, or 50 records).
6. WHEN the "Export Excel" button is clicked, THE Customer_Profile_Module SHALL generate a CSV file of the customer's filtered call history.

### Requirement 8: Management Dashboard

**User Story:** As an Admin, I want a visual dashboard with statistics and charts, so that I can monitor call center performance at a glance.

#### Acceptance Criteria

1. WHILE a user is authenticated as Admin, THE Dashboard_Module SHALL be accessible.
2. THE Dashboard_Module SHALL display stat cards: total filtered calls, today's calls, in-progress count, and resolved count.
3. THE Dashboard_Module SHALL display a list of frequent callers for the current day.
4. THE Dashboard_Module SHALL display open follow-up age breakdown.
5. THE Dashboard_Module SHALL render a daily trend line chart for the selected date range.
6. THE Dashboard_Module SHALL render a top categories bar chart.
7. THE Dashboard_Module SHALL render a status distribution donut chart.
8. THE Dashboard_Module SHALL support filtering by: date range, category, status, agent (multi-select), resolver (multi-select), shift time, and follow-up age.

### Requirement 9: User Performance Reporting

**User Story:** As an Admin, I want to see performance metrics for each agent, so that I can evaluate team productivity and identify areas for improvement.

#### Acceptance Criteria

1. WHILE a user is authenticated as Admin, THE User_Performance_Module SHALL be accessible.
2. THE User_Performance_Module SHALL display summary statistics: registered calls, resolved by users, open follow-ups, and average resolution rate.
3. THE User_Performance_Module SHALL display ranking charts: by registered calls, by resolved calls, and by open follow-ups.
4. THE User_Performance_Module SHALL display a detailed table with columns: user, role, registered calls, new requests, continued follow-ups, resolved, open, self-resolution rate, and last activity.
5. THE User_Performance_Module SHALL support filtering by: date range, specific user, and shift time.
6. WHEN the "Export Excel" button is clicked, THE User_Performance_Module SHALL generate a CSV file of the performance data.

### Requirement 10: Category Management

**User Story:** As an Admin, I want to manage the category hierarchy, so that call classifications stay current with business needs.

#### Acceptance Criteria

1. WHILE a user is authenticated as Admin, THE Category_Manager SHALL be accessible.
2. THE Category_Manager SHALL support a 3-level hierarchy: category → subcategory → sub-subcategory.
3. THE Category_Manager SHALL support adding, editing, and deleting categories at each level.
4. THE Category_Manager SHALL support bulk import from text (CSV/Tab-separated format).
5. WHEN importing categories, THE Category_Manager SHALL support two modes: merge with existing categories, or replace all existing categories.
6. THE Category_Manager SHALL provide a "clear all" action with confirmation and a "restore defaults" action.
7. IF a category with existing Call_Records is deleted, THEN THE Category_Manager SHALL retain the category name on existing records and prevent data loss.

### Requirement 11: User Management

**User Story:** As an Admin, I want to manage user accounts, so that I can control who has access to the system and with what role.

#### Acceptance Criteria

1. WHILE a user is authenticated as Admin, THE User_Manager SHALL be accessible.
2. THE User_Manager SHALL display a table of all users with columns: display name, username, role, status, and actions.
3. THE User_Manager SHALL support creating new users with: display name, username, password, and role assignment.
4. THE User_Manager SHALL support editing existing user details and role assignment.
5. THE User_Manager SHALL support activating and deactivating user accounts.
6. WHEN a user account is deactivated, THE Auth_Module SHALL reject login attempts for that account.
7. THE User_Manager SHALL support password reset for any user by Admin.
8. THE System SHALL provide a "My Account" modal for any user to change their own password.

### Requirement 12: User Interface Requirements

**User Story:** As a user, I want a modern, responsive Persian interface, so that I can work efficiently on any device.

#### Acceptance Criteria

1. THE System SHALL render all text in Right-to-Left (RTL) direction with Persian (Farsi) language throughout.
2. THE System SHALL use the Jalali (Solar Hijri) calendar for all date inputs and displays.
3. THE System SHALL support dark mode and light mode with a toggle switch, persisting the user's preference.
4. THE System SHALL be responsive and functional on screen widths from 320px to 2560px.
5. THE System SHALL display toast notifications for success, error, and warning feedback.
6. THE System SHALL display confirmation modals before all destructive actions (delete, clear all, replace).
7. THE System SHALL display the current Jalali date and time in the application header.

### Requirement 13: Deployment and Infrastructure

**User Story:** As a DevOps engineer, I want the application deployed via Docker Compose, so that it can run reliably on Sheypoor servers.

#### Acceptance Criteria

1. THE System SHALL be deployable via a single `docker-compose up` command.
2. THE System SHALL use a relational database (MySQL or PostgreSQL) for persistent storage.
3. THE System SHALL support multiple concurrent users without data conflicts.
4. THE System SHALL provide database migration scripts for schema setup and future updates.
5. IF the database connection is lost, THEN THE System SHALL display a user-friendly error message and attempt automatic reconnection.
6. THE System SHALL serve the frontend as a production-optimized build through the application server or a reverse proxy.

### Requirement 14: Data Integrity and Audit Trail

**User Story:** As an Admin, I want a complete audit trail of all changes, so that I can track who modified what and when.

#### Acceptance Criteria

1. WHEN any field of a Call_Record is modified, THE System SHALL append a log entry containing: action type, changed fields with old and new values, timestamp, and user identity.
2. THE System SHALL preserve all log entries indefinitely and prevent their modification or deletion.
3. WHEN a Call_Record's log history is requested, THE System SHALL display all log entries in chronological order.
4. THE System SHALL record creation, update, status change, follow-up linkage, and deletion actions in the audit log.
