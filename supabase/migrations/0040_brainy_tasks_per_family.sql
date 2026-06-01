-- Give every family its own editable copy of the 20 Brainy tasks.
--
-- Background: Brainy tasks were originally seeded as global built-in templates
-- (family_id NULL, is_builtin true). RLS blocks editing built-in rows, so
-- parents could not change them. Migration 0035 reassigned them to the single
-- oldest family, which fixed editing for that family but removed the tasks from
-- every other family. This migration makes Brainy tasks per-family, like all
-- other starter tasks.
--
-- Idempotent: only inserts Brainy tasks for families that currently have none.

-- 1. Remove any leftover global built-in Brainy templates (none expected after
--    0035, but guard against re-seeds and partial states).
DELETE FROM public.tasks
WHERE is_builtin = true AND category = 'brainy';

-- 2. Insert the 20 Brainy tasks for each family that has zero Brainy tasks.
INSERT INTO public.tasks (
  family_id, name, category, icon,
  schedule_type, days_of_week, time_block,
  points, family_points_contribution,
  requires_timer, requires_completion,
  active, is_builtin, rule, kid_can_add,
  cash_value_cents, description
)
SELECT
  f.id, t.name, 'brainy', t.icon,
  'daily', '{1,2,3,4,5,6,7}', 'anytime',
  t.points, 0,
  false, true,
  true, false, 'flexible', true,
  t.cash_value_cents, t.description
FROM public.families f
CROSS JOIN (VALUES
  ('Watch a TED Talk', '🎤', 30, 300, 'Watch any TED Talk (ted.com or YouTube). Report: the title, 2 things you learned, and 1 thing you want to try.'),
  ('Listen to a Podcast', '🎧', 25, 250, 'Listen to a full podcast episode on any topic. Report: the topic, 2 takeaways, and 1 question it made you think about.'),
  ('Read a Non-Fiction Chapter', '📖', 20, 200, 'Read one chapter from any non-fiction book. Write a short summary and one thing that surprised you.'),
  ('Teach It Back', '🧑‍🏫', 30, 300, 'Learn something new about any topic. Then teach it to a family member for at least 5 minutes. Parent rates your explanation.'),
  ('Budget a Dream Purchase', '💸', 40, 400, 'Pick something you want that costs over $50. Research the price, figure out how long it''ll take to save for it, and present your plan.'),
  ('Subscription Audit', '📋', 50, 500, 'Find 3 subscriptions the family pays for. Write down how much each costs per year. Suggest one that could be cancelled and why.'),
  ('Compound Interest Explorer', '📈', 30, 300, 'Use an online calculator: if you save $5 a week for 10 years at 5% interest, how much do you end up with? What about $10/week? Report your findings and what surprised you.'),
  ('Research a Successful Person', '🌟', 30, 300, 'Pick someone successful. Research their story and share 3 decisions that helped them succeed.'),
  ('Learn a New Skill (Tutorial)', '🛠️', 25, 250, 'Watch a how-to video and learn a new practical skill. Describe what you learned and show or demonstrate it.'),
  ('Read & Summarise a News Article', '📰', 15, 150, 'Read a full news article (not social media). Summarise what happened, who it affects, and give your opinion.'),
  ('Neighbourhood Business Idea', '💡', 40, 400, 'Come up with a business idea for your street or neighbourhood. Who''s the customer, what problem does it solve, and how much would you charge?'),
  ('Grocery Savings Hunt', '🛒', 35, 350, 'Look at the family grocery list. Find 3 items where you could save money (generic brand, different store, or coupon). Report how much you could save in total.'),
  ('Career Explorer', '👩‍💼', 25, 250, 'Pick a job you find interesting. Research: what skills it needs, what it typically pays, and how you''d get there.'),
  ('Watch a Documentary', '🎬', 35, 350, 'Watch any documentary (nature, history, science, technology). Report 3 things you learned and one question you now have.'),
  ('Compare Before You Buy', '🔍', 30, 300, 'For any upcoming family purchase over $30, research at least 3 options or prices. Present your recommendation with reasons.'),
  ('Interview an Adult', '🎙️', 40, 400, 'Interview a parent, grandparent, or family friend. Ask: what do you do for work, what''s the best money decision you ever made, and one piece of advice for kids. Report back.'),
  ('Savings Goal Map', '🗺️', 35, 350, 'Set a savings goal for something you want to buy. Write out: how much it costs, how long it''ll take, and which gigs you''ll do to earn it.'),
  ('"How It''s Made" Research', '🏭', 25, 250, 'Pick any everyday product (phone, cereal, shoes). Research how it''s made and where the materials come from. Share 3 facts you found interesting.'),
  ('Generosity Research', '🤝', 25, 250, 'Find 3 local or online charities or volunteer opportunities. Pick one you''d want to support and explain why giving matters to you.'),
  ('Book Chapter (Rich Dad Poor Dad or similar)', '💰', 30, 300, 'Read one chapter from an approved money/success book. Write a 5-sentence summary and one thing you want to apply in your life.')
) AS t(name, icon, points, cash_value_cents, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tasks x
  WHERE x.family_id = f.id AND x.category = 'brainy'
);
