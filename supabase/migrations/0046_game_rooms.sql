-- Generic multi-device realtime backend for ANY game.
--
-- One row per game room. The whole room state (members + game-specific state)
-- lives in `state` (jsonb) so a single realtime subscription on the row keeps
-- every device in sync. `game_key` namespaces rooms per game (e.g. the first
-- consumer is 'village-pillage').

CREATE TABLE IF NOT EXISTS public.game_rooms (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  game_key   text        NOT NULL,
  room_code  text        NOT NULL,
  status     text        NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
  state      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Look up an open room by code within a family + game (codes are reused over time).
CREATE INDEX IF NOT EXISTS game_rooms_lookup_idx
  ON public.game_rooms (family_id, game_key, room_code);

ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

-- All devices signed into the same family share game rooms.
CREATE POLICY "family_scope" ON public.game_rooms
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- Atomic single-path write so simultaneous move submissions from different
-- devices don't clobber each other (each writes its own path under state).
-- SECURITY INVOKER so the family_scope RLS policy still applies.
CREATE OR REPLACE FUNCTION public.set_room_state_path(
  p_room_id uuid,
  p_path    text[],
  p_value   jsonb
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
AS $$
  UPDATE public.game_rooms
     SET state = jsonb_set(state, p_path, p_value, true),
         updated_at = now()
   WHERE id = p_room_id;
$$;

-- Broadcast row changes so every device sees moves/resolutions live.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- Tidy up abandoned rooms after a day (idempotent; no-op without pg_cron).
DO $$
BEGIN
  PERFORM cron.unschedule('delete-old-game-rooms');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'delete-old-game-rooms',
    '0 4 * * *',
    'delete from public.game_rooms where updated_at < now() - interval ''1 day'''
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
