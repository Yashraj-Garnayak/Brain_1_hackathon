-- TILE RUSH schema. Idempotent: safe to run repeatedly.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_lower text not null unique check (username_lower ~ '^[a-z0-9_]{3,16}$'),
  password_hash text not null,
  rating integer not null default 1000 check (rating >= 100),
  best_score integer not null default 0 check (best_score >= 0),
  best_tier integer not null default 0 check (best_tier >= 0),
  games integer not null default 0 check (games >= 0),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

create table if not exists runs (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  score integer not null check (score >= 0),
  tier integer not null default 0 check (tier >= 0),
  accuracy real not null default 0 check (accuracy >= 0 and accuracy <= 1),
  avg_rt integer not null default 0 check (avg_rt >= 0),
  rating_before integer not null,
  rating_after integer not null,
  created_at timestamptz not null default now()
);

create index if not exists runs_user_idx on runs (user_id, created_at desc);
create index if not exists users_best_idx on users (best_score desc, rating desc);
create index if not exists users_rating_idx on users (rating desc, best_score desc);
create index if not exists users_seen_idx on users (last_seen desc);
