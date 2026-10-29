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

-- Profile, BPI and region fields.
alter table users add column if not exists avatar text;
alter table users add column if not exists title text not null default 'DRIFTER';
alter table users add column if not exists best_bpi integer not null default 0;
alter table users add column if not exists country text;
alter table users add column if not exists region text;
alter table users add column if not exists city text;
alter table users add column if not exists geo_updated_at timestamptz;

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

-- Per-run BPI, season buckets, region snapshot and round detail.
alter table runs add column if not exists game_id text not null default 'tile-rush';
alter table runs add column if not exists season_key text;
alter table runs add column if not exists week_key text;
alter table runs add column if not exists bpi integer not null default 0;
alter table runs add column if not exists metrics jsonb;
alter table runs add column if not exists rounds jsonb;
alter table runs add column if not exists country text;
alter table runs add column if not exists region text;
alter table runs add column if not exists result text;

-- Cumulative score sampled once per second, used to replay a run as a ghost.
alter table runs add column if not exists timeline jsonb;

create index if not exists runs_user_idx on runs (user_id, created_at desc);
create index if not exists runs_user_game_idx on runs (user_id, game_id, created_at desc);
create index if not exists runs_game_season_bpi_idx on runs (game_id, season_key, bpi desc);
create index if not exists runs_game_season_score_idx on runs (game_id, season_key, score desc);
create index if not exists runs_game_week_bpi_idx on runs (game_id, week_key, bpi desc);
create index if not exists runs_game_week_score_idx on runs (game_id, week_key, score desc);

create index if not exists users_best_idx on users (best_score desc, rating desc);
create index if not exists users_rating_idx on users (rating desc, best_score desc);
create index if not exists users_bpi_idx on users (best_bpi desc, best_score desc);
create index if not exists users_seen_idx on users (last_seen desc);
create index if not exists users_country_idx on users (country, region, last_seen desc);

-- Small game catalogue so profiles can grow past one game without a schema change.
create table if not exists games (
  id text primary key,
  name text not null,
  short_name text not null,
  sort integer not null default 0,
  active boolean not null default true
);

insert into games (id, name, short_name, sort, active)
values ('tile-rush', 'TILE RUSH', 'TR', 1, true)
on conflict (id) do nothing;

-- Lifetime per-game totals.
create table if not exists user_game_stats (
  user_id uuid not null references users(id) on delete cascade,
  game_id text not null references games(id) on delete cascade,
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  best_score integer not null default 0 check (best_score >= 0),
  best_bpi integer not null default 0 check (best_bpi >= 0),
  best_tier integer not null default 0 check (best_tier >= 0),
  correct integer not null default 0 check (correct >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  rt_sum bigint not null default 0,
  rt_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index if not exists user_game_stats_bpi_idx on user_game_stats (game_id, best_bpi desc);
create index if not exists user_game_stats_score_idx on user_game_stats (game_id, best_score desc);

-- Per-season totals. season_key is YYYY-MM; week_key is ISO YYYY-Www.
create table if not exists season_stats (
  user_id uuid not null references users(id) on delete cascade,
  game_id text not null references games(id) on delete cascade,
  season_key text not null,
  games integer not null default 0 check (games >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  correct integer not null default 0 check (correct >= 0),
  attempts integer not null default 0 check (attempts >= 0),
  best_score integer not null default 0 check (best_score >= 0),
  best_bpi integer not null default 0 check (best_bpi >= 0),
  best_rank integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id, season_key)
);

create index if not exists season_stats_rank_idx on season_stats (game_id, season_key, best_bpi desc);
