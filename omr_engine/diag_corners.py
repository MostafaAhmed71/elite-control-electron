"""
فحص مواضع علامات الزوايا الفعلية مقابل المتوقعة
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
print(f"Original image size: {w0}x{h0}")
if w0 > h0:
    img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    print("Rotated 90 CCW")

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Step 1: paper contour
paper = scanner.get_paper_contour(gray)
print(f"\nPaper contour found: {paper is not None}")

if paper is not None:
    pts  = paper.reshape(4,2)
    rect = scanner.order_points(pts)
    M    = cv2.getPerspectiveTransform(rect,
           np.array([[0,0],[WIDTH,0],[WIDTH,HEIGHT],[0,HEIGHT]],dtype="float32"))
    warped = cv2.warpPerspective(img, M, (WIDTH,HEIGHT))
else:
    warped = cv2.resize(img, (WIDTH,HEIGHT))

warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

# Step 2: Corner markers BEFORE refinement
ms  = CORNER_MARKER_SIZE  # 80
off = MARGIN + ms // 2    # 190

expected = {
    "TL": (int(off * WIDTH  / WIDTH),  int(off * HEIGHT / HEIGHT)),
    "TR": (int((WIDTH-off)  * WIDTH/WIDTH), int(off * HEIGHT/HEIGHT)),
    "BL": (int(off * WIDTH  / WIDTH),  int((HEIGHT-off) * HEIGHT/HEIGHT)),
    "BR": (int((WIDTH-off)  * WIDTH/WIDTH), int((HEIGHT-off) * HEIGHT/HEIGHT)),
}

corners_before = scanner.find_corner_markers(warped_gray)
print(f"\nCorner markers found (before refinement): {corners_before is not None}")

print(f"\nExpected corner centers (ideal):")
for name, (cx,cy) in expected.items():
    print(f"  {name}: ({cx}, {cy})")

if corners_before:
    tl,tr,bl,br = corners_before
    actual = {"TL":tl,"TR":tr,"BL":bl,"BR":br}
    print(f"\nActual corner centers detected:")
    for name, (cx,cy) in actual.items():
        ex,ey = expected[name]
        dx,dy = cx-ex, cy-ey
        print(f"  {name}: ({cx}, {cy})  offset=({dx:+d}, {dy:+d})")

    # Step 3: after refinement warp
    warped2, warped_gray2 = scanner.refine_warp_with_markers(warped, warped_gray)
    corners_after = scanner.find_corner_markers(warped_gray2)
    print(f"\nCorner markers found (AFTER refinement): {corners_after is not None}")
    if corners_after:
        tl2,tr2,bl2,br2 = corners_after
        actual2 = {"TL":tl2,"TR":tr2,"BL":bl2,"BR":br2}
        print(f"Corner positions AFTER refinement:")
        for name,(cx,cy) in actual2.items():
            ex,ey = expected[name]
            dx,dy = cx-ex, cy-ey
            print(f"  {name}: ({cx}, {cy})  offset=({dx:+d}, {dy:+d})")

    # Compute scale factors
    print(f"\nScale analysis:")
    if corners_before:
        tl,tr,bl,br = corners_before
        px_per_col_R = abs(tr[0]-tl[0])  # actual pixel width
        px_per_col_E = WIDTH - 2*off      # expected pixel width
        scale_x = px_per_col_R / px_per_col_E
        px_per_row = abs(bl[1]-tl[1])
        px_per_row_E = HEIGHT - 2*off
        scale_y = px_per_row / px_per_row_E
        print(f"  Actual TL->TR span:  {px_per_col_R}px (expected {px_per_col_E}px) scale_x={scale_x:.4f}")
        print(f"  Actual TL->BL span:  {px_per_row}px  (expected {px_per_row_E}px)  scale_y={scale_y:.4f}")
        
        # What should QS_OPT_SPACING be at this scale?
        actual_opt_spacing = QS_OPT_SPACING * scale_x
        print(f"\n  Expected QS_OPT_SPACING: {QS_OPT_SPACING}px")
        print(f"  Actual   QS_OPT_SPACING: {actual_opt_spacing:.1f}px")
        print(f"  Expected QS_ROW_SPACING: {QS_ROW_SPACING}px")
        print(f"  Actual   QS_ROW_SPACING: {QS_ROW_SPACING * scale_y:.1f}px")
