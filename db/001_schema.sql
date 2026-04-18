BEGIN;

DROP TRIGGER IF EXISTS bookings_check_sell_type ON bookings;
DROP FUNCTION IF EXISTS trg_bookings_check_sell_type();

DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS bill_items CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS meter_readings CASCADE;
DROP TABLE IF EXISTS maintenance_requests CASCADE;
DROP TABLE IF EXISTS tenancies CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      varchar(50)  UNIQUE NOT NULL,
  email         varchar(120) UNIQUE NOT NULL,
  password_hash varchar(255) NOT NULL,
  full_name     varchar(120),
  phone         varchar(30) NOT NULL,
  role          varchar(20)  NOT NULL DEFAULT 'TENANT',
  is_active     boolean      NOT NULL DEFAULT true,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE buildings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       varchar(20) UNIQUE NOT NULL,
  name       varchar(120),
  address    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id     uuid NOT NULL REFERENCES buildings(id),
  room_no         varchar(20) NOT NULL,
  floor           int,
  type            varchar(30),         
  sell_type       varchar(10) NOT NULL DEFAULT 'DAILY', 
  area_sqm        numeric(6,2),
  base_rent_month numeric(10,2),
  base_rent_day   numeric(10,2),
  status          varchar(20) NOT NULL DEFAULT 'AVAILABLE',
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_room_per_building UNIQUE (building_id, room_no)
);

CREATE TABLE bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid REFERENCES rooms(id),           
  room_type       varchar(30),                        
  sell_type       varchar(10),                        
  tenant_id       uuid NOT NULL REFERENCES users(id),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  is_monthly      boolean NOT NULL,
  status          varchar(20) NOT NULL DEFAULT 'PENDING',
  checked_in_at   timestamptz,
  checked_out_at  timestamptz,
  hold_expires_at timestamptz,
  approved_by     uuid REFERENCES users(id),
  approved_at     timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  note            text,
  booking_code    varchar(40) UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenancies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id        uuid NOT NULL REFERENCES rooms(id),
  tenant_id      uuid NOT NULL REFERENCES users(id),
  start_date     date NOT NULL,
  end_date       date,
  is_monthly     boolean NOT NULL,
  status         varchar(20) NOT NULL DEFAULT 'ACTIVE', 
  booking_id     uuid REFERENCES bookings(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenancy_booking UNIQUE (booking_id)
);

CREATE TABLE meter_readings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES rooms(id),
  type          varchar(20) NOT NULL, 
  reading_date  date NOT NULL,
  billing_month date NOT NULL,
  value_unit    numeric(12,3),
  image_path    varchar(255),
  ai_value      numeric(12,3),
  ai_confidence numeric(5,2),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_meter_per_day UNIQUE (room_id, type, reading_date),
  CONSTRAINT meter_billing_month_chk CHECK (billing_month = date_trunc('month', billing_month)::date)
);

CREATE TABLE bills (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id    uuid REFERENCES tenancies(id) ON DELETE CASCADE,
  booking_id    uuid REFERENCES bookings(id)  ON DELETE CASCADE,
  bill_no       varchar(40) UNIQUE NOT NULL,
  bill_scope    varchar(20) NOT NULL DEFAULT 'TENANCY', 
  period_start  date,
  period_end    date,
  subtotal      numeric(12,2) NOT NULL DEFAULT 0,
  total_amount  numeric(12,2) NOT NULL DEFAULT 0,
  status        varchar(20)  NOT NULL DEFAULT 'PENDING', 
  due_date      date,
  issued_at     timestamptz  NOT NULL DEFAULT now(),
  note          text,

  CONSTRAINT bills_link_xor CHECK (
    (tenancy_id IS NOT NULL AND booking_id IS NULL)
    OR
    (tenancy_id IS NULL AND booking_id IS NOT NULL)
  ),

  CONSTRAINT bills_period_chk CHECK (
    period_start IS NULL OR period_end IS NULL OR period_start <= period_end
  )
);


CREATE TABLE bill_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  item_type   varchar(30) NOT NULL, 
  description varchar(200),
  qty         numeric(10,2) NOT NULL DEFAULT 1,
  unit_price  numeric(12,2) NOT NULL DEFAULT 0,
  amount      numeric(12,2) NOT NULL DEFAULT 0,
  meter_prev_reading_id uuid REFERENCES meter_readings(id),
  meter_curr_reading_id uuid REFERENCES meter_readings(id),
  CONSTRAINT bill_items_meter_pair_chk CHECK (
    (meter_prev_reading_id IS NULL AND meter_curr_reading_id IS NULL)
    OR (meter_prev_reading_id IS NOT NULL AND meter_curr_reading_id IS NOT NULL)
  )
);

CREATE TABLE payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id      uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  paid_amount  numeric(12,2) NOT NULL,
  method       varchar(20),
  slip_path    varchar(255),
  paid_at      timestamptz NOT NULL DEFAULT now(),
  received_by  uuid REFERENCES users(id),
  note         text,
  status        varchar(20) NOT NULL DEFAULT 'CONFIRMED',
  confirmed_at  timestamptz,
  confirmed_by  uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE maintenance_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES rooms(id),
  requester_id  uuid NOT NULL REFERENCES users(id),
  title         varchar(120) NOT NULL,
  description   text,
  status        varchar(20) NOT NULL DEFAULT 'REQUESTED', 
  photo_path    varchar(255),
  created_at    timestamptz NOT NULL DEFAULT now(),
  cancel_reason text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  action varchar(60) NOT NULL,
  entity_type varchar(40) NOT NULL,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bills_scope_link_chk'
      AND conrelid = 'bills'::regclass
  ) THEN
    ALTER TABLE bills
      ADD CONSTRAINT bills_scope_link_chk
      CHECK (
        (tenancy_id IS NOT NULL AND booking_id IS NULL)
        OR (booking_id IS NOT NULL AND tenancy_id IS NULL)
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_rooms_building ON rooms(building_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_room ON tenancies(room_id);
CREATE INDEX IF NOT EXISTS idx_tenancies_tenant ON tenancies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenancy ON bills(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_meter_room ON meter_readings(room_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_bills_booking ON bills(booking_id);


COMMIT;

