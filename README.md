# FULLPROJECT

Backend + Frontend for Dorm Booking/Billing system (PostgreSQL).

## Database

- Migrations/seed SQL moved to `db/`:
  - `db/001_schema.sql` – full schema (drop/create tables + indexes)
  - `db/002_seed.sql` – seed data + demo records

Run in order with a privileged role:

```
psql "$DATABASE_URL" -f db/001_schema.sql
psql "$DATABASE_URL" -f db/003_settings.sql
psql "$DATABASE_URL" -f db/004_activity.sql
psql "$DATABASE_URL" -f db/005_booking_deposit.sql
psql "$DATABASE_URL" -f db/006_booking_check_flags.sql
psql "$DATABASE_URL" -f db/007_deposit_bills.sql
psql "$DATABASE_URL" -f db/008_user_phone_enforce.sql
psql "$DATABASE_URL" -f db/009_payments_status.sql
psql "$DATABASE_URL" -f db/002_seed.sql
```

Or via Node helper from `backend/` (requires env: DB_*):

```
cd backend
npm run db:setup
```

## Backend (Node/Express)

- Entry: `backend/index.js`
- DB config: `backend/config/db.js` (env: `DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME`)
- Auth/JWT: `backend/controllers/authController.js`, `backend/middleware/authMiddleware.js` (`JWT_SECRET` required)

### Routes

- Users: `/api/users`
- Auth: `/api/auth`
- Buildings: `/api/buildings`
- Rooms: `/api/rooms`
- Bookings: `/api/bookings`
  - `POST /api/bookings/walkin` (manager/admin) – walk-in create
  - `POST /api/bookings/:id/allocate` (manager/admin) – allocate room to online booking
- Tenancies: `/api/tenancies`
- Meters: `/api/meters` (list/create)
- Maintenance: `/api/maintenance` (list/create/update status)
- Billing: `/api/billing` (list bills, bill items, create)
- Billing generate: `POST /api/billing/generate` (auto-calc from meters; env or settings: `WATER_RATE`, `ELECTRIC_RATE`)
- Payments: `/api/payments` (list/create, auto-mark bill paid on full payment)
- Dashboard: `/api/dashboard/summary` (aggregated counts)
- Uploads: `POST /api/uploads/base64` -> `{ path }`, static served from `/uploads/...`

Role protection:

- Admin/Manager only: list bookings, approve/reject booking, meters/billing/payments maintenance status updates, dashboard.
- Tenants: can create their own bookings, view their data.

## Frontend

React app in `frontend/`. Pages exist for users/rooms/bookings/tenancies. Consider adding pages for:
- Added pages:
  - `Dashboard` (summary)
- `Meters` (list/create + photo upload base64)
  - `Maintenance` (list/create + photo upload base64)
  - `Billing & Payments` (list bills/items, generate bills, record payments)
- Environment: set `VITE_PAYMENT_QR_URL` (optional) to display a QR image in the tenant payment flow.

## Notes

- Booking creation now checks `rooms.sell_type` matches `is_monthly` (room locked to DAILY/MONTHLY).
- No triggers used; simple FK indexes added for performance.
- You can set `WATER_RATE` and `ELECTRIC_RATE` in `backend/.env` for billing generation.
- Automatic monthly billing job runs on startup and checks every 6 hours; it generates bills on the 1st day of each month for the previous month if missing.
  - Rates default to `WATER_RATE=18`, `ELECTRIC_RATE=7` via `db/003_settings.sql` and can be updated through Settings API/UI.


Safe vs reset seeding

- Safe (default): does not drop existing objects. Runs 003_settings.sql, 004_activity.sql, then 002_seed.sql.
  - Command: cd backend && npm run db:setup
- Reset: drops/recreates schema (requires owner/superuser), then seeds everything.
  - Command: cd backend && npm run db:reset
  - If you see "must be owner of table <name>", use the DB role that owns those tables, or run the safe mode.

