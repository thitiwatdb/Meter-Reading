BEGIN;

INSERT INTO users (username, email, password_hash, full_name, phone, role) VALUES
  ('admin',   'admin@example.com',   '$2b$10$i.qmswWf6LQuiNMpn.1ca.h5u66PKGkUUf2UGyOUVcQw01fCAhIBO', 'System Admin',  '0800000000', 'ADMIN'),
  ('manager', 'manager@example.com', '$2b$10$i.qmswWf6LQuiNMpn.1ca.h5u66PKGkUUf2UGyOUVcQw01fCAhIBO', 'Front Manager', '0801111111', 'MANAGER'),
  ('chanon',  'chanon@example.com',  '$2b$10$i.qmswWf6LQuiNMpn.1ca.h5u66PKGkUUf2UGyOUVcQw01fCAhIBO', 'Chanon Tenant', '0802222222', 'TENANT'),
  ('boy',     'boy@example.com',     '$2b$10$i.qmswWf6LQuiNMpn.1ca.h5u66PKGkUUf2UGyOUVcQw01fCAhIBO', 'Boy Tenant',    '0803333333', 'TENANT'),
  ('data',    'data@example.com',    '$2b$10$i.qmswWf6LQuiNMpn.1ca.h5u66PKGkUUf2UGyOUVcQw01fCAhIBO', 'Data Tenant',   '0804444444', 'TENANT')
ON CONFLICT (email) DO NOTHING;


INSERT INTO buildings (code, name, address) VALUES
  ('A', 'Building A', '123 Main Rd'),
  ('B', 'Building B', '456 Second Rd')
ON CONFLICT (code) DO NOTHING;


WITH b AS (SELECT code, id FROM buildings)
INSERT INTO rooms (building_id, room_no, floor, type, sell_type, area_sqm, base_rent_month, base_rent_day, status, note) VALUES
  ((SELECT id FROM b WHERE code='A'), '101', 1, 'STANDARD', 'DAILY',   24.0,  8000,  600, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='A'), '102', 1, 'STANDARD', 'DAILY',   24.0,  8000,  600, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='A'), '103', 1, 'STANDARD', 'DAILY',   24.0,  8000,  600, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='A'), '201', 2, 'DELUXE',   'DAILY',   28.0, 10000,  800, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='A'), '202', 2, 'DELUXE',   'DAILY',   28.0, 10000,  800, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='A'), '203', 2, 'DELUXE',   'DAILY',   28.0, 10000,  800, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='A'), '301', 3, 'SUITE',    'MONTHLY', 35.0, 15000, 1000, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='A'), '302', 3, 'SUITE',    'MONTHLY', 35.0, 15000, 1000, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='A'), '303', 3, 'SUITE',    'MONTHLY', 35.0, 15000, 1000, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='B'), '101', 1, 'STANDARD', 'MONTHLY', 24.0,  8000,  600, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='B'), '102', 1, 'STANDARD', 'MONTHLY', 24.0,  8000,  600, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='B'), '103', 1, 'STANDARD', 'MONTHLY', 24.0,  8000,  600, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='B'), '201', 2, 'DELUXE',   'MONTHLY', 28.0,  10000,  800, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='B'), '202', 2, 'DELUXE',   'MONTHLY', 28.0,  10000,  800, 'AVAILABLE', NULL),
  ((SELECT id FROM b WHERE code='B'), '203', 2, 'DELUXE',   'MONTHLY', 28.0,  10000,  800, 'AVAILABLE', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO settings(key, value)
VALUES
  ('WATER_RATE','18'),
  ('ELECTRIC_RATE','7')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES bookings(id);
ALTER TABLE tenancies DROP CONSTRAINT IF EXISTS uq_tenancy_booking;
ALTER TABLE tenancies ADD CONSTRAINT uq_tenancy_booking UNIQUE (booking_id);

DELETE FROM meter_readings;

WITH room_base AS (
  SELECT
    r.id,
    ROW_NUMBER() OVER (ORDER BY r.building_id, r.room_no) AS rn
  FROM rooms r
),
readings AS (
  SELECT
    rb.id AS room_id,
    'WATER'::text AS type,
    DATE '2025-09-30' AS reading_date,
    ROUND(80 + rb.rn * 3, 3) AS value_unit
  FROM room_base rb
  UNION ALL
  SELECT
    rb.id,
    'WATER',
    DATE '2025-10-31',
    ROUND(80 + rb.rn * 3 + 12 + (rb.rn % 4), 3)
  FROM room_base rb
  UNION ALL
  SELECT
    rb.id,
    'ELECTRIC',
    DATE '2025-09-30',
    ROUND(450 + rb.rn * 9, 3)
  FROM room_base rb
  UNION ALL
  SELECT
    rb.id,
    'ELECTRIC',
    DATE '2025-10-31',
    ROUND(450 + rb.rn * 9 + 36 + (rb.rn % 5) * 2, 3)
  FROM room_base rb
)
INSERT INTO meter_readings (room_id, type, reading_date, billing_month, value_unit)
SELECT
  room_id,
  type,
  reading_date,
  date_trunc('month', reading_date)::date AS billing_month,
  value_unit
FROM readings
ON CONFLICT (room_id, type, reading_date) DO UPDATE
SET
  value_unit = EXCLUDED.value_unit,
  billing_month = EXCLUDED.billing_month;

COMMIT;
