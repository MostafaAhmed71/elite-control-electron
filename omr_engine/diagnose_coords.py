import cv2
import numpy as np
from omr_constants import *

# Load the warped image directly (what scanner sees after perspective transform)
warped = cv2.imread(r"debug_scans/last_warped.png")
if warped is None:
    print("ERROR: Run a scan first to generate debug_scans/last_warped.png")
    exit()

gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
_, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)

col_width = (WIDTH - 2 * MARGIN) // 2
x_base = MARGIN + 200  # First column x_base
y = QS_ROW0_CENTER_Y   # Row 0 (Q1) center y

print(f"=== Diagnostic Info ===")
print(f"Image size: {warped.shape[1]}x{warped.shape[0]}")
print(f"WIDTH={WIDTH}, HEIGHT={HEIGHT}, MARGIN={MARGIN}")
print(f"QS_ROW0_CENTER_Y={QS_ROW0_CENTER_Y}, QS_OPT_SPACING={QS_OPT_SPACING}")
print(f"x_base (col 0) = {x_base}, y (Q1) = {y}")
print()

labels = ["A (أ)", "B (ب)", "C (ج)", "D (د)"]
for p in range(4):
    ox = x_base + p * QS_OPT_SPACING
    r = 30
    y1, y2 = max(0, int(y - r)), min(thresh.shape[0] - 1, int(y + r))
    x1, x2 = max(0, int(ox - r)), min(thresh.shape[1] - 1, int(ox + r))
    roi = thresh[y1:y2, x1:x2]
    area = (r * 2) ** 2
    d = cv2.countNonZero(roi) / area if area > 0 else 0
    print(f"Option {labels[p]}: center=({ox}, {y}), density={d:.4f} {'<< SHADED' if d > 0.30 else ''}")

# Save annotated image showing where scanner is looking
vis = warped.copy()
for p in range(4):
    ox = int(x_base + p * QS_OPT_SPACING)
    cv2.circle(vis, (ox, int(y)), 30, (0, 0, 255), 3)
    cv2.putText(vis, labels[p][:1], (ox - 10, int(y) + 10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)

# Draw all 10 rows for col 1
for i in range(10):
    row_y = int(QS_ROW0_CENTER_Y + i * QS_ROW_SPACING)
    for p in range(4):
        ox = int(x_base + p * QS_OPT_SPACING)
        cv2.circle(vis, (ox, row_y), 5, (255, 0, 0), -1)

cv2.imwrite("debug_scans/calibration_overlay.png", vis)
print("\nSaved annotated image to: debug_scans/calibration_overlay.png")
