"""
Debug: اطبع قيم كثافة الحبر لكل فقاعة لكل سؤال
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
    '1':'B','2':'B','3':'D','4':'B','5':'D',
    '6':'A','7':'A','8':'B','9':'D','10':'C',
    '11':'A','12':'A','13':'B','14':'B','15':'D',
    '16':'B','17':'B','18':'C','19':'C','20':'D',
    '21':'B','22':'A','23':'C','24':'C','25':'D',
    '26':'A','27':'A','28':'B','29':'C','30':'B'
}
ANSWER_IDX = {'A':0,'B':1,'C':2,'D':3,'':None}

# Load + warp (same path as scanner)
raw   = np.fromfile(IMG_PATH, dtype=np.uint8)
img   = cv2.imdecode(raw, cv2.IMREAD_COLOR)
h0,w0 = img.shape[:2]
if w0 > h0:
    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
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

# Preprocess
clahe     = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(16,16))
proc_gray = clahe.apply(warped_gray)

R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_nafs()
num_questions = 30
per_col = (num_questions+1)//2  # 15

print(f"{'Q':>4} {'True':>5} {'A(alef)':>9} {'B(ba)':>9} {'C(jeem)':>9} {'D(dal)':>9} {'Detected':>10} {'CORRECT':>8}")
print("-"*75)

correct_count = 0
for q in range(num_questions):
    is_left  = q >= per_col
    row_idx  = q % per_col
    y_center = y_start + row_idx * row_sp
    xs       = L_XS if is_left else R_XS

    dens  = scanner.row_densities(proc_gray, xs, y_center, bub_r, y_tol)
    darks = scanner.row_darknesses(warped_gray, xs, y_center, bub_r, y_tol)

    t = scanner.derive_sheet_thresholds([{'max_d': max(dens), 'max_dark': max(darks)}])

    best_idx = int(np.argmax(dens))
    detected_letter = scanner.RTL_MAP[best_idx] if dens[best_idx] > t['fill_threshold'] else '?'

    truth_ans  = TRUTH[str(q+1)]
    truth_idx  = ANSWER_IDX.get(truth_ans)

    correct = (detected_letter == truth_ans)
    if correct:
        correct_count += 1
    mark = "OK" if correct else f"ERR->({detected_letter})"

    d_str = '  '.join(f"{d:.3f}" for d in dens)
    print(f"Q{q+1:>2}  {truth_ans:>5}  {dens[0]:>9.3f}  {dens[1]:>9.3f}  {dens[2]:>9.3f}  {dens[3]:>9.3f}  {detected_letter:>10}  {mark}")

print("-"*75)
print(f"Total correct: {correct_count}/30 = {correct_count/30*100:.1f}%")
print()

# Show threshold values
all_row_data = []
for q in range(num_questions):
    is_left  = q >= per_col
    row_idx  = q % per_col
    y_center = y_start + row_idx * row_sp
    xs = L_XS if is_left else R_XS
    dens  = scanner.row_densities(proc_gray, xs, y_center, bub_r, y_tol)
    darks = scanner.row_darknesses(warped_gray, xs, y_center, bub_r, y_tol)
    if dens:
        bi = int(np.argmax(dens))
        all_row_data.append({'max_d': float(dens[bi]), 'max_dark': float(darks[bi])})

thresholds = scanner.derive_sheet_thresholds(all_row_data)
print("Adaptive thresholds for this sheet:")
for k,v in thresholds.items():
    print(f"  {k:25s} = {v:.4f}")
