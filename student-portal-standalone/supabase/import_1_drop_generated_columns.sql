-- =============================================================================
-- الخطوة 1 من 3 — قبل استيراد CSV من المشروع القديم
-- =============================================================================
-- نفّذ هذا الملف أولاً في SQL Editor، ثم استورد البيانات من Table Editor،
-- ثم نفّذ import_3_restore_generated_columns.sql
--
-- يحذف الأعمدة المولَّدة portal_* مؤقتاً حتى يقبل Postgres أي CSV قديم.
-- =============================================================================

BEGIN;

ALTER TABLE public.students DROP COLUMN IF EXISTS portal_national_norm;
ALTER TABLE public.students DROP COLUMN IF EXISTS portal_seat_norm;

ALTER TABLE public.omr_results DROP COLUMN IF EXISTS portal_national_norm;
ALTER TABLE public.omr_results DROP COLUMN IF EXISTS portal_student_id_norm;
ALTER TABLE public.omr_results DROP COLUMN IF EXISTS portal_detected_id_norm;
ALTER TABLE public.omr_results DROP COLUMN IF EXISTS portal_norm_detected_id_norm;

COMMIT;

-- بعد هذا: Table Editor → Import → students / omr_results
-- (يمكنك استيراد CSV كاملاً حتى لو فيه أعمدة portal_* — ستُتجاهل إن لم تُطابق أعمدة الجدول)
-- الأفضل: استورد فقط id + data + created_at إن وُجدت
