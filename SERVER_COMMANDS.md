# أوامر السيرفر والنشر — مرجع سريع

استبدل `USER` و`SERVER_IP` ومسارات الخدمات حسب إعدادك الفعلي على السيرفر.

---

## متغيرات مقترحة (في جلسة الطرفية على Linux)

```bash
export APP_DIR="/opt/control"
export GIT_BRANCH="main"
```

---

## الدخول إلى السيرفر (SSH)

```bash
ssh USER@SERVER_IP
```

بمفتاح:

```bash
ssh -i ~/.ssh/id_ed25519 USER@SERVER_IP
```

---

## الانتقال إلى مجلد المشروع

```bash
cd "$APP_DIR"
pwd
```

---

## جلب التحديثات (Git)

```bash
cd "$APP_DIR"
git fetch origin
git status
git pull origin "$GIT_BRANCH"
```

عند تعارض مع تعديلات محلية:

```bash
git stash push -m "قبل السحب"
git pull origin "$GIT_BRANCH"
git stash pop
```

---

## بناء الواجهة ونشر الملفات الثابتة

على السيرفر:

```bash
cd "$APP_DIR"
npm ci
npm run build
```

نسخ `dist` (مثال — غيّر الوجهة):

```bash
sudo rsync -av --delete dist/ /var/www/control/dist/
```

---

## إعادة تشغيل الخدمات (systemd)

تحقق من أسماء الخدمات عندك:

```bash
systemctl list-units --type=service | grep -Ei 'caddy|omr|whatsapp'
```

Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

أو إعادة تشغيل كاملة:

```bash
sudo systemctl restart caddy
```

أمثلة لتطبيقات (غيّر الاسم حسب الخادم):

```bash
sudo systemctl restart omr-api.service
sudo systemctl restart whatsapp-api.service
```

الحالة والسجلات:

```bash
sudo systemctl status caddy
sudo journalctl -u caddy -f --no-pager
sudo journalctl -u omr-api.service -n 100 --no-pager
```

---

## تغيير كلمة مرور الوصول (Basic Auth مع Caddy و htpasswd)

```bash
sudo apt-get update && sudo apt-get install -y apache2-utils
sudo htpasswd /etc/caddy/.htpasswd اسم_المستخدم
sudo systemctl reload caddy
```

افتح ملف `Caddyfile` وتأكد من مسار ملف `htpasswd` في إعداد `basicauth`.

---

## استثناء صفحة المعلمين من كلمة المرور (Basic Auth)

حماية Caddy تطبَّق على **طلبات HTTP** قبل تحميل الصفحة. مع الرابط القديم `#/teacher-lookup` السيرفر يرى فقط `/` ولا يستطيع تمييز الصفحة — لذلك يطلب كلمة المرور دائماً.

**الحل:** مسار مباشر `/teacher-lookup` + إعداد Caddy يستثني هذا المسار (انظر `deploy/Caddyfile.example`).

### 1) على السيرفر — عدّل `/etc/caddy/Caddyfile`

**الأسهل — سكربت تلقائي:**

```powershell
scp d:\end\control\deploy\patch-caddy-public.sh root@SERVER:/opt/control/deploy/
```

```bash
sudo bash /opt/control/deploy/patch-caddy-public.sh
```

**أو يدوياً** — انظر `deploy/CADDY-EDIT.md`

ضع معالجة الـ API أولاً، ثم المسارات العامة **بدون** `basicauth`، ثم باقي الموقع **مع** `basicauth`:

```caddy
@public {
    path /teacher-lookup /teacher-lookup/*
    path /portal /portal/*
    path /assets/* /vite.svg /favicon.ico
    path /*.jpeg /*.jpg /*.png /*.ico /*.webp /*.svg
}
handle @public {
    try_files {path} /index.html
    file_server
}

handle {
    basicauth { ... }
    try_files {path} /index.html
    file_server
}
```

### 2) أعد البناء وارفع dist

```powershell
npm run build
scp -r .\dist\* root@SERVER:/opt/control/dist/
```

```bash
sudo chown -R caddy:caddy /opt/control/dist
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### 3) رابط المعلمين (بدون كلمة مرور)

```
https://control0.northelite0.com/teacher-lookup
```

### 4) تحقق

```bash
# يجب 200 بدون مصادقcurl -sS -o /dev/null -w "teacher-lookup: %{http_code}\n" https://control0.northelite0.com/teacher-lookup

# يجب 401 بدون مصادقة (لوحة التحكم محمية)
curl -sS -o /dev/null -w "home: %{http_code}\n" https://control0.northelite0.com/
```

| الرابط | كلمة المرور |
|--------|-------------|
| `/teacher-lookup` | **لا** |
| `/portal` | **لا** |
| `/` وباقي الصفحات | **نعم** |

**ملاحظة:** ملفات `/assets/` يجب أن تبقى عامة حتى تُحمَّل صفحة المعلمين. لوحة التحكم نفسها ما زالت محمية عند الدخول المباشر إلى `/`.

### 5) إذا `teacher-lookup` يعطي 401

يعني أن `@public` **غير موجود** في `/etc/caddy/Caddyfile` أو أن `basicauth` يأتي **قبله**.

```bash
sudo cat /etc/caddy/Caddyfile
```

ابحث عن `@public` — إن لم يوجد، أضف **قبل** أي `handle {` فيه `basicauth`:

```caddy
	@public {
		path /teacher-lookup /teacher-lookup/*
		path /portal /portal/*
		path /assets/* /vite.svg /favicon.ico
		path /*.jpeg /*.jpg /*.png /*.ico /*.webp /*.svg
	}
	handle @public {
		try_files {path} /index.html
		file_server
	}
```

**لا تحذف** سطر `basicauth` الحالي — فقط أضف الكتلة أعلاه **فوق** `handle { basicauth ...`.

```bash
sudo nano /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -sS -o /dev/null -w "teacher-lookup: %{http_code}\n" https://control0.northelite0.com/teacher-lookup
```

### 6) صلاحيات dist (بدون سكربت)

إن لم يوجد `fix-dist-perms.sh` على السيرفر:

```bash
sudo chown -R caddy:caddy /opt/control/dist
sudo find /opt/control/dist -type d -exec chmod 755 {} \;
sudo find /opt/control/dist -type f -exec chmod 644 {} \;
```

أو انسخ السكربت من جهازك:

```powershell
scp d:\end\control\deploy\fix-dist-perms.sh root@72.62.178.181:/opt/control/deploy/
```

---

## أوامر تشخيص مفيدة

```bash
df -h
free -h
sudo ss -tlnp | grep -E '443|80|8000|3001'
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/docs
```

---

## من Windows (PowerShell) — رفع `dist` بعد البناء محلياً

```powershell
cd G:\end\control
npm run build
scp -r .\dist\* USER@SERVER_IP:/opt/control/dist/
```

تنفيذ أمر على السيرفر من جهازك:

```powershell
ssh USER@SERVER_IP "cd /opt/control && git pull && sudo systemctl reload caddy"
```

---

## صلاحيات مجلد dist (مهم — يمنع 403 على `/assets/*.js`)

بعد `scp` أو `rsync` كـ root، Caddy لا يقرأ الملفات إن بقيت ملكية root:

```bash
sudo chown -R caddy:caddy /opt/control/dist
sudo find /opt/control/dist -type d -exec chmod 755 {} \;
sudo find /opt/control/dist -type f -exec chmod 644 {} \;
ls -la /opt/control/dist/assets | head
```

تحقق من وجود الملفات (أسماءها تتغيّر بعد كل build — يجب رفع `dist` كاملاً):

```bash
ls -la /opt/control/dist/
ls -la /opt/control/dist/assets/
```

اختبار محلي على السيرفر:

```bash
# بدون كلمة مرور — 401 يعني basicauth شغّال (طبيعي)
curl -sS -o /dev/null -w "%{http_code}\n" https://control0.northelite0.com/
curl -sS -o /dev/null -w "%{http_code}\n" https://control0.northelite0.com/assets/index-CwmkGm2F.css

# مع المصادقة (استبدل USER وPASS)
curl -sS -u 'USER:PASS' -o /dev/null -w "%{http_code}\n" https://control0.northelite0.com/assets/index-CwmkGm2F.css
```

| الكود | المعنى |
|------|--------|
| **403** | صلاحيات ملفات أو Caddy يمنع `/assets` → `chown` + `chmod` |
| **401** | مطلوب تسجيل دخول (basicauth) — ادخل من المتصفح بنفس الحساب |
| **404** | الملف غير موجود — أعد `npm run build` وارفع `dist` كاملاً |
| **200** | سليم |

سكربت جاهز على السيرفر:

```bash
sudo bash /opt/control/deploy/fix-dist-perms.sh
```

إذا `index.html` يعمل و`/assets/` يعطي 403 بعد تسجيل الدخول → راجع `Caddyfile` (يجب أن يكون `basicauth` على مستوى الموقع كامل وليس يستثني `/assets`).

مثال إعداد Caddy: انظر `deploy/Caddyfile.example` (يجب `file_server` و`root` يشيران إلى `/opt/control/dist`).

---

## قائمة تحقق بعد التحديث

1. الدخول إلى مجلد المشروع على السيرفر
2. `git pull`
3. `npm run build` محلياً أو على السيرفر
4. رفع **مجلد dist كاملاً** (يشمل `assets/`)
5. `chown` / `chmod` لمجلد dist (أعلاه)
6. `sudo systemctl reload caddy`
7. فتح الموقع — Ctrl+F5 لمسح الكاش

### رفع dist من Windows

```powershell
cd G:\end\control

npm run build
scp -r .\dist\* root@72.62.178.181:/opt/control/dist/


ثم على السيرفر:

```bash
sudo chown -R caddy:caddy /opt/control/dist
sudo systemctl reload caddy
```

---

## استعلام المعلمين — دومين مستقل (بدون كلمة مرور)

مشروع منفصل: **`teacher-lookup-standalone/`** — التفاصيل في `teacher-lookup-standalone/README.md`

```powershell
cd d:\end\control\teacher-lookup-standalone
copy ..\student-portal-standalone\.env .env
npm install
npm run build
scp -r .\dist\* root@72.62.178.181:/opt/teacher-lookup/dist/
```

```bash
sudo mkdir -p /opt/teacher-lookup/dist
sudo chown -R caddy:caddy /opt/teacher-lookup/dist
```

أضف في `/etc/caddy/Caddyfile` (بدون basicauth):

```caddy
teacher.northelite0.com {
    root * /opt/teacher-lookup/dist
    encode gzip zstd
    try_files {path} /index.html
    file_server
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

---

## استعلام المعلمين — دومين مستقل (بدون كلمة مرور)

مشروع منفصل: **`teacher-lookup-standalone/`** — التفاصيل في `teacher-lookup-standalone/README.md`

```powershell
cd d:\end\control\teacher-lookup-standalone
copy ..\student-portal-standalone\.env .env
npm install
npm run build
scp -r .\dist\* root@72.62.178.181:/opt/teacher-lookup/dist/
```

```bash
sudo mkdir -p /opt/teacher-lookup/dist
sudo chown -R caddy:caddy /opt/teacher-lookup/dist
```

أضف في `/etc/caddy/Caddyfile` (بدون basicauth):

```caddy
teacher.northelite0.com {
    root * /opt/teacher-lookup/dist
    encode gzip zstd
    try_files {path} /index.html
    file_server
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```