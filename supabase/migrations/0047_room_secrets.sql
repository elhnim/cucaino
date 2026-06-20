-- Hidden simultaneous submissions for any multiplayer game (redaction).
--
-- Each player's secret choice (e.g. Village Pillage picks) is written here via a
-- SECURITY DEFINER RPC. The table has RLS enabled with NO policies, so clients
-- can never read each other's secrets directly. Only when every member has
-- submitted does the RPC expose all choices at once into the public room state
-- (game_rooms.state.game.reveal) — a true simultaneous reveal.

CREATE TABLE IF NOT EXISTS public.room_secrets (
  room_id   uuid NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  member_id text NOT NULL,
  payload   jsonb NOT NULL,
  PRIMARY KEY (room_id, member_id)
);

ALTER TABLE public.room_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the SECURITY DEFINER function below may touch it.

CREATE OR REPLACE FUNCTION public.submit_room_secret(
  p_room_id   uuid,
  p_member_id text,
  p_payload   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_family   uuid;
  v_state    jsonb;
  v_members  int;
  v_secrets  int;
  v_reveal   jsonb;
BEGIN
  -- Lock the room so concurrent submissions serialize (both reach the reveal).
  SELECT family_id, state INTO v_family, v_state
    FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_family IS NULL THEN RAISE EXCEPTION 'room not found'; END IF;
  IF v_family <> public.current_family_id() THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.room_secrets(room_id, member_id, payload)
    VALUES (p_room_id, p_member_id, p_payload)
    ON CONFLICT (room_id, member_id) DO UPDATE SET payload = EXCLUDED.payload;

  -- Ensure the nested containers exist before setting the sentinel.
  IF v_state #> '{game}' IS NULL THEN
    v_state := jsonb_set(v_state, '{game}', '{}'::jsonb, true);
  END IF;
  IF v_state #> '{game,submitted}' IS NULL THEN
    v_state := jsonb_set(v_state, '{game,submitted}', '{}'::jsonb, true);
  END IF;
  v_state := jsonb_set(v_state, ARRAY['game', 'submitted', p_member_id], 'true'::jsonb, true);

  v_members := jsonb_array_length(v_state -> 'members');
  SELECT count(*) INTO v_secrets FROM public.room_secrets WHERE room_id = p_room_id;

  IF v_secrets >= v_members THEN
    SELECT jsonb_object_agg(member_id, payload) INTO v_reveal
      FROM public.room_secrets WHERE room_id = p_room_id;
    v_state := jsonb_set(v_state, '{game,reveal}', v_reveal, true);
    v_state := v_state #- '{game,submitted}';
    DELETE FROM public.room_secrets WHERE room_id = p_room_id;
  END IF;

  UPDATE public.game_rooms SET state = v_state, updated_at = now() WHERE id = p_room_id;
END $$;
