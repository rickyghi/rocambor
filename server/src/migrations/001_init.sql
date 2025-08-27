create table if not exists players (
  id uuid primary key,
  handle text,
  created_at timestamptz default now(),
  elo integer default 1200
);
create table if not exists rooms (
  id text primary key,
  mode text not null,
  created_at timestamptz default now(),
  status text default 'active'
);
create table if not exists hands (
  id bigserial primary key,
  room_id text references rooms(id),
  hand_no integer not null,
  seed text,
  trump text,
  ombre text,
  resting text,
  created_at timestamptz default now()
);
create table if not exists actions (
  id bigserial primary key,
  hand_id bigint references hands(id),
  seq integer not null,
  player_id uuid,
  seat text,
  type text not null,
  payload jsonb,
  ts timestamptz default now()
);
create table if not exists results (
  id bigserial primary key,
  room_id text references rooms(id),
  hand_no integer,
  result text,
  points integer,
  award jsonb,
  tricks jsonb,
  scores jsonb,
  created_at timestamptz default now()
);
