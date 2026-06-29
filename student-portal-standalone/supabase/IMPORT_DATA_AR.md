# استيراد البيانات من مشروع Supabase قديم

## سبب الأخطاء

```
cannot insert ... into column "portal_national_norm" / "portal_seat_norm"
Column ... is a generated column.
```

التصدير من المشروع القديم يضمّن أعمدة **`portal_*`** — وهي **مولَّدة** ولا تقبل إدراجاً يدوياً.

---

## الحل المضمون (3 خطوات في SQL Editor)

### الخطوة 1 — قبل الاستيراد

شغّل الملف:

**`import_1_drop_generated_columns.sql`**

(يحذف مؤقتاً كل أعمدة `portal_*` من `students` و `omr_results`.)

### الخطوة 2 — الاستيراد

1. **Table Editor** → جدول `students` (ثم `omr_results`، إلخ).
2. **Insert** → **Import data from CSV**.
3. اختر ملف التصدير.

**جداول بدون أعمدة مولَّدة** (`committees`, `observers`, `settings`, …): استورد مباشرة.

**للطلاب والنتائج:** بعد الخطوة 1 لن يظهر خطأ `portal_seat_norm`.

> إن أمكن، اختر في المعالج **فقط** الأعمدة: `id`, `data` (و`created_at` اختياري).

### الخطوة 3 — بعد الاستيراد

شغّل الملف:

**`import_3_restore_generated_columns.sql`**

(يعيد الأعمدة المولَّدة والفهارس لبوابة الطالب.)

---

## ترتيب الجداول المقترح

1. `settings` (إن وُجدت)
2. `students`
3. `committees`, `observers`, `locations`
4. `omr_exams`
5. `omr_results` (الأكبر — قد يستغرق وقتاً)
6. `retake_requests`

بين **students/omr_results** والجداول الأخرى: نفّذ الخطوة 1 قبلهما والخطوة 3 بعد اكتمالهما.

---

## بديل: استيراد من التطبيق فقط

1. `npm run dev`
2. **قائمة الطلاب** → Excel / JSON

لا يحتاج حذف الأعمدة المولَّدة.

---

## استيراد SQL يدوي (جدول مؤقت)

**لا تستخدم** `LIKE students INCLUDING ALL` — ينسخ تعريف الأعمدة المولَّدة.

```sql
CREATE TABLE public.students_import (
  id   text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- استورد CSV إلى students_import ثم:
INSERT INTO public.students (id, data)
SELECT id, data FROM public.students_import
ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
DROP TABLE public.students_import;
```

---

## قائمة الأعمدة التي تسبب الخطأ (احذفها من CSV إن لم تنفّذ الخطوة 1)

| جدول | أعمدة مولَّدة |
|------|----------------|
| `students` | `portal_national_norm`, `portal_seat_norm` |
| `omr_results` | `portal_national_norm`, `portal_student_id_norm`, `portal_detected_id_norm`, `portal_norm_detected_id_norm` |
