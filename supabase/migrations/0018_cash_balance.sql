-- ============================================================================
-- Cucaino — cash balance system
-- ============================================================================

-- Kids: running cash balance stored in cents
ALTER TABLE public.kids
  ADD COLUMN IF NOT EXISTS cash_balance integer NOT NULL DEFAULT 0;

-- Tasks: optional cash payout per completion + parent approval flag
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS cash_value_cents          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_parent_approval  boolean NOT NULL DEFAULT false;

-- Task completions: cash amounts + approval tracking
ALTER TABLE public.task_completions
  ADD COLUMN IF NOT EXISTS cash_awarded_cents       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_parent_approval  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_approved_at       timestamptz;

-- Rewards: optional cash cost alongside star cost
ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS cost_cash_cents integer NOT NULL DEFAULT 0;

-- Reward requests: track which currency was chosen
ALTER TABLE public.reward_requests
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'stars'
    CHECK (payment_type IN ('stars', 'cash'));

-- Cash transaction ledger
CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid        NOT NULL REFERENCES public.families (id) ON DELETE CASCADE,
  kid_id       uuid        NOT NULL REFERENCES public.kids     (id) ON DELETE CASCADE,
  amount_cents integer     NOT NULL,
  description  text        NOT NULL,
  type         text        NOT NULL CHECK (type IN ('credit', 'debit')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_transactions_kid_id_idx
  ON public.cash_transactions (kid_id, created_at DESC);

ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.cash_transactions
  USING (
    family_id = (SELECT id FROM public.families WHERE owner_user_id = auth.uid())
  );

-- Atomic cash balance update. Negative amount = debit. Floors at 0.
CREATE OR REPLACE FUNCTION public.increment_kid_cash(
  p_kid_id       uuid,
  p_amount_cents integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.kids
     SET cash_balance = GREATEST(0, cash_balance + p_amount_cents)
   WHERE id = p_kid_id;
END;
$$;
