import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'G:\New folder\control\control\omr_engine')
os.chdir(r'G:\New folder\control\control\omr_engine')

from omr_constants import *

half     = (WIDTH - 2 * MARGIN) // 2
GAP      = 60
col_w    = half - GAP // 2
NUM_AREA = 120

r_col_x = MARGIN + half + GAP // 2
l_col_x = MARGIN

r_bub_right = (r_col_x + col_w - 10) - NUM_AREA
l_bub_right = (l_col_x + col_w - 10) - NUM_AREA

R_XS_scan = [r_bub_right - j * QS_OPT_SPACING for j in range(4)]
L_XS_scan = [l_bub_right - j * QS_OPT_SPACING for j in range(4)]

r_num_right   = r_col_x + col_w - 10
r_bub_right_g = r_num_right - NUM_AREA
l_num_right   = l_col_x + col_w - 10
l_bub_right_g = l_num_right - NUM_AREA

R_XS_gen = [r_bub_right_g - oi * QS_OPT_SPACING for oi in range(4)]
L_XS_gen = [l_bub_right_g - oi * QS_OPT_SPACING for oi in range(4)]

print("="*60)
print("COORDINATE COMPARISON: Scanner vs Generator")
print("="*60)
print(f"WIDTH={WIDTH}, HEIGHT={HEIGHT}, MARGIN={MARGIN}")
print(f"QS_OPT_SPACING={QS_OPT_SPACING}, QS_BUBBLE_R={QS_BUBBLE_R}")
print(f"QS_START_Y={QS_START_Y}, QS_ROW_SPACING={QS_ROW_SPACING}")
print()

labels = ["A (alef)", "B (ba)", "C (jeem)", "D (dal)"]
print(f"{'Option':12} {'Scanner_X':>12} {'Generator_X':>12} {'Diff':>8} {'Match':>8}")
print("-"*55)

print("\n--- RIGHT column (Q1-15) ---")
for i,(s,g) in enumerate(zip(R_XS_scan, R_XS_gen)):
    diff  = s - g
    match = "OK" if diff == 0 else f"ERR {diff:+}"
    print(f"{labels[i]:12} {s:>12} {g:>12} {diff:>8} {match:>8}")

print(f"\n--- LEFT column (Q16-30) ---")
for i,(s,g) in enumerate(zip(L_XS_scan, L_XS_gen)):
    diff  = s - g
    match = "OK" if diff == 0 else f"ERR {diff:+}"
    print(f"{labels[i]:12} {s:>12} {g:>12} {diff:>8} {match:>8}")

print(f"\n--- Y coordinates ---")
print(f"QS_START_Y = {QS_START_Y}")
for row in range(5):
    yc = QS_START_Y + row * QS_ROW_SPACING
    print(f"  Row {row+1}: y_center = {yc}")
print(f"  Row 15:  y_center = {QS_START_Y + 14 * QS_ROW_SPACING}")
print(f"  Exceeds HEIGHT? {QS_START_Y + 14 * QS_ROW_SPACING > HEIGHT}")

# Also check: what actual answer does C map to?
print(f"\n--- RTL_MAP in scanner ---")
print("RTL_MAP = ['A','B','C','D']")
print("index 0 = A (rightmost bubble = alef)")
print("index 1 = B")
print("index 2 = C")
print("index 3 = D (leftmost bubble = dal)")
print()
print(f"R_XS (scanner) = {R_XS_scan}")
print(f"index 0 (A) X  = {R_XS_scan[0]}  <- should be rightmost (alef)")
print(f"index 3 (D) X  = {R_XS_scan[3]}  <- should be leftmost (dal)")
print(f"Rightmost > Leftmost? {R_XS_scan[0] > R_XS_scan[3]} (should be True for RTL)")
