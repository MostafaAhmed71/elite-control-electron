-- =============================================================================
-- الخطوة 3 من 3 — بعد انتهاء استيراد CSV
-- =============================================================================
-- يعيد إنشاء الأعمدة المولَّدة portal_* والفهارس المرتبطة بها.
-- يتطلب أن تكون دوال portal_norm_key موجودة (من full_schema.sql).
-- =============================================================================

BEGIN;

-- ── students ───────────────────────────────────────────────────────────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS portal_national_norm text
  GENERATED ALWAYS AS (
    public.portal_norm_key(
      COALESCE(
        NULLIF(trim(data ->> 'nationalId'), ''),
        NULLIF(trim(data ->> 'national_id'), '')
      )
    )
  ) STORED;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS portal_seat_norm text
  GENERATED ALWAYS AS (
    public.portal_norm_key(
      COALESCE(
        NULLIF(trim(data ->> 'seatNumber'), ''),
        NULLIF(trim(data ->> 'seat_number'), '')
      )
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_students_portal_national_norm_col
  ON public.students (portal_national_norm)
  WHERE portal_national_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_portal_seat_norm_col
  ON public.students (portal_seat_norm)
  WHERE portal_seat_norm IS NOT NULL;

-- ── omr_results ──────────────────────────────────────────────────────────────

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

ALTER TABLE public.omr_results
  ADD COLUMN IF NOT EXISTS portal_student_id_norm text
  GENERATED ALWAYS AS (public.portal_norm_key((data ->> 'studentId'))) STORED;

ALTER TABLE public.omr_results
  ADD COLUMN IF NOT EXISTS portal_detected_id_norm text
  GENERATED ALWAYS AS (public.portal_norm_key((data ->> 'detectedStudentId'))) STORED;

ALTER TABLE public.omr_results
  ADD COLUMN IF NOT EXISTS portal_norm_detected_id_norm text
  GENERATED ALWAYS AS (public.portal_norm_key((data ->> 'normalizedDetectedStudentId'))) STORED;

CREATE INDEX IF NOT EXISTS idx_omr_portal_national_norm_col
  ON public.omr_results (portal_national_norm)
  WHERE portal_national_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_student_id_norm_col
  ON public.omr_results (portal_student_id_norm)
  WHERE portal_student_id_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_detected_id_norm_col
  ON public.omr_results (portal_detected_id_norm)
  WHERE portal_detected_id_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_norm_detected_id_norm_col
  ON public.omr_results (portal_norm_detected_id_norm)
  WHERE portal_norm_detected_id_norm IS NOT NULL;

UPDATE public.students SET data = data WHERE true;
UPDATE public.omr_results SET data = data WHERE true;

COMMIT;
