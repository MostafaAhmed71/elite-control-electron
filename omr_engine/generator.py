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
    if has_raqm():
        return str(text)
    return get_display(arabic_reshaper.reshape(str(text)), base_dir="R")


_RAQM = has_raqm()
_TXT_KW = {"direction": "rtl", "language": "ar"} if _RAQM else {}


def _tl(draw, text, font):
    return draw.textlength(text, font=font, **_TXT_KW)


def _dt(draw, xy, text, font, fill=BLACK):
    return draw.text(xy, text, fill=fill, font=font, **_TXT_KW)

def fmt_date_parts(date_str):
    if not date_str: return ("", "", "")
    try:
        t = str(date_str).translate(str.maketrans('٠١٢٣٤٥٦٧٨٩', '0123456789'))
        import re
        nums = re.findall(r'\d+', t)
        if len(nums) == 3:
            y, m, d = nums[0], nums[1], nums[2]
            if len(y) != 4: y, m, d = d, m, y
            to_ar = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')
            return (str(int(d)).translate(to_ar), str(int(m)).translate(to_ar), str(y).translate(to_ar))
    except: pass
    return (str(date_str), "", "")

try:
    FONT_XS   = truetype(25)
    FONT_SM   = truetype(35)
    FONT_MD   = truetype(55)
    FONT_MD_B = truetype(60, bold=True)
except:
    FONT_XS = FONT_SM = FONT_MD = FONT_MD_B = None

# Arabic string constants (defined once, reused everywhere)
S_SCHOOL    = "\u0645\u062a\u0648\u0633\u0637\u0629 \u0648\u062b\u0627\u0646\u0648\u064a\u0629 \u0646\u062e\u0628\u0629 \u0627\u0644\u0634\u0645\u0627\u0644 \u0627\u0644\u0623\u0647\u0644\u064a\u0629"
S_EXAM      = "\u0627\u062e\u062a\u0628\u0627\u0631 \u0646\u0647\u0627\u064a\u0629 \u0627\u0644\u062f\u0648\u0631 \u0627\u0644\u0623\u0648\u0644 - \u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062f\u0631\u0627\u0633\u064a \u0627\u0644\u062b\u0627\u0646\u064a"
S_YEAR      = "\u0627\u0644\u0639\u0627\u0645 \u0627\u0644\u062f\u0631\u0627\u0633\u064a 1447 \u0647\u0640"
S_NAME_LBL  = "\u0627\u0633\u0645 \u0627\u0644\u0637\u0627\u0644\u0628:"
S_CLASS_LBL = "\u0627\u0644\u0635\u0641:"
S_SUBJ_LBL  = "\u0627\u0644\u0645\u0627\u062f\u0629:"
S_SEAT_LBL  = "\u0631\u0642\u0645 \u0627\u0644\u062c\u0644\u0648\u0633:"
S_COMM_LBL  = "\u0631\u0642\u0645 \u0627\u0644\u0644\u062c\u0646\u0629:"
S_DATE_LBL  = "التاريخ واليوم:"
S_PRINCIPAL = "مدير المدرسة : محمد نصر الدين"
S_FOOTER    = "\u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u0635\u062d\u064a\u062d \u0627\u0644\u0622\u0644\u064a \u0628\u0645\u062a\u0648\u0633\u0637\u0629 \u0648\u062b\u0627\u0646\u0648\u064a\u0629 \u0646\u062e\u0628\u0629 \u0627\u0644\u0634\u0645\u0627\u0644 \u0627\u0644\u0623\u0647\u0644\u064a\u0629"
OPT_LABELS  = ["\u0623", "\u0628", "\u062c", "\u062f"]   # أ ب ج د

# Correct paths for logos (drive-independent)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_MIN = os.path.join(os.path.dirname(BASE_DIR), "public", "شعار الوزارة.png")
LOGO_SCH = os.path.join(os.path.dirname(BASE_DIR), "public", "شعار المدرسة.jpeg")

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
    LOGO_GAP  = 30      # gap between logo and text group

    draw.rectangle([HDR_LEFT, HDR_TOP, HDR_RIGHT, HDR_BOT], outline=BLACK, width=3)

    # ── Text lines (centered on page) ─────────────────────────────────────────
    title_data = [
        (ar(S_SCHOOL), FONT_MD_B),
        (ar(S_EXAM),   FONT_SM),
        (ar(S_YEAR),   FONT_SM),
    ]
    max_tw      = int(max(_tl(draw, t, font=f) for t, f in title_data))
    total_h     = len(title_data) * 78
    txt_start_y = HDR_TOP + (HDR_H - total_h) // 2
    cx          = WIDTH // 2

    for idx, (t, font) in enumerate(title_data):
        tw = _tl(draw, t, font=font)
        _dt(draw, (int(cx - tw // 2), txt_start_y + idx * 78), t, fill=BLACK, font=font)

    # ── Header Logos (Identical Sizing) ───────────────────────────────────────
    logo_h = HDR_H - 75
    
    # RIGHT Logo (School)
    try:
        rlogo = Image.open(LOGO_SCH).convert("RGBA")
        rlogo = rlogo.resize((int(rlogo.width * logo_h / rlogo.height), logo_h))
        lx = cx + max_tw // 2 + LOGO_GAP
        ly = HDR_TOP + (HDR_H - rlogo.height) // 2
        img.paste(rlogo, (lx, ly), rlogo)
    except: pass

    # LEFT Logo (Ministry)
    try:
        llogo = Image.open(LOGO_MIN).convert("RGBA")
        llogo = llogo.resize((int(llogo.width * logo_h / llogo.height), logo_h))
        lx = cx - max_tw // 2 - LOGO_GAP - llogo.width
        ly = HDR_TOP + (HDR_H - llogo.height) // 2
        img.paste(llogo, (lx, ly), llogo)
    except: pass

    draw_student_info_rows(
        draw, student_info, fmt_date_parts, ar, _tl, _dt, FONT_MD, FONT_SM
    )


def build_qr_payload(student_info, num_questions=30, template="default"):
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
    Within each column, question number is rightmost; bubbles أبجد go left."""
    half      = (WIDTH - 2 * MARGIN) // 2
    GAP       = 60        # gap between columns
    col_w     = half - GAP // 2

    # RIGHT column: starts at right edge of page content area
    r_col_x   = MARGIN + half + GAP // 2
    # LEFT column: starts at MARGIN
    l_col_x   = MARGIN

    opt_labels = option_labels_for_subject(subject)
    opt_labels_ar = [o if o in "ABCD" else ar(o) for o in opt_labels]
    header_y      = start_y - 100
    NUM_AREA      = 120    # pixels reserved for question number

    for col_x in [r_col_x, l_col_x]:
        num_right = col_x + col_w - 10
        bub_right = num_right - NUM_AREA
        for oi, t in enumerate(opt_labels_ar):
            ox = bub_right - oi * QS_OPT_SPACING
            tw = int(_tl(draw, t, font=FONT_SM))
            _dt(draw, (int(ox) - tw // 2, header_y), t, fill=BLACK, font=FONT_SM)

    row_spacing = fit_question_row_spacing(num_questions, start_y, QS_ROW_SPACING)
    per_col = (num_questions + 1) // 2
    for q in range(num_questions):
        if q < per_col:
            col_x = r_col_x
            row   = q
        else:
            col_x = l_col_x
            row   = q - per_col

        y         = start_y + row * row_spacing
        num_right = col_x + col_w - 10
        bub_right = num_right - NUM_AREA

        nt  = ar("%d." % (q + 1))
        ntw = _tl(draw, nt, font=FONT_SM)
        _dt(draw, (int(num_right - ntw), y - 18), nt, fill=BLACK, font=FONT_SM)

        for oi in range(4):
            ox = bub_right - oi * QS_OPT_SPACING
            r  = QS_BUBBLE_R
            draw.ellipse([int(ox - r), int(y - r), int(ox + r), int(y + r)],
                         outline=BLACK, width=4)


def generate_personalized_sheet(student_info, num_questions=30, filename=None):
    img  = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)
    draw_corner_markers(draw)
    draw_header(img, draw, student_info)
    qr_payload = build_qr_payload(student_info, num_questions=num_questions, template="default")
    draw_qr_code(img, qr_payload)
    draw_questions_section(
        draw, QS_START_Y, num_questions=num_questions, subject=student_info.get("subject", "")
    )

    draw_footer_with_manual_name(
        draw, S_PRINCIPAL, S_FOOTER, ar, _tl, _dt, FONT_MD
    )

    if filename:
        img.save(filename)
    return img


def create_bulk_pdf(students_list, output_pdf="omr_batch.pdf"):
    pdf = FPDF(unit="pt", format=(PDF_W_PT, PDF_H_PT))
    temp_dir = "temp_sheets"
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)
    
    for idx, student in enumerate(students_list):
        num_q = student.get("num_questions", 30)
        img = generate_personalized_sheet(student, num_questions=num_q)
        img_path = os.path.join(temp_dir, f"sheet_{idx}.png")
        img.save(img_path)
        pdf.add_page()
        pdf.image(img_path, 0, 0, PDF_W_PT, PDF_H_PT)
        
    pdf.output(output_pdf)
    return output_pdf


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
