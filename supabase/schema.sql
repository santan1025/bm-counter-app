-- ============================================================================
-- BM Ventures Counter Manager — Multi-Shop Schema
-- Run this once in: Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ============================================================================
-- Design: every operational table has a shop_id. Row-Level Security (RLS)
-- policies ensure a staff member logged into Shop A can NEVER see or write
-- Shop B's rows — Postgres enforces this at the database level, not just in
-- the app's UI, so even a bug in the frontend code can't leak data across shops.
-- The owner's role bypasses the shop_id filter entirely and sees everything.
-- ============================================================================

-- ── SHOPS ───────────────────────────────────────────────────────────────────
create table shops (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  address      text,
  phone        text,
  gstin        text,
  fssai        text,
  active       boolean default true,
  created_at   timestamptz default now()
);

-- ── PROFILES (one row per login, linked to Supabase's built-in auth.users) ──
-- role = 'owner'  -> full access across ALL shops
-- role = 'staff'  -> access restricted to their own shop_id only
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  role         text not null check (role in ('owner','staff')),
  shop_id      uuid references shops(id),   -- null for owner, required for staff
  phone        text,
  active       boolean default true,
  created_at   timestamptz default now()
);

-- ── PRODUCTS (per-shop catalog — you told us these vary a lot shop to shop) ──
create table products (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id),
  name          text not null,
  category      text,
  price         numeric(10,2) not null default 0,
  stock         integer not null default 0,
  reorder_level integer,               -- optional manual low-stock threshold
  arrived_date  date,                  -- last date stock was received (for aging alerts)
  created_at    timestamptz default now()
);

-- ── DAILY (one row per shop per day — opening/closing/cash box state) ───────
create table daily (
  shop_id         uuid not null references shops(id),
  date            date not null,
  opening         numeric(10,2) default 0,
  new_stock       numeric(10,2) default 0,
  closing_value   numeric(10,2),
  day_box         numeric(10,2) default 0,
  day_box_det     jsonb,               -- denomination breakdown, e.g. {"500":2,"20c":3}
  counter_box     numeric(10,2) default 0,
  opening_snap    jsonb,               -- itemized opening stock [{id,n,c,p,stock}]
  closing_snap    jsonb,               -- itemized closing stock
  new_stock_log   jsonb,               -- itemized stock received that day
  cash_det        jsonb,               -- EOD cash count denominations
  primary key (shop_id, date)
);

-- ── SALES ────────────────────────────────────────────────────────────────────
create table sales (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id),
  staff_id    uuid references profiles(id),
  date        date not null default current_date,
  time        text,
  items       jsonb not null,          -- [{id,name,price,qty,cat}]
  sub         numeric(10,2),
  disc        numeric(10,2) default 0,
  total       numeric(10,2) not null,
  pay         text,                    -- 'cash' | 'upi' | 'card' | 'credit' | 'split'
  sp_u        numeric(10,2),           -- split: UPI portion
  sp_c        numeric(10,2),           -- split: cash portion
  note        text,
  created_at  timestamptz default now()
);

-- ── CREDIT SALES + PAYMENTS (customer accounts, phone-based) ────────────────
create table credits (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id),
  name        text not null,
  phone       text,
  amt         numeric(10,2) not null,
  items       jsonb,
  date        date not null default current_date,
  paid        boolean default false,
  created_at  timestamptz default now()
);

create table credit_payments (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id),
  name        text not null,
  phone       text,
  amt         numeric(10,2) not null,
  date        date not null default current_date,
  note        text,
  created_at  timestamptz default now()
);

-- ── EXPENSES ─────────────────────────────────────────────────────────────────
create table expenses (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id),
  date        date not null default current_date,
  time        text,
  category    text,
  description text,
  amt         numeric(10,2) not null,
  source      text,                    -- 'cashbox' | 'other'
  note_det    jsonb,
  created_at  timestamptz default now()
);

-- ── DAMAGE / WASTAGE ─────────────────────────────────────────────────────────
create table damage (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id),
  date          date not null default current_date,
  product_name  text,
  category      text,
  qty           integer not null,
  value         numeric(10,2) not null,
  arrived_date  date,
  age_days      integer,
  reason        text,
  created_at    timestamptz default now()
);

-- ── HANDOVERS (counter box → owner/manager) ─────────────────────────────────
create table handovers (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id),
  date        date not null default current_date,
  time        text,
  handed_to   text,
  amt         numeric(10,2) not null,
  note        text,
  created_at  timestamptz default now()
);

-- ── AUDIT LOG (who changed what — covers the "who edited this credit entry" ask) ──
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id),
  actor_id    uuid references profiles(id),
  action      text not null,           -- e.g. 'credit.edit_amount', 'stock.manual_adjust'
  table_name  text,
  record_id   uuid,
  before_val  jsonb,
  after_val   jsonb,
  created_at  timestamptz default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table shops           enable row level security;
alter table profiles        enable row level security;
alter table products        enable row level security;
alter table daily           enable row level security;
alter table sales           enable row level security;
alter table credits         enable row level security;
alter table credit_payments enable row level security;
alter table expenses        enable row level security;
alter table damage          enable row level security;
alter table handovers       enable row level security;
alter table audit_log       enable row level security;

-- Helper: is the logged-in user an owner?
create or replace function is_owner() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'owner'
  );
$$ language sql security definer stable;

-- Helper: which shop_id is the logged-in user scoped to (null if owner)?
create or replace function my_shop_id() returns uuid as $$
  select shop_id from profiles where id = auth.uid();
$$ language sql security definer stable;

-- PROFILES: everyone can see their own profile; owner can see all
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or is_owner());
create policy "profiles_owner_manage" on profiles for all
  using (is_owner());

-- SHOPS: owner sees/manages all; staff can see only their own shop's row
create policy "shops_select" on shops for select
  using (is_owner() or id = my_shop_id());
create policy "shops_owner_manage" on shops for all
  using (is_owner());

-- Generic pattern applied to every operational table below:
--   SELECT/INSERT/UPDATE allowed if owner, OR if row's shop_id matches caller's shop_id
create policy "products_all" on products for all
  using (is_owner() or shop_id = my_shop_id())
  with check (is_owner() or shop_id = my_shop_id());

create policy "daily_all" on daily for all
  using (is_owner() or shop_id = my_shop_id())
  with check (is_owner() or shop_id = my_shop_id());

create policy "sales_all" on sales for all
  using (is_owner() or shop_id = my_shop_id())
  with check (is_owner() or shop_id = my_shop_id());

create policy "credits_all" on credits for all
  using (is_owner() or shop_id = my_shop_id())
  with check (is_owner() or shop_id = my_shop_id());

create policy "credit_payments_all" on credit_payments for all
  using (is_owner() or shop_id = my_shop_id())
  with check (is_owner() or shop_id = my_shop_id());

create policy "expenses_all" on expenses for all
  using (is_owner() or shop_id = my_shop_id())
  with check (is_owner() or shop_id = my_shop_id());

create policy "damage_all" on damage for all
  using (is_owner() or shop_id = my_shop_id())
  with check (is_owner() or shop_id = my_shop_id());

create policy "handovers_all" on handovers for all
  using (is_owner() or shop_id = my_shop_id())
  with check (is_owner() or shop_id = my_shop_id());

-- Audit log: owner can read everything; staff can only insert (never read/edit others' logs)
create policy "audit_owner_read" on audit_log for select
  using (is_owner());
create policy "audit_insert" on audit_log for insert
  with check (is_owner() or shop_id = my_shop_id());

-- ============================================================================
-- Helpful indexes (queries will filter by shop_id + date constantly)
-- ============================================================================
create index idx_products_shop      on products(shop_id);
create index idx_sales_shop_date    on sales(shop_id, date);
create index idx_credits_shop_phone on credits(shop_id, phone);
create index idx_expenses_shop_date on expenses(shop_id, date);
create index idx_damage_shop_date   on damage(shop_id, date);
