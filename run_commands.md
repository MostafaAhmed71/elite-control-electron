# أوامر تشغيل المشروع

## 1. تشغيل محرك الأوراق (OMR Engine)

```powershell
cd "D:\end\control\omr_engine"
.\venv312\Scripts\python.exe main.py
```

إذا لم يكن مجلد `venv312` موجوداً، أنشئه (استخدم **`py`** وليس `python` — على Windows قد يشير `python` إلى Microsoft Store):

```powershell
cd "D:\end\control\omr_engine"
py -3.12 -m venv venv312
.\venv312\Scripts\python.exe -m pip install -r requirements.txt
.\venv312\Scripts\python.exe main.py
```

### إعادة إنشاء البيئة الافتراضية

1. أغلق أي طرفية تشغّل `main.py` أو Electron.
2. احذف المجلد القديم (إن فشل `Remove-Item`، أغلق Cursor/antivirus ثم جرّب `cmd /c "rmdir /s /q venv"` و `rmdir /s /q venv312`).
3. نفّذ أوامر الإنشاء أعلاه.

*(يشغّل FastAPI على المنفذ 8000)*

> **Electron** يتوقع مسار `omr_engine\venv`. إن أردت الاسم `venv` بدل `venv312`: بعد حذف `venv` التالف، `Rename-Item venv312 venv` ثم استخدم `.\venv\Scripts\python.exe`.

---

## 2. تشغيل واجهة المشروع (البرنامج الرئيسي)

```powershell
cd "D:\end\control"
npm run dev
```

*(أو `npm run dev:electron` لتشغيل Electron بعد Vite)*

---

## 3. تقليل استهلاك Supabase (Egress)

إذا ظهرت رسالة **Egress Exceeded** أو خطأ **402**:

1. في [Supabase Dashboard](https://supabase.com/dashboard) → مشروعك → **SQL Editor**، نفّذ الملف:
   `student-portal-standalone/supabase/migrations/20260617000000_omr_results_grading_slim_rpc.sql`
2. هذا يفعّل جلب نتائج الرصد **بدون صور** من السيرفر (أقل استهلاكاً بكثير).
3. **أيقونة الرصد** تخزّن النتائج محلياً 20 دقيقة — لا تعِد فتح الصفحة كثيراً دون حاجة.
4. صفحات مثل **كشف المعتمدين** ما زالت تجلب الصور؛ استخدمها عند الحاجة فقط.
5. بعد **17 يونيو 2026** قد تُقيَّد الطلبات إن لم تُرقَّ الخطة.
