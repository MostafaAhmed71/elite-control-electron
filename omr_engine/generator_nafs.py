# -*- coding: utf-8 -*-
from PIL import Image, ImageDraw, ImageFont
import qrcode
import os
from fpdf import FPDF
import arabic_reshaper
from bidi.algorithm import get_display
from omr_constants import *
from font_utils import truetype, has_raqm
from sheet_helpers import (
    option_labels_for_subject,
    draw_student_info_rows,
    draw_footer_with_manual_name,
    fit_question_row_spacing,
)

def ar(text):
    if not text: return ""
    # If Pillow has RAQM enabled, it will shape Arabic correctly at render time.
    # In that case, avoid reshaping/bidi which can produce "Presentation Forms" issues.
    if has_raqm():
        return str(text)
    return get_display(arabic_reshaper.reshape(str(text)), base_dir="R")


# When RAQM is available, we must render text with explicit RTL direction
_RAQM = has_raqm()
_TXT_KW = {"direction": "rtl", "language": "ar"} if _RAQM else {}


def _tl(draw, text, font):
    return draw.textlength(text, font=font, **_TXT_KW)


def _dt(draw, xy, text, font, fill=BLACK):
    return draw.text(xy, text, fill=fill, font=font, **_TXT_KW)

def fmt_date_parts(date_str):
    """Returns (day, month, year) in Arabic numerals."""
    if not date_str: return ("", "", "")
    try:
        t = str(date_str).translate(str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789'))
        import re
        nums = re.findall(r'\d+', t)
        if len(nums) == 3:
            y, m, d = nums[0], nums[1], nums[2]
            if len(y) != 4: y, m, d = d, m, y # Handle cases where input is already D-M-Y
            
            # Convert to Arabic numerals
            to_ar = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')
            return (str(int(d)).translate(to_ar), 
                    str(int(m)).translate(to_ar), 
                    str(y).translate(to_ar))
    except: pass
    return (str(date_str), "", "")

try:
    FONT_XS   = truetype(25)
    FONT_SM   = truetype(35)
    FONT_MD_S = truetype(48)
    FONT_MD   = truetype(55)
    FONT_MD_B = truetype(60, bold=True)
    FONT_LG   = truetype(65)
    FONT_LABEL= truetype(42)
except:
    FONT_XS = FONT_SM = FONT_MD_S = FONT_MD = FONT_MD_B = FONT_LG = FONT_LABEL = None

# Arabic string constants (defined once, reused everywhere)
S_SCHOOL    = "مدارس نخبة الشمال الأهلية والعالمية" # متوسطة وثانوية نخبة الشمال الأهلية
S_EXAM      = "الاختبار المحاكي لاختبار نافس 2026 (اختبار مجمع)"
S_YEAR      = "العام الدراسي ١٤٤٧ هــ"
S_NAME_LBL  = "\u0627\u0633\u0645 \u0627\u0644\u0637\u0627\u0644\u0628:"
S_CLASS_LBL = "\u0627\u0644\u0635\u0641:"
S_SUBJ_LBL  = "\u0627\u0644\u0645\u0627\u062f\u0629:"
S_SEAT_LBL  = "\u0631\u0642\u0645 \u0627\u0644\u062c\u0644\u0648\u0633:"
S_COMM_LBL  = "\u0631\u0642\u0645 \u0627\u0644\u0644\u062c\u0646\u0629:"
S_DATE_LBL  = "التاريخ واليوم:"
S_PRINCIPAL = "مدير المدرسة : عيد بن قيران العنزي"
S_FOOTER    = "مدارس نخبة الشمال الأهلية والعالمية"
OPT_LABELS  = ["\u0623", "\u0628", "\u062c", "\u062f"]   # أ ب ج د

LOGO_SCH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "شعار المدرسة.jpeg")

# PDF sizing: constants are in pixels at ~300 DPI. FPDF "pt" units are 1/72 inch.
# Convert px → pt so the resulting PDF page is true A4 (≈595x842 pt).
_DPI = 300
PDF_W_PT = int(round(WIDTH * 72 / _DPI))
PDF_H_PT = int(round(HEIGHT * 72 / _DPI))

def draw_corner_markers(draw):
    ms = CORNER_MARKER_SIZE
    draw.rectangle([MARGIN, MARGIN, MARGIN + ms, MARGIN + ms], fill=BLACK)
    draw.rectangle([WIDTH - MARGIN - ms, MARGIN, WIDTH - MARGIN, MARGIN + ms], fill=BLACK)
    draw.rectangle([MARGIN, HEIGHT - MARGIN - ms, MARGIN + ms, HEIGHT - MARGIN], fill=BLACK)
    draw.rectangle([WIDTH - MARGIN - ms, HEIGHT - MARGIN - ms, WIDTH - MARGIN, HEIGHT - MARGIN], fill=BLACK)


def draw_header(img, draw, student_info):
    # ── School Header Box ──────────────────────────────────────────────────────
    HDR_TOP   = MARGIN
    HDR_H     = 290
    HDR_LEFT  = MARGIN
    HDR_RIGHT = WIDTH - MARGIN
    HDR_BOT   = HDR_TOP + HDR_H
    PAD       = 18
    LOGO_GAP  = 150     # gap from header edge — moved further inward

    draw.rectangle([HDR_LEFT, HDR_TOP, HDR_RIGHT, HDR_BOT], outline=BLACK, width=3)

    # ── Text lines (centered on page) ─────────────────────────────────────────
    lines = [ar(S_SCHOOL), ar(S_EXAM), ar(S_YEAR)]
    max_tw = 0
    txt_start_y = HDR_TOP + 35
    cx = WIDTH // 2
    for idx, t in enumerate(lines):
        font = FONT_MD_B if idx == 0 else FONT_MD_S
        tw = _tl(draw, t, font=font)
        _dt(draw, (int(cx - tw // 2), txt_start_y + idx * 75), t, fill=BLACK, font=font)
        max_tw = max(max_tw, tw)

    # ── Header Logos ──────────────────────────────────────────────────────────
    logo_h = HDR_H - 70
    
    # ── RIGHT Logo (School)
    try:
        rlogo = Image.open(LOGO_SCH).convert("RGBA")
        rlogo = rlogo.resize((int(rlogo.width * logo_h / rlogo.height), logo_h))
        lx = HDR_RIGHT - LOGO_GAP - rlogo.width
        ly = HDR_TOP + (HDR_H - rlogo.height) // 2
        img.paste(rlogo, (lx, ly), rlogo)
    except: pass

    # ── LEFT Logo (School - same as right)
    try:
        llogo = Image.open(LOGO_SCH).convert("RGBA")
        llogo = llogo.resize((int(llogo.width * logo_h / llogo.height), logo_h))
        lx = HDR_LEFT + LOGO_GAP
        ly = HDR_TOP + (HDR_H - llogo.height) // 2
        img.paste(llogo, (lx, ly), llogo)
    except: pass

    draw_student_info_rows(
        draw, student_info, fmt_date_parts, ar, _tl, _dt, FONT_LG, FONT_SM
    )


def build_qr_payload(student_info, num_questions=30, template="nafs"):
    payload = {
        "id": str(student_info.get("id", "0")),
        "nq": int(num_questions),
        "tpl": str(template),
    }
    import json
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def draw_qr_code(img, qr_payload):
    qr = qrcode.QRCode(box_size=15, border=1)
    qr.add_data(qr_payload)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    qr_img = qr_img.resize((QR_SIZE, QR_SIZE))
    img.paste(qr_img, (QR_X, QR_Y))


def draw_questions_section(draw, start_y, num_questions=30, subject=""):
    """RTL layout: first half on the RIGHT column, second half on the LEFT column.
    Within each column, question number is rightmost; bubbles أبجد go left.
    num_questions controls how many rows are drawn (e.g. 20 or 30)."""
    half      = (WIDTH - 2 * MARGIN) // 2
    GAP       = 60        # gap between columns
    col_w     = half - GAP // 2

    # RIGHT column (Q1-10): starts at right edge of page content area
    r_col_x   = MARGIN + half + GAP // 2   # left boundary of right column
    # LEFT column (Q11-20): starts at MARGIN
    l_col_x   = MARGIN

    opt_labels = option_labels_for_subject(subject)
    opt_labels_ar = [o if o in "ABCD" else ar(o) for o in opt_labels]
    header_y      = start_y - 100
    NUM_AREA      = 120    # pixels reserved for question number
    BUB_SPAN      = 4 * QS_OPT_SPACING   # total bubble row width

    for col_x in [r_col_x, l_col_x]:
        # Header labels: أ aligns above rightmost bubble, د above leftmost
        num_right = col_x + col_w - 10
        bub_right = num_right - NUM_AREA   # center of أ bubble
        for oi, t in enumerate(opt_labels_ar):
            ox = bub_right - oi * QS_OPT_SPACING
            tw = int(_tl(draw, t, font=FONT_SM))
            _dt(draw, (int(ox) - tw // 2, header_y), t, fill=BLACK, font=FONT_SM)

    row_spacing = fit_question_row_spacing(num_questions, start_y, QS_ROW_SPACING)
    per_col = (num_questions + 1) // 2   # questions per column (ceiling division)
    for q in range(num_questions):
        if q < per_col:
            col_x = r_col_x
            row   = q
            q_num = q + 1
        else:
            col_x = l_col_x
            row   = q - per_col
            q_num = q + 1

        y         = start_y + row * row_spacing
        num_right = col_x + col_w - 10
        bub_right = num_right - NUM_AREA

        # Question number
        nt  = ar("%d." % q_num)
        ntw = _tl(draw, nt, font=FONT_SM)
        _dt(draw, (int(num_right - ntw), y - 18), nt, fill=BLACK, font=FONT_SM)

        # Bubbles: أ at bub_right, each subsequent 1 step left
        for oi in range(4):
            ox = bub_right - oi * QS_OPT_SPACING
            r  = QS_BUBBLE_R
            draw.ellipse([int(ox - r), int(y - r), int(ox + r), int(y + r)],
                         outline=BLACK, width=4)


def generate_personalized_sheet(student_info, filename=None):
    img  = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)
    draw_corner_markers(draw)
    draw_header(img, draw, student_info)
    num_q = student_info.get("num_questions", 30)
    qr_payload = build_qr_payload(student_info, num_questions=num_q, template="nafs")
    draw_qr_code(img, qr_payload)
    draw_questions_section(
        draw,
        QS_START_Y,
        num_questions=student_info.get("num_questions", 30),
        subject=student_info.get("subject", ""),
    )

    draw_footer_with_manual_name(
        draw, S_PRINCIPAL, S_FOOTER, ar, _tl, _dt, FONT_MD
    )

    if filename:
        img.save(filename)
    return img


def create_bulk_pdf(students_list, output_pdf="omr_batch.pdf"):
    """PDF generation using temp files (fpdf 1.x compatibility)."""
    import tempfile
    pdf = FPDF(unit="pt", format=(PDF_W_PT, PDF_H_PT))
    total = len(students_list)
    tmp_files = []
    try:
        for idx, student in enumerate(students_list):
            img = generate_personalized_sheet(student)
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            tmp.close()
            img.save(tmp.name, format="JPEG", quality=95)
            tmp_files.append(tmp.name)
            pdf.add_page()
            pdf.image(tmp.name, 0, 0, PDF_W_PT, PDF_H_PT)
        pdf.output(output_pdf)
    finally:
        for f in tmp_files:
            try:
                os.remove(f)
            except Exception:
                pass
    return output_pdf


def create_bulk_pdf_stream(students_list, output_pdf="omr_batch.pdf"):
    """Generator: yields progress dicts then finished. Uses temp files for fpdf 1.x."""
    import tempfile
    pdf = FPDF(unit="pt", format=(PDF_W_PT, PDF_H_PT))
    total = len(students_list)
    tmp_files = []
    try:
        for idx, student in enumerate(students_list):
            img = generate_personalized_sheet(student)
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            tmp.close()
            img.save(tmp.name, format="JPEG", quality=95)
            tmp_files.append(tmp.name)
            pdf.add_page()
            pdf.image(tmp.name, 0, 0, PDF_W_PT, PDF_H_PT)
            yield {"done": idx + 1, "total": total, "name": student.get("name", "")}
        pdf.output(output_pdf)
    finally:
        for f in tmp_files:
            try:
                os.remove(f)
            except Exception:
                pass
    yield {"finished": True, "path": output_pdf}


if __name__ == "__main__":
    test = {
        "id": "102",
        "name": "\u0639\u0644\u064a \u0645\u0643\u064a",
        "class": "\u0627\u0644\u0623\u0648\u0644 \u0627\u0644\u062b\u0627\u0646\u0648\u064a",
        "subject": "\u0644\u063a\u0629 \u0639\u0631\u0628\u064a\u0629",
        "seat_number": "201",
        "committee_number": "3",
        "date": "2024-04-02",
    }
    generate_personalized_sheet(test, filename="simple_template.png")
    print("Saved: simple_template.png")