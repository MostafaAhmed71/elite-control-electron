-- =============================================================================
-- Elite Control / نخبة الشمال — مخطط Supabase الكامل
-- =============================================================================
-- الاستخدام: Supabase Dashboard → SQL Editor → لصق الملف كاملاً → Run
--
-- يشمل:
--   • الجداول (students, committees, observers, locations, omr_exams, omr_results, settings, retake_requests)
--   • دوال البوابة والرصد (portal_*, fetch_omr_results_grading_page)
--   • أعمدة مولَّدة + فهارس
--   • RLS وسياسات anon (متوافقة مع التطبيق الحالي بدون تسجيل دخول Supabase Auth)
--
-- آمن للمشاريع الجديدة: لا يحذف جداول موجودة (IF NOT EXISTS).
-- لإعادة البناء من الصفر: أزل التعليق عن قسم «إسقاط اختياري» في الأسفل.
--
-- بعد التشغيل: حدّث .env في التطبيق:
--   VITE_SUPABASE_URL=...
--   VITE_SUPABASE_ANON_KEY=...
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) امتدادات
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) الجداول الأساسية
--    النمط: id + data (jsonb) — التطبيق يخزن كل الحقول داخل data
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.students (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.committees (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.observers (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.locations (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omr_exams (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omr_results (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- إعدادات النظام: مفاتيح معروفة — app_config | assignments | omr_subjects
CREATE TABLE IF NOT EXISTS public.settings (
  id          text PRIMARY KEY,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- طلبات إعادة الاختبار (بوابة الطالب)
CREATE TABLE IF NOT EXISTS public.retake_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ترقية جداول قديمة (بدون created_at / updated_at)
ALTER TABLE public.students     ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.students     ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.committees   ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.committees   ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.observers    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.observers    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.locations    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.locations    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.omr_exams    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.omr_exams    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.omr_results  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.omr_results  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.settings     ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.settings     ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) فهارس عامة + تحديث updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_students_created_at ON public.students (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omr_results_created_at ON public.omr_results (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omr_results_data_gin ON public.omr_results USING gin (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_students_data_gin ON public.students USING gin (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_retake_requests_created_at ON public.retake_requests (created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $trg$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students', 'committees', 'observers', 'locations',
    'omr_exams', 'omr_results', 'settings'
  ]
  LOOP
    EXECUTE format($f$
      DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
      CREATE TRIGGER trg_%1$s_updated_at
        BEFORE UPDATE ON public.%1$s
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    $f$, t);
  END LOOP;
END;
$trg$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) دوال مساعدة — البوابة والرصد
-- ─────────────────────────────────────────────────────────────────────────────

-- يطابق JS normalizeNationalId (أرقام عربية/فارسية → لاتينية، إزالة غير أبجدي رقمي)
CREATE OR REPLACE FUNCTION public.portal_norm_key(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $f$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        translate(
          trim(COALESCE(input, '')),
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          '01234567890123456789'
        ),
        '[^0-9A-Za-z]',
        '',
        'g'
      ),
      '^0+',
      ''
    ),
    ''
  );
$f$;

CREATE OR REPLACE FUNCTION public.portal_omr_row_visible(d jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $v$
  SELECT
    lower(trim(COALESCE(d ->> 'approved', ''))) IN ('true', '1', 't', 'yes')
    OR lower(trim(COALESCE(d ->> 'confirmed', ''))) IN ('true', '1', 't', 'yes')
    OR (length(trim(COALESCE(d ->> 'approvedAt', ''))) > 0)
    OR (
      length(trim(COALESCE(d ->> 'studentId', ''))) > 0
      AND (COALESCE(d, '{}'::jsonb) ? 'score')
    );
$v$;

CREATE OR REPLACE FUNCTION public.portal_payload_strip(d jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $p$
  SELECT (COALESCE(d, '{}'::jsonb)
    - 'reviewRois'
    - 'systemViewImage'
    - 'sheetPreview'
    - 'previewUrl'
    - 'details');
$p$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) أعمدة مولَّدة (STORED) للبحث السريع في البوابة
-- ─────────────────────────────────────────────────────────────────────────────

-- omr_results.portal_national_norm (نسخة موسّعة: هوية + studentId/detected إن طولها ≥ 8)
ALTER TABLE public.omr_results DROP COLUMN IF EXISTS portal_national_norm;

ALTER TABLE public.omr_results
  ADD COLUMN IF NOT EXISTS portal_national_norm text
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

ALTER TABLE public.students DROP COLUMN IF EXISTS portal_national_norm;

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

ALTER TABLE public.omr_results
  ADD COLUMN IF NOT EXISTS portal_student_id_norm text
  GENERATED ALWAYS AS (public.portal_norm_key((data ->> 'studentId'))) STORED;

ALTER TABLE public.omr_results
  ADD COLUMN IF NOT EXISTS portal_detected_id_norm text
  GENERATED ALWAYS AS (public.portal_norm_key((data ->> 'detectedStudentId'))) STORED;

ALTER TABLE public.omr_results
  ADD COLUMN IF NOT EXISTS portal_norm_detected_id_norm text
  GENERATED ALWAYS AS (public.portal_norm_key((data ->> 'normalizedDetectedStudentId'))) STORED;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) فهارس البوابة (تعبيرية + أعمدة مولَّدة)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_omr_portal_nationalid
  ON public.omr_results (public.portal_norm_key((data ->> 'nationalId')))
  WHERE public.portal_norm_key((data ->> 'nationalId')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_national_id_snake
  ON public.omr_results (public.portal_norm_key((data ->> 'national_id')))
  WHERE public.portal_norm_key((data ->> 'national_id')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_studentid
  ON public.omr_results (public.portal_norm_key((data ->> 'studentId')))
  WHERE public.portal_norm_key((data ->> 'studentId')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_detected
  ON public.omr_results (public.portal_norm_key((data ->> 'detectedStudentId')))
  WHERE public.portal_norm_key((data ->> 'detectedStudentId')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_norm_detected
  ON public.omr_results (public.portal_norm_key((data ->> 'normalizedDetectedStudentId')))
  WHERE public.portal_norm_key((data ->> 'normalizedDetectedStudentId')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_portal_nationalid
  ON public.students (public.portal_norm_key((data ->> 'nationalId')))
  WHERE public.portal_norm_key((data ->> 'nationalId')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_portal_national_id_snake
  ON public.students (public.portal_norm_key((data ->> 'national_id')))
  WHERE public.portal_norm_key((data ->> 'national_id')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_portal_data_id
  ON public.students (public.portal_norm_key((data ->> 'id')))
  WHERE public.portal_norm_key((data ->> 'id')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_portal_data_studentid
  ON public.students (public.portal_norm_key((data ->> 'studentId')))
  WHERE public.portal_norm_key((data ->> 'studentId')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_portal_data_student_id_snake
  ON public.students (public.portal_norm_key((data ->> 'student_id')))
  WHERE public.portal_norm_key((data ->> 'student_id')) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_national_norm_col
  ON public.omr_results (portal_national_norm)
  WHERE portal_national_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_portal_national_norm_col
  ON public.students (portal_national_norm)
  WHERE portal_national_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_portal_seat_norm_col
  ON public.students (portal_seat_norm)
  WHERE portal_seat_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_student_id_norm_col
  ON public.omr_results (portal_student_id_norm)
  WHERE portal_student_id_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_detected_id_norm_col
  ON public.omr_results (portal_detected_id_norm)
  WHERE portal_detected_id_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_omr_portal_norm_detected_id_norm_col
  ON public.omr_results (portal_norm_detected_id_norm)
  WHERE portal_norm_detected_id_norm IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) RPC — بوابة الطالب (قراءة نتائج بالهوية بدون جلب الجدول كاملاً)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.portal_fetch_omr_for_national(text);

CREATE OR REPLACE FUNCTION public.portal_fetch_omr_for_national(national_norm text)
RETURNS TABLE (id text, payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  p text;
  n bigint;
BEGIN
  p := public.portal_norm_key(national_norm);
  IF p IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('statement_timeout', '0', true);

  RETURN QUERY
  SELECT
    r.id::text,
    public.portal_payload_strip(r.data) AS payload
  FROM public.omr_results r
  WHERE public.portal_omr_row_visible(COALESCE(r.data, '{}'::jsonb))
    AND r.portal_national_norm = p
  LIMIT 500;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH seat_norms AS (
    SELECT s.portal_seat_norm AS sn
    FROM public.students s
    WHERE s.portal_seat_norm IS NOT NULL
      AND s.portal_national_norm = p
    UNION
    SELECT s.portal_seat_norm AS sn
    FROM public.students s
    WHERE s.portal_seat_norm IS NOT NULL
      AND public.portal_norm_key(COALESCE(s.data ->> 'id', '')) = p
    UNION
    SELECT s.portal_seat_norm AS sn
    FROM public.students s
    WHERE s.portal_seat_norm IS NOT NULL
      AND public.portal_norm_key(COALESCE(s.data ->> 'studentId', '')) = p
    UNION
    SELECT s.portal_seat_norm AS sn
    FROM public.students s
    WHERE s.portal_seat_norm IS NOT NULL
      AND public.portal_norm_key(COALESCE(s.data ->> 'student_id', '')) = p
  ),
  seats AS (
    SELECT DISTINCT sn FROM seat_norms WHERE sn IS NOT NULL
  )
  SELECT x.id, x.payload FROM (
    SELECT
      r.id::text AS id,
      public.portal_payload_strip(r.data) AS payload
    FROM public.omr_results r
    INNER JOIN seats sn ON r.portal_student_id_norm = sn.sn
    WHERE public.portal_omr_row_visible(COALESCE(r.data, '{}'::jsonb))
    UNION
    SELECT
      r.id::text,
      public.portal_payload_strip(r.data)
    FROM public.omr_results r
    INNER JOIN seats sn ON r.portal_detected_id_norm = sn.sn
    WHERE public.portal_omr_row_visible(COALESCE(r.data, '{}'::jsonb))
    UNION
    SELECT
      r.id::text,
      public.portal_payload_strip(r.data)
    FROM public.omr_results r
    INNER JOIN seats sn ON r.portal_norm_detected_id_norm = sn.sn
    WHERE public.portal_omr_row_visible(COALESCE(r.data, '{}'::jsonb))
  ) x
  LIMIT 500;
END;
$fn$;

REVOKE ALL ON FUNCTION public.portal_fetch_omr_for_national(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_fetch_omr_for_national(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) RPC — الرصد (جلب خفيف بدون صور base64)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fetch_omr_results_grading_page(
  p_limit int DEFAULT 80,
  p_offset int DEFAULT 0
)
RETURNS TABLE (id text, payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    r.id::text,
    (COALESCE(r.data, '{}'::jsonb)
      - 'reviewRois'
      - 'systemViewImage'
      - 'systemViewImageThumb'
      - 'sheetImage'
      - 'scanImage'
      - 'originalImage'
    ) AS payload
  FROM public.omr_results r
  ORDER BY r.id
  LIMIT greatest(1, least(COALESCE(p_limit, 80), 200))
  OFFSET greatest(0, COALESCE(p_offset, 0));
$fn$;

REVOKE ALL ON FUNCTION public.fetch_omr_results_grading_page(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_omr_results_grading_page(int, int) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Row Level Security (RLS)
--    التطبيق يستخدم مفتاح anon بدون Supabase Auth — السياسات التالية تسمح
--    للتطبيق المكتبي/الويب بالعمل. للإنتاج العام على الإنترنت يُفضّل تقييد
--    omr_results/students عبر Auth أو Edge Functions.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.committees       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omr_exams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omr_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retake_requests  ENABLE ROW LEVEL SECURITY;

-- إزالة سياسات قديمة بنفس الاسم (إعادة تشغيل آمن)
DO $pol$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'students', 'committees', 'observers', 'locations',
        'omr_exams', 'omr_results', 'settings', 'retake_requests'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END;
$pol$;

-- جداول الكنترول والرصد: وصول كامل لـ anon (متوافق مع Elite Control الحالي)
CREATE POLICY elite_anon_all_students
  ON public.students FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY elite_anon_all_committees
  ON public.committees FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY elite_anon_all_observers
  ON public.observers FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY elite_anon_all_locations
  ON public.locations FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY elite_anon_all_omr_exams
  ON public.omr_exams FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY elite_anon_all_omr_results
  ON public.omr_results FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY elite_anon_all_settings
  ON public.settings FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- طلبات الإعادة: قراءة/إدراج/حذف للبوابة والإدارة
CREATE POLICY elite_anon_all_retake_requests
  ON public.retake_requests FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) بيانات افتراضية للإعدادات (فقط إن لم تكن موجودة)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.settings (id, data)
VALUES
  (
    'app_config',
    jsonb_build_object(
      'platformName', 'نظام كنترول نخبة الشمال',
      'managerName', 'مدير المدرسة',
      'whatsappApiBase', ''
    )
  ),
  ('assignments', '{}'::jsonb),
  (
    'omr_subjects',
    jsonb_build_array(
      jsonb_build_object('id', '1', 'name', 'لغة عربية', 'grades', jsonb_build_array('All')),
      jsonb_build_object('id', '2', 'name', 'رياضيات', 'grades', jsonb_build_array('All')),
      jsonb_build_object('id', '3', 'name', 'علوم', 'grades', jsonb_build_array('All')),
      jsonb_build_object('id', '4', 'name', 'دراسات اجتماعية', 'grades', jsonb_build_array('All')),
      jsonb_build_object('id', '5', 'name', 'تربية إسلامية', 'grades', jsonb_build_array('All')),
      jsonb_build_object('id', '6', 'name', 'لغة إنجليزية', 'grades', jsonb_build_array('All')),
      jsonb_build_object('id', '7', 'name', 'حاسب آلي', 'grades', jsonb_build_array('All')),
      jsonb_build_object('id', '8', 'name', 'تربية وطنية', 'grades', jsonb_build_array('All')),
      jsonb_build_object('id', '9', 'name', 'تربية بدنية', 'grades', jsonb_build_array('All')),
      jsonb_build_object('id', '10', 'name', 'تربية فنية', 'grades', jsonb_build_array('All'))
    )
  )
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) إعادة حساب الأعمدة المولَّدة بعد إنشاء/تعديل التعريفات
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.omr_results SET data = data WHERE true;
UPDATE public.students SET data = data WHERE true;

COMMIT;

-- =============================================================================
-- ملخص الجداول
-- =============================================================================
-- | الجدول           | المفتاح      | الاستخدام في التطبيق                          |
-- |------------------|-------------|-----------------------------------------------|
-- | students         | id (text)   | قائمة الطلاب، الجلوس، الهوية                  |
-- | committees       | id (text)   | لجان الاختبار                                 |
-- | observers        | id (text)   | الملاحظون                                     |
-- | locations        | id (text)   | مواقع اللجان                                  |
-- | omr_exams        | id (text)   | تعريف اختبارات OMR                            |
-- | omr_results      | id (text)   | نتائج المسح (قد تحتوي صوراً داخل data)        |
-- | settings         | id (text)   | app_config, assignments, omr_subjects           |
-- | retake_requests  | id (uuid)   | طلبات إعادة الاختبار من البوابة               |
-- =============================================================================
--
-- استيراد CSV من مشروع قديم: لا تستورد أعمدة portal_* (مولَّدة).
-- استورد id + data فقط — راجع IMPORT_DATA_AR.md
--
-- إسقاط اختياري (مشروع جديد فارغ تماماً — يحذف كل البيانات):
--
--   DROP SCHEMA public CASCADE;
--   CREATE SCHEMA public;
--   GRANT ALL ON SCHEMA public TO postgres;
--   GRANT ALL ON SCHEMA public TO public;
--   -- ثم أعد تشغيل هذا الملف
-- =============================================================================
