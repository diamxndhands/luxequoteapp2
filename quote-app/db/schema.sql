-- Interior finishing quote app — schema for the rebuilt quoting flow.
-- Mirrors src/types/{service,project,quote}.ts exactly; this is the paper design, not
-- yet wired to a backend (the app currently runs on browser localStorage — see the
-- audit notes on that being a deliberate open decision, not an assumption).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- rate table

create table services (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Consultations', 'Install', 'CNC', 'Supply', 'Scribing', 'Refine')),
  name text not null,
  unit_type text not null check (unit_type in ('linear_ft', 'sqft', 'per_item', 'flat')),
  room_scoped boolean not null default true,
  -- null = never entered yet (triggers the first-use prompt); not the same as $0.
  base_labor_rate numeric,
  material_applicable boolean not null default true,
  base_material_rate numeric,
  rate_basis text,
  rate_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table service_modifiers (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  name text not null,
  labor_delta numeric,
  material_delta numeric
);

create index idx_service_modifiers_service on service_modifiers(service_id);

-- ---------------------------------------------------------------- projects

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_name text,
  address text,
  materials_supplied_by text not null default 'client' check (materials_supplied_by in ('contractor', 'client')),
  floor_plan_image_url text,
  scale_pixel_length numeric,
  scale_real_length numeric,
  scale_unit text check (scale_unit in ('ft', 'in')),
  status text not null default 'draft' check (status in ('draft', 'quoted', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  label text not null,
  source text not null check (source in ('traced', 'ocr_detected')),
  floor_plan_polygon jsonb not null, -- flattened [x1,y1,x2,y2,...] image-pixel coordinates
  area_sqft numeric,
  perimeter_ft numeric,
  created_at timestamptz not null default now()
);

create index idx_rooms_project on rooms(project_id);

-- A tagged service belongs to exactly one of a room or a project (never both) —
-- project-level items (Consultations, Refine) have room_id null.
create table tagged_services (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  room_id uuid references rooms(id) on delete cascade,
  service_id uuid not null references services(id),
  quantity numeric not null,
  quantity_source text not null check (quantity_source in ('auto', 'manual')),
  -- Snapshotted at tag time, same as quote_line_items below — correcting the rate
  -- table later must never silently reprice a line already reviewed.
  labor_rate_used numeric not null,
  material_rate_used numeric,
  computed_labor_price numeric not null,
  computed_material_price numeric not null,
  computed_total numeric not null,
  anomaly_flag text,
  created_at timestamptz not null default now()
);

create table tagged_service_modifiers (
  id uuid primary key default gen_random_uuid(),
  tagged_service_id uuid not null references tagged_services(id) on delete cascade,
  modifier_id uuid not null references service_modifiers(id),
  labor_delta numeric not null,
  material_delta numeric not null
);

create index idx_tagged_services_project on tagged_services(project_id);
create index idx_tagged_services_room on tagged_services(room_id);

-- ---------------------------------------------------------------- quotes

create table quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  materials_supplied_by text not null check (materials_supplied_by in ('contractor', 'client')),
  subtotal numeric not null,
  gst numeric not null,
  total numeric not null,
  generated_pdf_url text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'won', 'lost')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  section text not null, -- room label, or the service's category for a project-level line
  description text not null,
  quantity numeric not null,
  unit text not null check (unit in ('linear_ft', 'sqft', 'per_item', 'flat')),
  labor_amount numeric not null,
  material_amount numeric not null,
  total numeric not null
);

create index idx_quote_line_items_quote on quote_line_items(quote_id);
create index idx_quotes_project on quotes(project_id);
