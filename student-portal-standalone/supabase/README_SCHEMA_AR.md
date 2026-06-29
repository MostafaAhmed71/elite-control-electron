# مخطط قاعدة البيانات — Elite Control

## الملف الشامل

**`full_schema.sql`** — ملف واحد يحتوي على:

- كل الجداول الثمانية
- الفهارس والأعمدة المولَّدة للبوابة
- دوال `portal_fetch_omr_for_national` و `fetch_omr_results_grading_page`
- سياسات RLS لدور `anon` (متوافقة مع التطبيق الحالي)

## التطبيق على مشروع Supabase جديد

1. أنشئ مشروعاً جديداً من [Dashboard](https://supabase.com/dashboard).
2. **SQL Editor** → الصق محتوى `full_schema.sql` → **Run**.
3. من **Settings → API** انسخ:
   - Project URL → `VITE_SUPABASE_URL`
   - anon public key → `VITE_SUPABASE_ANON_KEY`
4. ضع القيم في `f:\end\control\.env` وأعد تشغيل التطبيق.

## ملفات migrations القديمة

| الملف | الحالة |
|--------|--------|
| `migrations/portal.sql` | مدمج في `full_schema.sql` (+ توسيع الهوية) |
| `migrations/portal_national_norm_expand.sql` | مدمج |
| `migrations/20260617000000_omr_results_grading_slim_rpc.sql` | مدمج |
| `migrations/portal_omr_fast_lookup.sql` | **قديم — لا تستخدمه** |

## استيراد CSV من المشروع القديم

إذا ظهر خطأ `portal_national_norm is a generated column` راجع **`IMPORT_DATA_AR.md`** — استورد **فقط** `id` و `data`.

## نقل البيانات من مشروع قديم

إن كان المشروع القديم يعمل أحياناً:

- **Table Editor** → Export CSV لكل جدول، أو
- استخدم **Database → Backups** (خطة مدفوعة)، أو
- SQL: `COPY` / أدوات pg_dump من Supabase CLI

لا تنسخ `omr_results` بصور base64 ضخمة إن كنت تريد تقليل الحصة.

## أمان RLS

السياسات الحالية تفتح الجداول لـ `anon` بالكامل لأن التطبيق لا يستخدم Supabase Auth. للبوابة العامة على الإنترنت يُنصح لاحقاً بتقييد `omr_results` و `students` والاعتماد على RPC فقط للقراءة.
