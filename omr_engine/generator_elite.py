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
    draw_footer_with_manual_name,
    draw_student_info_rows,
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

S_SCHOOL    = u"\u0645\u062a\u0648\u0633\u0637\u0629 \u0648\u062b\u0627\u0646\u0648\u064a\u0629 \u0646\u062e\u0628\u0629 \u0627\u0644\u0634\u0645\u0627\u0644 \u0627\u0644\u0623\u0647\u0644\u064a\u0629" # متوسطة وثانوية نخبة الشمال الأهلية
S_PRINCIPAL = "مدير المدرسة : محمد نصر الدين"
S_FOOTER    = u"\u0646\u0638\u0627\u0645 \u0627\u0644\u062a\u0635\u062d\u064a\u062d \u0627\u0644\u0622\u0644\u064a \u0628\u0645\u062a\u0648\u0633\u0637\u0629 \u0648\u062b\u0627\u0646\u0648\u064a\u0629 \u0646\u062e\u0628\u0629 \u0627\u0644\u0634\u0645\u0627\u0644 \u0627\u0644\u0623\u0647\u0644\u064a\u0629"

def draw_corner_markers(draw):
    ms = CORNER_MARKER_SIZE
    draw.rectangle([MARGIN, MARGIN, MARGIN + ms, MARGIN + ms], fill=BLACK)
    draw.rectangle([WIDTH - MARGIN - ms, MARGIN, WIDTH - MARGIN, MARGIN + ms], fill=BLACK)
    draw.rectangle([MARGIN, HEIGHT - MARGIN - ms, MARGIN + ms, HEIGHT - MARGIN], fill=BLACK)
    draw.rectangle([WIDTH - MARGIN - ms, HEIGHT - MARGIN - ms, WIDTH - MARGIN, HEIGHT - MARGIN], fill=BLACK)

def draw_elite_header(img, draw, student_info):
    HDR_TOP   = MARGIN
    HDR_H     = 290
    HDR_LEFT  = MARGIN
    HDR_RIGHT = WIDTH - MARGIN
    HDR_BOT   = HDR_TOP + HDR_H
    PAD       = 18
    LOGO_GAP  = 150  # gap from header edge — moved further inward

    draw.rectangle([HDR_LEFT, HDR_TOP, HDR_RIGHT, HDR_BOT], outline=BLACK, width=5)

    # Centered Title
    title = ar(S_SCHOOL)
    tw = _tl(draw, title, font=FONT_MD_B)
    _dt(draw, ((WIDTH - tw) // 2, HDR_TOP + (HDR_H - 80) // 2), title, fill=BLACK, font=FONT_MD_B)

    logo_h = HDR_H - 2 * PAD
    cx = WIDTH // 2

    # Correct paths for logos (drive-independent)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    LOGO_MIN = os.path.join(os.path.dirname(BASE_DIR), "public", "شعار الوزارة.png")
    LOGO_SCH = os.path.join(os.path.dirname(BASE_DIR), "public", "شعار المدرسة.jpeg")

    logo_h = HDR_H - 75
    
    # RIGHT Logo (School)
    try:
        rlogo = Image.open(LOGO_SCH).convert("RGBA")
        rlogo = rlogo.resize((int(rlogo.width * logo_h / rlogo.height), logo_h))
        lx = int(cx + tw // 2 + LOGO_GAP)
        ly = int(HDR_TOP + (HDR_H - rlogo.height) // 2)
        img.paste(rlogo, (lx, ly), rlogo)
    except: pass

    # LEFT Logo (Ministry)
    try:
        llogo = Image.open(LOGO_MIN).convert("RGBA")
        llogo = llogo.resize((int(llogo.width * logo_h / llogo.height), logo_h))
        lx = int(cx - tw // 2 - LOGO_GAP - llogo.width)
        ly = int(HDR_TOP + (HDR_H - llogo.height) // 2)
        img.paste(llogo, (lx, ly), llogo)
    except: pass

    draw_student_info_rows(
        draw, student_info, fmt_date_parts, ar, _tl, _dt, FONT_MD, FONT_SM
    )

def draw_questions_elite(draw, start_y, num_questions=30, subject=""):
    col_w = (WIDTH - 2 * MARGIN) // 2
    GAP   = 80
    r_col_x = MARGIN + col_w + GAP // 2
    l_col_x = MARGIN
    
    options = option_labels_for_subject(subject)
    bubble_r = 30

    for col_x in [r_col_x, l_col_x]:
        for oi, t in enumerate(options):
            ox = col_x + (col_w - 120) - oi * 120
            at = t if t in "ABCD" else ar(t)
            tw = _tl(draw, at, font=FONT_SM)
            _dt(draw, (int(ox - tw // 2), start_y - 110), at, fill=BLACK, font=FONT_SM)

    row_spacing = fit_question_row_spacing(num_questions, start_y, 120, min_spacing=80, header_offset=120)
    per_col = (num_questions + 1) // 2
    for q in range(num_questions):
        if q < per_col:
            col_x, r, q_num = r_col_x, q, q+1
        else:
            col_x, r, q_num = l_col_x, q-per_col, q+1
        
        y = start_y + r * row_spacing
        num_str = ar("%d." % q_num)
        nw = _tl(draw, num_str, font=FONT_MD)
        _dt(draw, (col_x + col_w - int(nw), y - 30), num_str, fill=BLACK, font=FONT_MD)

        bubble_start_x = col_x + col_w - 120
        for oi in range(4):
            ox = bubble_start_x - oi * 120
            draw.ellipse(
                [ox - bubble_r, y - bubble_r, ox + bubble_r, y + bubble_r],
                outline=BLACK,
                width=4,
            )

def generate_personalized_sheet(student_info, filename=None):
    img = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
    draw = ImageDraw.Draw(img)
    draw_corner_markers(draw)
    draw_elite_header(img, draw, student_info)
    
    # QR Code
    num_q = student_info.get("num_questions", 30)
    import json
    qr_payload = json.dumps(
        {"id": str(student_info.get("id", "0")), "nq": int(num_q), "tpl": "elite"},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    qr = qrcode.QRCode(box_size=12, border=1)
    qr.add_data(qr_payload)
    qr_img = qr.make_image().convert("RGB").resize((300, 300))
    img.paste(qr_img, (WIDTH - MARGIN - 320, HDR_TOP + 12))

    draw_questions_elite(
        draw, QS_START_Y, num_questions=num_q, subject=student_info.get("subject", "")
    )

    draw_footer_with_manual_name(
        draw, S_PRINCIPAL, S_FOOTER, ar, _tl, _dt, FONT_MD
    )
    
    if filename:
        img.save(filename)
    return img

def create_bulk_pdf(students_list, output_pdf="elite_batch.pdf"):
    pdf = FPDF(unit="pt", format=(WIDTH, HEIGHT))
    temp_dir = "temp_elite"
    if not os.path.exists(temp_dir): os.makedirs(temp_dir)
    for idx, student in enumerate(students_list):
        img = generate_personalized_sheet(student)
        p = os.path.join(temp_dir, f"e_{idx}.png")
        img.save(p)
        pdf.add_page()
        pdf.image(p, 0, 0, WIDTH, HEIGHT)
    pdf.output(output_pdf)
    return output_pdf

if __name__ == "__main__":
    test = {"id":"444", "name":u"\u0646\u062e\u0628\u0629 \u062a\u062c\u0631\u064a\u0628\u064a", "class":u"\u0627\u0644\u0623\u0648\u0644 \u0627\u0644\u062b\u0627\u0646\u0648\u064a", "subject":u"\u0631\u064a\u0627\u0636\u064a\u0627\u062a", "date":"2024-05"}
    generate_personalized_sheet(test, "elite_template.png")
