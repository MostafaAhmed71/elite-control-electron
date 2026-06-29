# -*- coding: utf-8 -*-
"""Shared OMR sheet layout helpers (header rows, options, footer)."""
from omr_constants import (
    WIDTH,
    HEIGHT,
    MARGIN,
    BLACK,
    HEADER_START_Y,
    HEADER_ROW_H,
    HEADER_X,
    HEADER_WIDTH,
    FOOTER_LIFT,
)


def is_english_subject(subject):
    s = (subject or "").strip().lower()
    keys = (
        "انجليز", "إنجليز", "english", "انجليزية",
        "الانجليزية", "الإنجليزية", "لغة انجليزية", "لغة إنجليزية",
    )
    return any(k in s for k in keys)


def option_labels_for_subject(subject):
    if is_english_subject(subject):
        return ["A", "B", "C", "D"]
    return ["\u0623", "\u0628", "\u062c", "\u062f"]


def _draw_cell(draw, label, val, cell_left, cell_right, y, row_h, P, ar_fn, text_len_fn, draw_text_fn, font, use_ar_val):
    """RTL inside cell: value then label, anchored from the right edge."""
    lbl = ar_fn(label)
    vv = ar_fn(val) if use_ar_val else (val or "")
    lbl_w = text_len_fn(draw, lbl, font=font)
    val_w = text_len_fn(draw, vv, font=font) if vv else 0
    ty = y + (row_h - 65) // 2
    gap = 16
    x_lbl = cell_right - P - lbl_w
    x_val = x_lbl - gap - val_w
    min_x = cell_left + P
    if x_val < min_x:
        x_val = min_x
    draw_text_fn(draw, (x_lbl, ty), lbl, fill=BLACK, font=font)
    if vv:
        draw_text_fn(draw, (x_val, ty), vv, fill=BLACK, font=font)


def draw_student_info_rows(draw, student_info, fmt_date_parts, ar_fn, text_len_fn, draw_text_fn, font_lg, font_sm):
    """
    Three rows (raised, away from corner markers):
      1) اسم الطالب — صف كامل
      2) اليوم | التاريخ — نفس خط الاسم
      3) المادة | الصف — نفس خط الاسم
    """
    start_y = HEADER_START_Y
    row_h = HEADER_ROW_H
    w = HEADER_WIDTH
    x = HEADER_X
    P = 40
    mid_x = x + w // 2
    font = font_lg

    day_num, month, year = fmt_date_parts(student_info.get("date", ""))
    date_val = f"{day_num} - {month} - {year}" if year else day_num
    day_val = student_info.get("day", "") or ""

    # Row 1: اسم الطالب (full width)
    y0 = start_y
    draw.rectangle([x, y0, x + w, y0 + row_h], outline=BLACK, width=3)
    _draw_cell(
        draw, "\u0627\u0633\u0645 \u0627\u0644\u0637\u0627\u0644\u0628:", student_info.get("name", ""),
        x, x + w, y0, row_h, P, ar_fn, text_len_fn, draw_text_fn, font, True,
    )

    # Row 2 (يمين → يسار): اليوم | التاريخ
    y1 = start_y + row_h
    draw.rectangle([x, y1, x + w, y1 + row_h], outline=BLACK, width=3)
    draw.line([(mid_x, y1), (mid_x, y1 + row_h)], fill=BLACK, width=3)
    _draw_cell(
        draw, "\u0627\u0644\u064a\u0648\u0645:", day_val,
        mid_x, x + w, y1, row_h, P, ar_fn, text_len_fn, draw_text_fn, font, True,
    )
    _draw_cell(
        draw, "\u0627\u0644\u062a\u0627\u0631\u064a\u062e:", date_val,
        x, mid_x, y1, row_h, P, ar_fn, text_len_fn, draw_text_fn, font, False,
    )

    # Row 3 (يمين → يسار): المادة | الصف
    y2 = start_y + 2 * row_h
    draw.rectangle([x, y2, x + w, y2 + row_h], outline=BLACK, width=3)
    draw.line([(mid_x, y2), (mid_x, y2 + row_h)], fill=BLACK, width=3)
    _draw_cell(
        draw, "\u0627\u0644\u0645\u0627\u062f\u0629:", student_info.get("subject", ""),
        mid_x, x + w, y2, row_h, P, ar_fn, text_len_fn, draw_text_fn, font, True,
    )
    _draw_cell(
        draw, "\u0627\u0644\u0635\u0641:", student_info.get("class", ""),
        x, mid_x, y2, row_h, P, ar_fn, text_len_fn, draw_text_fn, font, True,
    )

    # Row 4 (يمين → يسار): رقم اللجنة | رقم الجلوس
    y3 = start_y + 3 * row_h
    draw.rectangle([x, y3, x + w, y3 + row_h], outline=BLACK, width=3)
    draw.line([(mid_x, y3), (mid_x, y3 + row_h)], fill=BLACK, width=3)
    _draw_cell(
        draw, "\u0631\u0642\u0645 \u0627\u0644\u0644\u062c\u0646\u0629:", student_info.get("committee_number", ""),
        mid_x, x + w, y3, row_h, P, ar_fn, text_len_fn, draw_text_fn, font, False,
    )
    _draw_cell(
        draw, "\u0631\u0642\u0645 \u0627\u0644\u062c\u0644\u0648\u0633:", student_info.get("seat_number", ""),
        x, mid_x, y3, row_h, P, ar_fn, text_len_fn, draw_text_fn, font, False,
    )


FOOTER_SIGNATURE_BOX_H = 100
FOOTER_SIGNATURE_GAP = 22
FOOTER_PRINCIPAL_LINE_H = 52
FOOTER_SYSTEM_LINE_OFFSET = 38
FOOTER_QUESTIONS_CLEARANCE = 40


def footer_signature_box_top():
    """Top edge (Y) of the manual student-signature box."""
    fy_bot = HEIGHT - MARGIN - FOOTER_SYSTEM_LINE_OFFSET
    principal_y = fy_bot - FOOTER_SIGNATURE_GAP - FOOTER_PRINCIPAL_LINE_H - FOOTER_LIFT
    return principal_y - FOOTER_SIGNATURE_GAP - FOOTER_SIGNATURE_BOX_H


def questions_area_max_y(clearance=FOOTER_QUESTIONS_CLEARANCE):
    """Lowest Y for question bubbles — keeps room for signature footer."""
    return footer_signature_box_top() - clearance


def fit_question_row_spacing(
    num_questions,
    start_y,
    default_spacing,
    min_spacing=78,
    header_offset=150,
):
    """Shrink row spacing when needed so questions do not cover the signature box."""
    per_col = max(1, (num_questions + 1) // 2)
    max_y = questions_area_max_y()
    available = max_y - start_y - header_offset
    if per_col <= 1 or available <= 0:
        return default_spacing
    needed = available / (per_col - 1)
    if needed >= default_spacing:
        return default_spacing
    return max(min_spacing, int(needed))


def draw_footer_with_manual_name(draw, principal_text, footer_text, ar_fn, text_len_fn, draw_text_fn, font_md):
    """Footer (bottom→top): system line, principal, manual student-signature box on top."""
    manual_h = FOOTER_SIGNATURE_BOX_H
    gap = FOOTER_SIGNATURE_GAP
    fy_bot = HEIGHT - MARGIN - FOOTER_SYSTEM_LINE_OFFSET
    principal_y = fy_bot - gap - FOOTER_PRINCIPAL_LINE_H - FOOTER_LIFT
    manual_top = footer_signature_box_top()
    box_left = MARGIN
    box_right = WIDTH - MARGIN

    draw.rectangle(
        [box_left, manual_top, box_right, manual_top + manual_h],
        outline=BLACK,
        width=3,
    )

    lbl = ar_fn("\u062a\u0648\u0642\u064a\u0639 \u0627\u0633\u0645 \u0627\u0644\u0637\u0627\u0644\u0628:")
    lw = text_len_fn(draw, lbl, font=font_md)
    lbl_x = box_right - lw - 24
    lbl_y = manual_top + 16
    draw_text_fn(draw, (lbl_x, lbl_y), lbl, fill=BLACK, font=font_md)

    line_y = manual_top + manual_h - 26
    line_left = box_left + 36
    line_right = lbl_x - 24
    if line_right > line_left + 120:
        draw.line([(line_left, line_y), (line_right, line_y)], fill=BLACK, width=2)

    pt = ar_fn(principal_text)
    draw_text_fn(draw, (MARGIN + 40, principal_y), pt, fill=BLACK, font=font_md)

    st = ar_fn(footer_text)
    stw = text_len_fn(draw, st, font=font_md)
    draw_text_fn(draw, ((WIDTH - stw) // 2, fy_bot), st, fill=BLACK, font=font_md)
