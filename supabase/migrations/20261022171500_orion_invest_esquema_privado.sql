-- Orion Invest: esquema privado "invest", NO expuesto en la API.
-- Solo la Edge Function "invest" accede, con conexión directa a la base.
create schema if not exists invest;
revoke all on schema invest from public, anon, authenticated;

-- Usuarios autorizados para operar (se agregan a mano; no hay auto-registro)
create table invest.allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

create table invest.watchlist (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.]{1,10}(/[A-Z]{3,4})?$'),
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table invest.order_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  broker_order_id text,
  environment text not null check (environment in ('paper','live')),
  symbol text not null,
  side text not null check (side in ('buy','sell')),
  order_type text not null,
  qty numeric,
  notional numeric,
  limit_price numeric,
  estimated_usd numeric not null,
  status text not null,
  error text,
  created_at timestamptz not null default now()
);
create index order_log_user_day on invest.order_log (user_id, created_at desc);
create index order_log_broker_id on invest.order_log (broker_order_id);

-- Defensa extra: RLS activo y sin políticas = nadie de la API puede leer ni escribir
alter table invest.allowed_users enable row level security;
alter table invest.watchlist enable row level security;
alter table invest.order_log enable row level security;

revoke all on all tables in schema invest from public, anon, authenticated;
revoke all on all sequences in schema invest from public, anon, authenticated;
alter default privileges in schema invest revoke all on tables from public, anon, authenticated;
alter default privileges in schema invest revoke all on sequences from public, anon, authenticated;
