-- ─────────────────────────────────────────────────────────────────────────────
-- Growth funnel metrics for the Admin dashboard
-- 30 Acts of Kindness — Saturday, August 29, 2026
--
-- Run this in the Supabase SQL EDITOR (not PowerShell — the $fn$ quoting will
-- not survive a paste into a PowerShell window).
--
-- Safe to run before launch. Every count returns 0 or a dash until there is
-- real data, so the tiles simply fill in on their own once the app is live.
--
-- It does NOT touch admin_dashboard_stats(). The existing Overview tiles keep
-- working exactly as they do now.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. A place for numbers the database cannot know ──────────────────────────
-- App Store downloads live in App Store Connect. Nothing in Supabase can see
-- them, and no query will ever produce that number. So it is stored here and
-- updated by hand. Until you set it, the tile shows a dash.

CREATE TABLE IF NOT EXISTS public.app_metrics (
  key        text PRIMARY KEY,
  value      bigint,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_metrics_admin_all ON public.app_metrics;
CREATE POLICY app_metrics_admin_all ON public.app_metrics
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.admins a WHERE a.email = auth.jwt() ->> 'email'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admins a WHERE a.email = auth.jwt() ->> 'email'));

INSERT INTO public.app_metrics (key, value)
VALUES ('downloads', NULL)
ON CONFLICT (key) DO NOTHING;

-- ── 2. The funnel function ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_growth_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_downloads   bigint;
  v_signins     bigint;
  v_did_one_act bigint;
  v_streak30    bigint;
BEGIN
  -- Admin-only, same idea as the other admin functions.
  IF NOT EXISTS (
    SELECT 1 FROM public.admins a WHERE a.email = auth.jwt() ->> 'email'
  ) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  -- Downloads: hand-entered, from App Store Connect.
  SELECT value INTO v_downloads
  FROM public.app_metrics
  WHERE key = 'downloads';

  -- Signed in at least once. Supabase records this on every successful login,
  -- so it counts real people who got through auth, not just rows created.
  SELECT count(*) INTO v_signins
  FROM auth.users
  WHERE last_sign_in_at IS NOT NULL;

  -- Completed at least one act.
  SELECT count(DISTINCT user_phone) INTO v_did_one_act
  FROM public.completions
  WHERE user_phone IS NOT NULL;

  -- Completed 30 calendar days in a row.
  --
  -- Classic gaps-and-islands: number each person's distinct completion dates in
  -- order, subtract that number from the date, and every unbroken run collapses
  -- to the same value. Group by it, and a run of 30 consecutive days is a group
  -- of 30 rows. This counts a genuine 30-day streak, not merely 30 acts.
  WITH d AS (
    SELECT DISTINCT user_phone, local_date::date AS ld
    FROM public.completions
    WHERE user_phone IS NOT NULL
      AND local_date IS NOT NULL
  ),
  g AS (
    SELECT
      user_phone,
      ld,
      ld - (row_number() OVER (PARTITION BY user_phone ORDER BY ld))::int AS grp
    FROM d
  ),
  runs AS (
    SELECT user_phone, grp, count(*) AS run_len
    FROM g
    GROUP BY user_phone, grp
  )
  SELECT count(DISTINCT user_phone) INTO v_streak30
  FROM runs
  WHERE run_len >= 30;

  RETURN json_build_object(
    'downloads',   v_downloads,               -- NULL until entered by hand
    'signins',     COALESCE(v_signins, 0),
    'did_one_act', COALESCE(v_did_one_act, 0),
    'streak_30',   COALESCE(v_streak30, 0)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_growth_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_growth_stats() TO authenticated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Check it works (run as yourself, signed in as an admin):
--
--   SELECT public.admin_growth_stats();
--
-- Expect something like:
--   {"downloads": null, "signins": 3, "did_one_act": 1, "streak_30": 0}
--
--
-- To set the download count once you are live, read it off App Store Connect
-- (Analytics → Total Downloads) and run:
--
--   UPDATE public.app_metrics
--   SET value = 1234, updated_at = now()
--   WHERE key = 'downloads';
--
-- ─────────────────────────────────────────────────────────────────────────────
