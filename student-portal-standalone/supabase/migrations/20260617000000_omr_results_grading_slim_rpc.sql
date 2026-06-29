-- تقليل Egress: جلب نتائج الرصد بدون صور base64 (تُحذف على السيرفر قبل الإرسال).
-- نفّذ في SQL Editor أو: supabase db push

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
