ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS pay_day_of_week integer,       -- 0=Sun … 6=Sat; null = disabled
  ADD COLUMN IF NOT EXISTS weekly_allowance_cents integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.allowance_payouts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kid_id     uuid        NOT NULL REFERENCES public.kids(id)    ON DELETE CASCADE,
  pay_date   date        NOT NULL,
  allowance_cents  integer NOT NULL DEFAULT 0,
  strike_count     integer NOT NULL DEFAULT 0,
  paid_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT allowance_payouts_kid_pay_date_key UNIQUE (kid_id, pay_date)
);

ALTER TABLE public.allowance_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "family_scope" ON public.allowance_payouts
  USING (family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid()));
