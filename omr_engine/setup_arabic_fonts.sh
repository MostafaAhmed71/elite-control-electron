#!/bin/bash
# ─────────────────────────────────────────────────────────────────
# setup_arabic_fonts.sh
# تثبيت الخطوط العربية على VPS Ubuntu/Debian
# شغّله مرة واحدة فقط على السيرفر
# ─────────────────────────────────────────────────────────────────

set -e

echo "🔤 Installing Arabic fonts on Linux server..."

# ── خطوط Amiri (عربية أصيلة، جودة ممتازة) ────────────────────
apt-get install -y fonts-amiri 2>/dev/null || true

# ── خطوط Noto Arabic ──────────────────────────────────────────
apt-get install -y fonts-noto-core fonts-noto 2>/dev/null || true

# ── خطوط Microsoft Core (Arial, Tahoma) ───────────────────────
# تحتاج موافقة على EULA — نقبل تلقائياً
echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" | debconf-set-selections
apt-get install -y ttf-mscorefonts-installer 2>/dev/null || true

# ── تحديث قاعدة بيانات الخطوط ────────────────────────────────
fc-cache -fv

echo ""
echo "✅ Done! Installed fonts:"
echo "   - fonts-amiri  → /usr/share/fonts/truetype/amiri/"
echo "   - fonts-noto   → /usr/share/fonts/truetype/noto/"
echo "   - msttcorefonts → /usr/share/fonts/truetype/msttcorefonts/"
echo ""
echo "🔄 Please restart the OMR engine (uvicorn) for changes to take effect."
