# -*- coding: utf-8 -*-
import os
from PIL import ImageFont

# ── مجلد الخطوط المدمجة مع المشروع (الأولوية الأولى) ──────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_BUNDLED_FONTS_DIR = os.path.join(_HERE, "fonts")


def _first_existing(paths):
    for p in paths:
        if p and os.path.exists(p):
            return p
    return None


def load_font_pair():
    """
    Return (regular_ttf_path, bold_ttf_path) for an Arabic-capable font.
    Search order:
      1. Bundled fonts inside omr_engine/fonts/  (works on any OS / VPS)
      2. Linux system fonts (Ubuntu/Debian)
      3. Windows system fonts
    """
    regular_candidates = [
        # ── 1. Bundled (shipped with the project) ──────────────────────────
        os.path.join(_BUNDLED_FONTS_DIR, "Arial.ttf"),
        os.path.join(_BUNDLED_FONTS_DIR, "Amiri-Regular.ttf"),
        os.path.join(_BUNDLED_FONTS_DIR, "NotoNaskhArabic-Regular.ttf"),
        os.path.join(_BUNDLED_FONTS_DIR, "arial.ttf"),
        # ── 2. Linux – msttcorefonts (best with arabic_reshaper) ───────────
        "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/arial.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Tahoma.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/tahoma.ttf",
        # ── 2b. Linux – Amiri (good Arabic coverage) ───────────────────────
        "/usr/share/fonts/truetype/amiri/Amiri-Regular.ttf",
        "/usr/share/fonts/truetype/amiri/AmiriQuran-Regular.ttf",
        # ── 2c. Linux – Noto Arabic ────────────────────────────────────────
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf",
        # ── 2d. Linux – DejaVu fallback ────────────────────────────────────
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        # ── 3. Windows ─────────────────────────────────────────────────────
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\Tahoma.ttf",
    ]

    bold_candidates = [
        # ── 1. Bundled ─────────────────────────────────────────────────────
        os.path.join(_BUNDLED_FONTS_DIR, "Arial_Bold.ttf"),
        os.path.join(_BUNDLED_FONTS_DIR, "Arialbd.ttf"),
        os.path.join(_BUNDLED_FONTS_DIR, "arialbd.ttf"),
        os.path.join(_BUNDLED_FONTS_DIR, "Amiri-Bold.ttf"),
        os.path.join(_BUNDLED_FONTS_DIR, "NotoNaskhArabic-Bold.ttf"),
        # ── 2. Linux – msttcorefonts ───────────────────────────────────────
        "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/arialbd.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Arialbd.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/Tahoma_Bold.ttf",
        "/usr/share/fonts/truetype/msttcorefonts/tahomabd.ttf",
        # ── 2b. Linux – Amiri Bold ─────────────────────────────────────────
        "/usr/share/fonts/truetype/amiri/Amiri-Bold.ttf",
        "/usr/share/fonts/truetype/amiri/AmiriQuran-Bold.ttf",
        # ── 2c. Linux – Noto Bold ──────────────────────────────────────────
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf",
        # ── 2d. Linux – DejaVu Bold fallback ──────────────────────────────
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
        # ── 3. Windows ─────────────────────────────────────────────────────
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\Tahomabd.ttf",
    ]

    regular = _first_existing(regular_candidates)
    bold = _first_existing(bold_candidates) or regular
    return regular, bold


def truetype(size: int, bold: bool = False):
    reg, bld = load_font_pair()
    path = bld if bold else reg
    if not path:
        return None
    try:
        # Prefer RAQM layout engine if Pillow was built with libraqm/harfbuzz.
        # This enables correct Arabic shaping/ligatures on Linux.
        layout_engine = getattr(getattr(ImageFont, "Layout", None), "RAQM", None)
        if layout_engine is not None:
            try:
                return ImageFont.truetype(path, size, layout_engine=layout_engine)
            except Exception:
                pass
        return ImageFont.truetype(path, size)
    except Exception:
        return None


def has_raqm() -> bool:
    """Return True if Pillow has RAQM shaping enabled."""
    try:
        from PIL import features
        return bool(features.check("raqm"))
    except Exception:
        return False