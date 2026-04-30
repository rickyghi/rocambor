# Supabase Setup

This project now has a Supabase-aware auth, profile, wallet, stakes, match-history, avatar-upload, and account-realtime layer.

The remaining activation work is mostly environment wiring plus running the SQL migrations against your Supabase Postgres database.

## 1. Create the Supabase project

Create one Supabase project and keep these values handy:

- `Project URL`
- `Anon / publishable key`
- `Database connection string`

You will also need a random secret for WebSocket auth tickets:

- `WS_AUTH_SECRET`

## 2. Configure environments

### Netlify client env

Set these in Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_WS_URL=wss://rocambor-server-production.up.railway.app`
- `VITE_API_URL=https://rocambor-server-production.up.railway.app`

### Railway server env

Set these in Railway:

- `DATABASE_URL` or `POSTGRES_URL`
- `SUPABASE_PROJECT_URL`
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `WS_AUTH_SECRET`

## 3. Run migrations

The server migration runner applies every SQL file in `server/migrations/` in order.

For Supabase activation, the required migrations are:

- `003_add_account_profile_settings.sql`
- `004_add_friendly_tokens.sql`
- `005_add_match_history.sql`
- `006_enable_supabase_activation.sql`
- `007_add_match_activity.sql`

Run:

```bash
cd server
npm run build
DATABASE_URL="your-supabase-postgres-url" npm run migrate
```

`006_enable_supabase_activation.sql` is written to be safe on plain Postgres too:

- it only creates Supabase auth-based policies if `auth.uid()` exists
- it only creates the `avatars` bucket if `storage.buckets` exists
- it only adds realtime tables if `supabase_realtime` exists

## 4. Auth providers

Enable Google inside Supabase Auth. Rocambor currently exposes Google as the
only social sign-in option in the client.

Make sure the allowed redirect URLs include your local and production app URLs.

## 5. Storage expectations

The app uploads portraits directly from the browser into the `avatars` bucket.

Expected path format:

- `{auth.uid()}/avatar-<timestamp>.<ext>`

The migration creates policies so that:

- anyone can read portrait files
- authenticated users can only write, update, or delete files inside their own folder

## 6. Realtime expectations

The client subscribes to Postgres changes for:

- `players`
- `token_ledger`
- `match_participants`

The app also exposes a recent public match-activity feed through `/api/activity`, backed by `match_activity`.

The activation migration adds:

- RLS policies so signed-in users can only see their own player, wallet, and match-participant rows
- `supabase_realtime` publication entries for the tables the client listens to

## 7. What should work after setup

Once the env vars are set and migrations have run, the following should work end to end:

- sign in with Supabase Auth
- `/api/me`, `/api/me/profile`, `/api/me/wallet`, `/api/me/matches`
- friendly token balances and rescue claims
- staked room / quick-play gating
- persistent match history
- portrait uploads to Supabase Storage
- live wallet / profile / match-history refresh on signed-in clients

## 8. Known limitation

The server remains the authority for actual gameplay and match settlement.

Supabase is currently used for:

- identity
- persistent profile/account data
- token and match persistence
- avatar storage
- account-scoped realtime refreshes
