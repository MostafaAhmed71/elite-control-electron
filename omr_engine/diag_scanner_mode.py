"""
Debug كامل مع from_scanner=True
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'G:\New folder\control\control\omr_engine')
os.chdir(r'G:\New folder\control\control\omr_engine')
import cv2, numpy as np
from omr_constants import *
import scanner

IMG_PATH = r'G:\New folder\control\control\omr_engine\dataset\هزاع.jpeg'

raw = np.fromfile(IMG_PATH, dtype=np.uint8)
img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
h0,w0 = img.shape[:2]
print(f"Original size: {w0}x{h0}  (Target: {WIDTH}x{HEIGHT})")
print(f"Scale X: {WIDTH/w0:.3f}  Scale Y: {HEIGHT/h0:.3f}")

if w0 > h0:
    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

# from_scanner path: direct resize
warped = cv2.resize(img, (WIDTH, HEIGHT))
warped_gray = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (WIDTH, HEIGHT))

print(f"\n--- from_scanner=True path: resize then corner markers ---")
corners = scanner.find_corner_markers(warped_gray)
print(f"Corner markers found after resize: {corners is not None}")

if corners:
    tl, tr, bl, br = corners
    ms  = CORNER_MARKER_SIZE
    off = MARGIN + ms // 2  # 190
    expected = {"TL":(off,off),"TR":(WIDTH-off,off),"BL":(off,HEIGHT-off),"BR":(WIDTH-off,HEIGHT-off)}
    actual   = {"TL":tl,"TR":tr,"BL":bl,"BR":br}
    print(f"\nCorner offsets after resize (before refine):")
    for name in ["TL","TR","BL","BR"]:
        ex,ey = expected[name]
        ax,ay = actual[name]
        print(f"  {name}: expected=({ex},{ey}) actual=({ax},{ay}) offset=({ax-ex:+d},{ay-ey:+d})")

# After refine
warped2, warped_gray2 = scanner.refine_warp_with_markers(warped, warped_gray)
corners2 = scanner.find_corner_markers(warped_gray2)
print(f"\nCorner markers after refinement: {corners2 is not None}")
if corners2:
    tl2,tr2,bl2,br2 = corners2
    print(f"  TL:{tl2}  TR:{tr2}  BL:{bl2}  BR:{br2}")

# Now run density check with from_scanner=True
clahe2 = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8,8))
proc_gray = clahe2.apply(warped_gray2)

R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_nafs()
per_col = 15

TRUTH = {
    '1':'B','2':'B','3':'D','4':'B','5':'D',
    '6':'A','7':'A','8':'B','9':'D','10':'C',
    '11':'A','12':'A','13':'B','14':'B','15':'D',
    '16':'B','17':'B','18':'C','19':'C','20':'D',
    '21':'B','22':'A','23':'C','24':'C','25':'D',
    '26':'A','27':'A','28':'B','29':'C','30':'B'
}
ANSWER_IDX = {'A':0,'B':1,'C':2,'D':3}

print(f"\n{'Q':>4} {'True':>5} {'A':>8} {'B':>8} {'C':>8} {'D':>8} {'Read':>7} OK?")
print("-"*65)
correct = 0
for q in range(30):
    is_left  = q >= per_col
    row_idx  = q % per_col
    y_center = y_start + row_idx * row_sp
    xs = L_XS if is_left else R_XS
    dens  = scanner.row_densities(proc_gray, xs, y_center, bub_r, y_tol)
    bi    = int(np.argmax(dens))
    read  = scanner.RTL_MAP[bi] if max(dens) > 0.15 else '?'
    truth = TRUTH[str(q+1)]
    ok    = "OK" if read == truth else f"ERR"
    if read == truth: correct += 1
    print(f"Q{q+1:>2}  {truth:>5}  {dens[0]:>8.3f}  {dens[1]:>8.3f}  {dens[2]:>8.3f}  {dens[3]:>8.3f}  {read:>7}  {ok}")

print("-"*65)
print(f"Correct: {correct}/30 = {correct/30*100:.1f}%")
