-- NOVA (asesora de inversión con IA) dentro de Orion Invest. Esquema privado: solo la Edge Function accede.
create table if not exists invest.nova_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal text check (goal in ('dividendos', 'crecimiento', 'equilibrio', 'preservar')),
  horizon text check (horizon in ('corto', 'medio', 'largo')),
  risk text check (risk in ('bajo', 'medio', 'alto')),
  monthly_cop numeric check (monthly_cop >= 0),
  notes text check (char_length(notes) <= 1000),
  updated_at timestamptz not null default now()
);

-- Cuántos mensajes manda cada usuario por día (control de costo de la IA)
create table if not exists invest.nova_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

alter table invest.nova_profile enable row level security;
alter table invest.nova_usage enable row level security;
revoke all on invest.nova_profile, invest.nova_usage from public, anon, authenticated;
