#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_fonts.py
-----------------
تحميل خطوط عربية مجانية مباشرة إلى مجلد omr_engine/fonts/
يعمل على أي نظام (Windows / Linux VPS) بدون صلاحيات admin

شغّله مرة واحدة:
    python download_fonts.py
"""
import os
import urllib.request
import sys

FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
os.makedirs(FONTS_DIR, exist_ok=True)

# قائمة الخطوط للتحميل (خطوط مجانية مفتوحة المصدر)
FONTS = [
    {
        "name": "Amiri-Regular.ttf",
        "url": "https://github.com/alif-type/amiri/releases/download/1.000/Amiri-1.000.zip",
        "zip_inner": "Amiri-Regular.ttf",
        "is_zip": True,
    },
    {
        "name": "Amiri-Bold.ttf",
        "url": "https://github.com/alif-type/amiri/releases/download/1.000/Amiri-1.000.zip",
        "zip_inner": "Amiri-Bold.ttf",
        "is_zip": True,
    },
]

# خطوط Noto - تحميل مباشر (ttf فردية)
NOTO_FONTS = [
    {
        "name": "NotoNaskhArabic-Regular.ttf",
        "url": "https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Regular.ttf",
        "is_zip": False,
    },
    {
        "name": "NotoNaskhArabic-Bold.ttf",
        "url": "https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoNaskhArabic/NotoNaskhArabic-Bold.ttf",
        "is_zip": False,
    },
]


def download_file(url, dest_path):
    print(f"  ⬇️  Downloading {os.path.basename(dest_path)}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    with open(dest_path, "wb") as f:
        f.write(data)
    print(f"  ✅ Saved: {dest_path}")
    return data


def download_from_zip(url, zip_inner_name, dest_path):
    import io
    import zipfile
    print(f"  ⬇️  Downloading ZIP for {zip_inner_name}...")
    headers = {"User-Agent": "Mozilla/5.0"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        # البحث عن الملف في داخل الـ zip
        matched = [n for n in z.namelist() if n.endswith(zip_inner_name)]
        if not matched:
            print(f"  ⚠️  {zip_inner_name} not found in ZIP. Contents: {z.namelist()[:10]}")
            return False
        with z.open(matched[0]) as font_file:
            font_data = font_file.read()
    with open(dest_path, "wb") as f:
        f.write(font_data)
    print(f"  ✅ Saved: {dest_path}")
    return True


def main():
    print(f"\n🔤 Arabic Font Downloader")
    print(f"📁 Target directory: {FONTS_DIR}\n")

    success = 0
    fail = 0

    # حاول تحميل Noto أولاً (أسهل - تحميل مباشر)
    for font in NOTO_FONTS:
        dest = os.path.join(FONTS_DIR, font["name"])
        if os.path.exists(dest):
            print(f"  ✓  Already exists: {font['name']}")
            success += 1
            continue
        try:
            download_file(font["url"], dest)
            success += 1
        except Exception as e:
            print(f"  ❌ Failed: {font['name']} — {e}")
            fail += 1

    # ثم حاول Amiri (من ZIP)
    amiri_zip_cache = None
    amiri_zip_url = FONTS[0]["url"]

    for font in FONTS:
        dest = os.path.join(FONTS_DIR, font["name"])
        if os.path.exists(dest):
            print(f"  ✓  Already exists: {font['name']}")
            success += 1
            continue
        try:
            ok = download_from_zip(font["url"], font["zip_inner"], dest)
            if ok:
                success += 1
            else:
                fail += 1
        except Exception as e:
            print(f"  ❌ Failed: {font['name']} — {e}")
            fail += 1

    print(f"\n{'='*50}")
    print(f"✅ Success: {success}  ❌ Failed: {fail}")

    if success > 0:
        print(f"\n🎉 Fonts are ready in: {FONTS_DIR}")
        print("🔄 Restart the OMR engine to use the new fonts.")
    else:
        print("\n⚠️  No fonts downloaded. On Linux VPS, try:")
        print("    sudo bash setup_arabic_fonts.sh")


if __name__ == "__main__":
    main()
