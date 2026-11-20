PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('advisor','mechanic','client')),
  name TEXT NOT NULL,
  phone TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES accounts(id),
  model TEXT NOT NULL,
  plate TEXT NOT NULL,
  vin TEXT,
  mileage INTEGER CHECK (mileage >= 0),
  UNIQUE (client_id, plate)
) STRICT;

CREATE TABLE IF NOT EXISTS bays (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS service_requests (
  id INTEGER PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  preferred_date TEXT,
  appointment TEXT,
  status TEXT NOT NULL CHECK (status IN ('new','scheduled','received','ordered','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS request_tracking (
  request_id INTEGER PRIMARY KEY REFERENCES service_requests(id),
  token TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL UNIQUE REFERENCES service_requests(id),
  advisor_id INTEGER NOT NULL REFERENCES accounts(id),
  mechanic_id INTEGER REFERENCES accounts(id),
  bay_id INTEGER REFERENCES bays(id),
  status TEXT NOT NULL CHECK (status IN ('received','diagnosis_assigned','diagnosing','awaiting_estimate','awaiting_approval','declined','approved','repair_assigned','repairing','paused','inspection','ready','issued')),
  work_instructions TEXT,
  pause_reason TEXT,
  eta TEXT,
  estimate_version INTEGER NOT NULL DEFAULT 0,
  inspection_note TEXT,
  intake_note TEXT
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS active_bay ON orders(bay_id) WHERE bay_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS active_mechanic ON orders(mechanic_id) WHERE bay_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS parking_spaces (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 10)
) STRICT;

INSERT OR IGNORE INTO parking_spaces(id) VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10);

CREATE TABLE IF NOT EXISTS parking_assignments (
  order_id INTEGER PRIMARY KEY REFERENCES orders(id),
  space_id INTEGER NOT NULL UNIQUE REFERENCES parking_spaces(id),
  reason TEXT NOT NULL,
  expected_date TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS parts (
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  stock INTEGER NOT NULL CHECK (stock >= 0),
  price INTEGER NOT NULL CHECK (price >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS estimate_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  version INTEGER NOT NULL,
  service_id INTEGER REFERENCES services(id),
  part_id INTEGER REFERENCES parts(id),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  CHECK (service_id IS NULL OR part_id IS NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS work_reports (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  mechanic_id INTEGER NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('diagnosis','repair')),
  result TEXT NOT NULL,
  recommendations TEXT,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY,
  part_id INTEGER NOT NULL REFERENCES parts(id),
  report_id INTEGER REFERENCES work_reports(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  quantity INTEGER NOT NULL CHECK (quantity <> 0),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash','card','transfer')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES service_requests(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  title TEXT NOT NULL,
  note TEXT,
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
