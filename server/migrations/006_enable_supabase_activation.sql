ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT ON players TO authenticated;
    GRANT SELECT ON token_ledger TO authenticated;
    GRANT SELECT ON matches TO authenticated;
    GRANT SELECT ON match_participants TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
  END IF;
END $$;

DO $$
DECLARE
  has_auth_uid boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'auth'
       AND p.proname = 'uid'
  )
  INTO has_auth_uid;

  IF NOT has_auth_uid THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS players_self_select ON players';
  EXECUTE 'CREATE POLICY players_self_select ON players
    FOR SELECT
    USING (auth_user_id = auth.uid())';

  EXECUTE 'DROP POLICY IF EXISTS token_ledger_self_select ON token_ledger';
  EXECUTE 'CREATE POLICY token_ledger_self_select ON token_ledger
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
          FROM players
         WHERE players.id = token_ledger.player_id
           AND players.auth_user_id = auth.uid()
      )
    )';

  EXECUTE 'DROP POLICY IF EXISTS match_participants_self_select ON match_participants';
  EXECUTE 'CREATE POLICY match_participants_self_select ON match_participants
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
          FROM players
         WHERE players.id = match_participants.player_id
           AND players.auth_user_id = auth.uid()
      )
    )';

  EXECUTE 'DROP POLICY IF EXISTS matches_self_select ON matches';
  EXECUTE 'CREATE POLICY matches_self_select ON matches
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
          FROM match_participants
          JOIN players ON players.id = match_participants.player_id
         WHERE match_participants.match_id = matches.id
           AND players.auth_user_id = auth.uid()
      )
    )';
END $$;

DO $$
DECLARE
  has_publication boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM pg_publication
     WHERE pubname = 'supabase_realtime'
  )
  INTO has_publication;

  IF NOT has_publication THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_publication p ON p.oid = pr.prpubid
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'public'
       AND c.relname = 'players'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.players';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_publication p ON p.oid = pr.prpubid
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'public'
       AND c.relname = 'token_ledger'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.token_ledger';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_publication p ON p.oid = pr.prpubid
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'public'
       AND c.relname = 'matches'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.matches';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_publication p ON p.oid = pr.prpubid
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'public'
       AND c.relname = 'match_participants'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.match_participants';
  END IF;
END $$;

DO $$
DECLARE
  has_storage_bucket_table boolean;
  has_storage_objects_table boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'storage'
       AND table_name = 'buckets'
  )
  INTO has_storage_bucket_table;

  SELECT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'storage'
       AND table_name = 'objects'
  )
  INTO has_storage_objects_table;

  IF has_storage_bucket_table THEN
    EXECUTE $bucket$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'avatars',
        'avatars',
        true,
        5242880,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
      )
      ON CONFLICT (id) DO UPDATE
        SET public = EXCLUDED.public,
            file_size_limit = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types
    $bucket$;
  END IF;

  IF NOT has_storage_objects_table THEN
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS avatars_public_read ON storage.objects';
  EXECUTE $policy$CREATE POLICY avatars_public_read ON storage.objects
    FOR SELECT
    USING (bucket_id = 'avatars')$policy$;

  EXECUTE 'DROP POLICY IF EXISTS avatars_authenticated_insert ON storage.objects';
  EXECUTE $policy$CREATE POLICY avatars_authenticated_insert ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )$policy$;

  EXECUTE 'DROP POLICY IF EXISTS avatars_authenticated_update ON storage.objects';
  EXECUTE $policy$CREATE POLICY avatars_authenticated_update ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )$policy$;

  EXECUTE 'DROP POLICY IF EXISTS avatars_authenticated_delete ON storage.objects';
  EXECUTE $policy$CREATE POLICY avatars_authenticated_delete ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )$policy$;
END $$;
