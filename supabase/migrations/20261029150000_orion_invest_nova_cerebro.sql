-- Lo que NOVA aprendió del mercado por prueba y error (uno por "cerebro"; hoy solo 'mercado')
create table if not exists invest.nova_brain (
  id text primary key,
  trained_at timestamptz not null default now(),
  data jsonb not null
);

-- Predicciones en vivo: NOVA anota lo que cree hoy y, al cumplirse el plazo, revisa si acertó
create table if not exists invest.nova_predictions (
  id bigint generated always as identity primary key,
  symbol text not null,
  made_on date not null,
  price numeric not null,
  state text not null,
  expected_pct numeric not null,
  due_on date not null,
  outcome_pct numeric,
  correct boolean,
  resolved_at timestamptz,
  unique (symbol, made_on)
);
create index if not exists nova_predictions_due on invest.nova_predictions (due_on) where resolved_at is null;

alter table invest.nova_brain enable row level security;
alter table invest.nova_predictions enable row level security;
revoke all on invest.nova_brain, invest.nova_predictions from public, anon, authenticated;
