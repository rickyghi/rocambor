-- Enable RLS on remaining public tables that lacked it.
-- Server (via pg DATABASE_URL + service role) bypasses RLS; the client never
-- queries these tables through PostgREST or realtime, so "RLS on, no policy"
-- = deny-all for anon/authed REST while the server keeps full access.

alter table if exists public.hands          enable row level security;
alter table if exists public.actions        enable row level security;
alter table if exists public.results        enable row level security;
alter table if exists public.match_players  enable row level security;
alter table if exists public.match_activity enable row level security;

comment on table public.hands          is 'Server-only (RLS deny-all). Written by game server; not exposed via PostgREST.';
comment on table public.actions        is 'Server-only (RLS deny-all). Written by game server; not exposed via PostgREST.';
comment on table public.results        is 'Server-only (RLS deny-all). Written by game server; not exposed via PostgREST.';
comment on table public.match_players  is 'Server-only (RLS deny-all). Written by game server; not exposed via PostgREST.';
comment on table public.match_activity is 'Server-only (RLS deny-all). Public feed served via /api/activity.';
