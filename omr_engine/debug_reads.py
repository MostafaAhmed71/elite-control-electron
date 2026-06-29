"""
رسم ما يقرأه النظام فعلاً على الصورة المحاذاة مقارنةً بالإجابة الصحيحة
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'G:\New folder\control\control\omr_engine')
os.chdir(r'G:\New folder\control\control\omr_engine')
import cv2, numpy as np
from omr_constants import *
import scanner

IMG_PATH = r'G:\New folder\control\control\omr_engine\dataset\هزاع.jpeg'
TRUTH = {
    '1':'B','2':'B','3':'D','4':'B','5':'D','6':'A','7':'A','8':'B','9':'D','10':'C',
    '11':'A','12':'A','13':'B','14':'B','15':'D','16':'B','17':'B','18':'C','19':'C',
    '20':'D','21':'B','22':'A','23':'C','24':'C','25':'D','26':'A','27':'A','28':'B',
    '29':'C','30':'B'
}
ANSWER_IDX = {'A':0,'B':1,'C':2,'D':3}

# Load and warp (scanner mode)
raw = np.fromfile(IMG_PATH, dtype=np.uint8)
img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
if img.shape[1] > img.shape[0]:
    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

warped = cv2.resize(img, (WIDTH, HEIGHT))
warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
warped, warped_gray = scanner.refine_warp_with_markers(warped, warped_gray)
clahe2 = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8,8))
proc_gray = clahe2.apply(warped_gray)

R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_nafs()
per_col = 15

# Scale for display
scale = 0.38
vis = cv2.resize(warped, (int(WIDTH*scale), int(HEIGHT*scale)))

for q in range(30):
    is_left  = q >= per_col
    row_idx  = q % per_col
    y_center = y_start + row_idx * row_sp
    xs = L_XS if is_left else R_XS
    dens = scanner.row_densities(proc_gray, xs, y_center, bub_r, y_tol)
    read_idx = int(np.argmax(dens))
    read_letter = scanner.RTL_MAP[read_idx]
    truth_letter = TRUTH[str(q+1)]
    truth_idx = ANSWER_IDX[truth_letter]
    correct = (read_letter == truth_letter)

    yc = int(y_center * scale)
    r  = int(bub_r * scale)

    # Draw all 4 bubbles lightly
    for xi, x in enumerate(xs):
        cx = int(x * scale)
        cv2.circle(vis, (cx, yc), r, (200, 200, 200), 1)

    # Draw TRUTH bubble (green = correct read, orange = missed)
    tx = int(xs[truth_idx] * scale)
    color_truth = (0, 220, 0) if correct else (0, 165, 255)
    cv2.circle(vis, (tx, yc), r+4, color_truth, 2)

    # Draw SCANNER READ bubble in red if wrong
    if not correct:
        rx = int(xs[read_idx] * scale)
        cv2.circle(vis, (rx, yc), r+1, (0, 0, 255), 2)
        cv2.putText(vis, f"Q{q+1}", (rx-15, yc-r-5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0,0,200), 1)

OUT = r'G:\New folder\control\control\omr_engine\debug_reads.png'
cv2.imwrite(OUT, vis)
print(f"Saved: {OUT}")
print("Legend: GREEN=correct, ORANGE=truth position missed, RED=wrong scanner read")
