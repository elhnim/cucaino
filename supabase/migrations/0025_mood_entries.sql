CREATE TABLE IF NOT EXISTS public.mood_entries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid        NOT NULL REFERENCES public.families (id) ON DELETE CASCADE,
  kid_id      uuid        NOT NULL REFERENCES public.kids (id) ON DELETE CASCADE,
  mood        text        NOT NULL,
  date        date        NOT NULL DEFAULT CURRENT_DATE,
  logged_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mood_entries_kid_date_idx ON public.mood_entries (kid_id, date);

ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.mood_entries
  USING (family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid()));
