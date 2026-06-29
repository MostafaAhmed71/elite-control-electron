"""
رسم دوائر على مواضع الفقاعات المتوقعة لمعرفة أين يقرأ النظام
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'G:\New folder\control\control\omr_engine')
os.chdir(r'G:\New folder\control\control\omr_engine')

import cv2
import numpy as np
from omr_constants import *
import scanner

IMG_PATH = r'G:\New folder\control\control\omr_engine\dataset\هزاع.jpeg'

# True answers for overlay
TRUTH = {
    '1':'B','2':'B','3':'D','4':'B','5':'D',
    '6':'A','7':'A','8':'B','9':'D','10':'C',
    '11':'A','12':'A','13':'B','14':'B','15':'D',
    '16':'B','17':'B','18':'C','19':'C','20':'D',
    '21':'B','22':'A','23':'C','24':'C','25':'D',
    '26':'A','27':'A','28':'B','29':'C','30':'B'
}
ANSWER_IDX = {'A':0,'B':1,'C':2,'D':3}

# ── 1. Load and warp the image (same as scanner does) ──────────────────
raw = np.fromfile(IMG_PATH, dtype=np.uint8)
img = cv2.imdecode(raw, cv2.IMREAD_COLOR)

h0, w0 = img.shape[:2]
if w0 > h0:
    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Try paper contour
paper_cnt = scanner.get_paper_contour(gray)
if paper_cnt is not None:
    pts  = paper_cnt.reshape(4, 2)
    rect = scanner.order_points(pts)
    M    = cv2.getPerspectiveTransform(
        rect,
        np.array([[0,0],[WIDTH,0],[WIDTH,HEIGHT],[0,HEIGHT]], dtype="float32"))
    warped = cv2.warpPerspective(img, M, (WIDTH, HEIGHT))
    print("Paper contour found - perspective warp applied")
else:
    warped = cv2.resize(img, (WIDTH, HEIGHT))
    print("No paper contour - just resized")

warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

# Fine alignment with corner markers
warped, warped_gray = scanner.refine_warp_with_markers(warped, warped_gray)
corners = scanner.find_corner_markers(warped_gray)
print(f"Corner markers found: {corners is not None}")

# ── 2. Get bubble grid ─────────────────────────────────────────────────
R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_nafs()
num_questions = 30
per_col = (num_questions + 1) // 2  # 15

print(f"\nBubble grid:")
print(f"  R_XS (right col, A..D) = {[int(x) for x in R_XS]}")
print(f"  L_XS (left col,  A..D) = {[int(x) for x in L_XS]}")
print(f"  y_start={y_start}, row_spacing={row_sp}, bubble_r={bub_r}")

# ── 3. Draw ALL bubble positions ────────────────────────────────────────
vis = warped.copy()
# Scale down for easier viewing (2481×3507 is huge)
scale = 0.35
vis_small = cv2.resize(vis, (int(WIDTH*scale), int(HEIGHT*scale)))

for q in range(num_questions):
    is_left = q >= per_col
    row_idx = q % per_col
    y_center= int((y_start + row_idx * row_sp) * scale)
    xs      = L_XS if is_left else R_XS

    # Draw all 4 candidate bubbles in light blue
    for xi, x in enumerate(xs):
        cx = int(x * scale)
        r  = int(bub_r * scale)
        cv2.circle(vis_small, (cx, y_center), r, (255, 200, 0), 1)

    # Draw TRUE answer in GREEN
    q_str = str(q+1)
    if q_str in TRUTH and TRUTH[q_str]:
        true_idx = ANSWER_IDX[TRUTH[q_str]]
        tx = int(xs[true_idx] * scale)
        cv2.circle(vis_small, (tx, y_center), int(bub_r*scale)+3, (0, 255, 0), 2)
        cv2.putText(vis_small, f"Q{q+1}", (tx-15, y_center-int(bub_r*scale)-5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.3, (0,200,0), 1)

# Draw corner marker expected positions
ms  = CORNER_MARKER_SIZE
off = MARGIN + ms // 2
for cx, cy in [(off, off), (WIDTH-off, off), (off, HEIGHT-off), (WIDTH-off, HEIGHT-off)]:
    cv2.circle(vis_small, (int(cx*scale), int(cy*scale)), 8, (0,0,255), 2)

OUT = r'G:\New folder\control\control\omr_engine\debug_visual.png'
cv2.imwrite(OUT, vis_small)
print(f"\nSaved visual: {OUT}")
print("Legend:")
print("  CYAN circles  = scanner's expected bubble positions")
print("  GREEN circles = correct answer positions")
print("  RED dots      = expected corner marker centers")
