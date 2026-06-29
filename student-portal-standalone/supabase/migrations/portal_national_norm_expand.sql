-- Expand portal_national_norm to include studentId when it looks like national ID.
-- Run in Supabase SQL Editor after portal.sql.

ALTER TABLE public.omr_results DROP COLUMN IF EXISTS portal_national_norm;

ALTER TABLE public.omr_results
  ADD COLUMN portal_national_norm text
  GENERATED ALWAYS AS (
    public.portal_norm_key(
      COALESCE(
        NULLIF(trim(data ->> 'nationalId'), ''),
        NULLIF(trim(data ->> 'national_id'), ''),
        CASE
          WHEN length(public.portal_norm_key(COALESCE(data ->> 'studentId', ''))) >= 8
            THEN NULLIF(trim(data ->> 'studentId'), '')
          ELSE NULL
        END,
        CASE
          WHEN length(public.portal_norm_key(COALESCE(data ->> 'detectedStudentId', ''))) >= 8
            THEN NULLIF(trim(data ->> 'detectedStudentId'), '')
          ELSE NULL
        END
      )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_omr_portal_national_norm_col
  ON public.omr_results (portal_national_norm)
  WHERE portal_national_norm IS NOT NULL;
