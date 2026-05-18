create table if not exists users (
  id uuid primary key,
  line_works_user_id text unique,
  username text unique,
  display_name text not null,
  email text,
  password_hash text,
  role text not null default 'user',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key,
  name text not null unique,
  capacity integer not null check (capacity > 0),
  equipment text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key,
  room_id uuid not null references rooms(id),
  user_id uuid references users(id),
  host_name text not null,
  subject text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  attendees integer not null check (attendees > 0),
  note text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists audit_logs (
  id uuid primary key,
  actor_user_id uuid references users(id),
  action text not null,
  target_type text not null,
  target_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bookings_room_date_idx on bookings(room_id, date);
create index if not exists bookings_date_idx on bookings(date);
