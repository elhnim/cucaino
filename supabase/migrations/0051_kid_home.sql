-- Cucaino Park "My Home": each kid's cottage (bedroom + pet corner) that they decorate with
-- furniture bought with park tickets. Additive only: two columns on kid_parks (the existing
-- family_scope RLS policy already covers them) + one helper function.
--
--   home        the layout: { "v": 1, "placed": [{ "uid", "item", "room", "gx", "gz", "r", "wall"? }],
--                             "rooms": { "bedroom": { "wall", "floor" }, "den": { ... } } }
--               '{}' = never visited -> the app shows the free starter home
--   home_owned  copies bought per catalogue item, e.g. { "sofa": 1, "beanbag": 2, "wp-stars": 1 }
--               (free starter items are never stored here)
-- Kept in two columns so saving a layout can never overwrite a purchase made at the same time.
-- Rules (catalogue, grid, collisions, ownership) live in lib/park/home/rules.ts and are
-- re-checked by the server actions in lib/actions/home.ts.

ALTER TABLE public.kid_parks
  ADD COLUMN IF NOT EXISTS home jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS home_owned jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.kid_parks.home IS 'My Home layout (lib/park/home/rules.ts HomeLayout); {} = starter home';
COMMENT ON COLUMN public.kid_parks.home_owned IS 'My Home items bought with tickets: { item_id: copies }';

-- Buy one copy of a home item in a single atomic UPDATE: only succeeds if the kid still has
-- enough tickets and owns fewer than p_max copies, so two quick taps can never double-spend.
-- SECURITY INVOKER: runs as the caller, so the family_scope policy still applies. Price and
-- limit come from the server action (lib/actions/home.ts), which reads them from the catalogue.
-- Returns the new ticket balance, or NULL if nothing was bought.
CREATE OR REPLACE FUNCTION public.buy_home_item(p_kid_id uuid, p_item text, p_cost integer, p_max integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tickets integer;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 OR p_max IS NULL OR p_max <= 0 OR p_item IS NULL OR length(p_item) > 40 THEN
    RETURN NULL;
  END IF;
  UPDATE public.kid_parks
     SET tickets = tickets - p_cost,
         home_owned = jsonb_set(
           home_owned,
           ARRAY[p_item],
           to_jsonb(COALESCE((home_owned ->> p_item)::integer, 0) + 1),
           true
         ),
         updated_at = now()
   WHERE kid_id = p_kid_id
     AND tickets >= p_cost
     AND COALESCE((home_owned ->> p_item)::integer, 0) < p_max
  RETURNING tickets INTO v_tickets;
  RETURN v_tickets;
END;
$$;
