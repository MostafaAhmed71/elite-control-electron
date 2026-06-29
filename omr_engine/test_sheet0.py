import cv2
import numpy as np
from PIL import Image, ImageDraw
from omr_constants import *
from scanner import scan_omr

# Load sheet_0
img = Image.open('temp_sheets/sheet_0.png').convert('RGB')
draw = ImageDraw.Draw(img)

# Shade Q1=A, Q2=B, Q3=C, Q4=D, Q5=A
answers_to_shade = {1: 0, 2: 1, 3: 2, 4: 3, 5: 0}  # 0=A,1=B,2=C,3=D
col_w = (WIDTH - 2 * MARGIN) // 2
r = 32

for q_num, opt_idx in answers_to_shade.items():
    row_idx = (q_num - 1) % 10
    col_idx = (q_num - 1) // 10
    xb = MARGIN + 200 + col_idx * (col_w + 100)
    y = int(QS_ROW0_CENTER_Y + row_idx * QS_ROW_SPACING)
    ox = int(xb + opt_idx * QS_OPT_SPACING)
    draw.ellipse([ox - r, y - r, ox + r, y + r], fill='black')

shaded_path = 'temp_sheets/sheet_0_shaded.png'
img.save(shaded_path)
print('Saved:', shaded_path)

# Scan
result = scan_omr(shaded_path)
print()
print('student_id:', result['student_id'])
print()
expected = {1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'A'}
print('Q#  Expected  Got     Status')
print('-' * 35)
all_ok = True
for i in range(1, 6):
    got = result['answers'].get(str(i), '?')
    exp = expected[i]
    ok = got == exp
    if not ok:
        all_ok = False
    print(f'Q{i}  {exp}         {got}      {"OK" if ok else "FAIL"}')

print()
print('RESULT:', 'ALL CORRECT!' if all_ok else 'SOME ERRORS - check debug_scans/')
