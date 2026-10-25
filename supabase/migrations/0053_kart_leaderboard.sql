-- Cucaino Karts: one ranking for all the family's kids AND their accepted friends.
--
-- kart_laps is family-scoped by RLS (0052), so a plain select can only ever see the caller's own
-- family's laps. This function returns the best lap per kid on a track for every kid in the
-- caller's family plus every kid who is an accepted friend of one of them (kid_friendships, 0036 —
-- either direction of the row). SECURITY DEFINER so it can read friends' rows, but it only ever
-- returns a name, the kart animal and the lap time — never the ghost recording or anything else
-- about another family.

CREATE OR REPLACE FUNCTION public.kart_leaderboard(p_track text)
RETURNS TABLE (kid_id uuid, name text, animal text, lap_ms integer, is_friend boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH fam AS (
    SELECT id FROM public.kids WHERE family_id = public.current_family_id()
  ),
  fr AS (
    SELECT f.friend_id AS id FROM public.kid_friendships f
     WHERE f.status = 'accepted' AND f.kid_id IN (SELECT id FROM fam)
    UNION
    SELECT f.kid_id AS id FROM public.kid_friendships f
     WHERE f.status = 'accepted' AND f.friend_id IN (SELECT id FROM fam)
  ),
  racers AS (
    SELECT id, false AS is_friend FROM fam
    UNION ALL
    SELECT id, true AS is_friend FROM fr WHERE id NOT IN (SELECT id FROM fam)
  )
  SELECT l.kid_id,
         COALESCE(k.name, l.ghost->>'name', 'Racer') AS name,
         COALESCE(l.ghost->>'animal', '') AS animal,
         l.lap_ms,
         r.is_friend
    FROM public.kart_laps l
    JOIN racers r ON r.id = l.kid_id
    JOIN public.kids k ON k.id = l.kid_id
   WHERE l.track_id = p_track
   ORDER BY l.lap_ms ASC
   LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.kart_leaderboard(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kart_leaderboard(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.kart_leaderboard(text) TO authenticated;
