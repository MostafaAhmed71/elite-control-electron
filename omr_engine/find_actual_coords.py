"""
قياس الإحداثيات الفعلية للفقاعات في صورة هزاع
باستخدام حقيقة أننا نعرف أن Q2=B صواب وQ7=A صواب
نحسب X الفعلي من مكان أعلى كثافة حبر
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'G:\New folder\control\control\omr_engine')
os.chdir(r'G:\New folder\control\control\omr_engine')

import cv2, numpy as np
from omr_constants import *
import scanner

IMG_PATH = r'G:\New folder\control\control\omr_engine\dataset\هزاع.jpeg'

# Known correct answers (verified manually)
TRUTH = {
    '1':'B','2':'B','3':'D','4':'B','5':'D',
    '6':'A','7':'A','8':'B','9':'D','10':'C',
    '11':'A','12':'A','13':'B','14':'B','15':'D',
    '16':'B','17':'B','18':'C','19':'C','20':'D',
    '21':'B','22':'A','23':'C','24':'C','25':'D',
    '26':'A','27':'A','28':'B','29':'C','30':'B'
}
ANSWER_IDX = {'A':0,'B':1,'C':2,'D':3}

raw   = np.fromfile(IMG_PATH, dtype=np.uint8)
img   = cv2.imdecode(raw, cv2.IMREAD_COLOR)
h0,w0 = img.shape[:2]
if w0 > h0:
    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

paper = scanner.get_paper_contour(gray)
if paper is not None:
    pts  = paper.reshape(4,2)
    rect = scanner.order_points(pts)
    M    = cv2.getPerspectiveTransform(rect,
           np.array([[0,0],[WIDTH,0],[WIDTH,HEIGHT],[0,HEIGHT]],dtype="float32"))
    warped = cv2.warpPerspective(img, M, (WIDTH,HEIGHT))
else:
    warped = cv2.resize(img, (WIDTH,HEIGHT))
warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
warped, warped_gray = scanner.refine_warp_with_markers(warped, warped_gray)
clahe     = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(16,16))
proc_gray = clahe.apply(warped_gray)

R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_nafs()
per_col = 15

# For each question where we know the truth,
# scan horizontally around that row to find where ink is highest
print("Finding actual bubble X positions by horizontal scan...")
print(f"\nExpected R_XS (A,B,C,D) = {[int(x) for x in R_XS]}")
print(f"Expected L_XS (A,B,C,D) = {[int(x) for x in L_XS]}")
print()

actual_positions = {'R': [], 'L': []}

for q_str, true_ans in TRUTH.items():
    q = int(q_str) - 1
    is_left = q >= per_col
    row_idx = q % per_col
    y_center = y_start + row_idx * row_sp
    xs = L_XS if is_left else R_XS
    side = 'L' if is_left else 'R'

    true_idx = ANSWER_IDX[true_ans]
    expected_x = xs[true_idx]

    # Scan horizontally ±200px around expected position to find darkest spot
    search_w = 250
    best_x = expected_x
    best_density = 0.0
    for dx in range(-search_w, search_w+1, 5):
        x_try = expected_x + dx
        if x_try < 50 or x_try > WIDTH - 50:
            continue
        d = scanner.bubble_ink_ratio(proc_gray, x_try, y_center, bub_r)
        if d > best_density:
            best_density = d
            best_x = x_try

    offset = best_x - expected_x
    actual_positions[side].append((true_idx, best_x, expected_x, offset, q_str, true_ans))
    print(f"Q{q_str:>2} {true_ans} (idx={true_idx}): expected_x={expected_x:4d} actual_x={best_x:4d} offset={offset:+4d} density={best_density:.3f}")

# Compute average offset per index
print("\n--- Average X offset by answer index (0=A,1=B,2=C,3=D) ---")
for side in ['R','L']:
    offsets_by_idx = {0:[],1:[],2:[],3:[]}
    for (idx, actual_x, exp_x, offset, qs, ans) in actual_positions[side]:
        offsets_by_idx[idx].append(offset)
    print(f"\n{side} column:")
    for idx, offs in offsets_by_idx.items():
        if offs:
            avg = sum(offs)/len(offs)
            print(f"  idx={idx} ({['A','B','C','D'][idx]}): avg_offset={avg:+.1f}  n={len(offs)}")
