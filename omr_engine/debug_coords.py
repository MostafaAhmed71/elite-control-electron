"""
Debug: draw circles at the exact positions the scanner reads
so we can visually check alignment vs actual bubbles.
Run: python debug_coords.py
Output: debug_scans/coords_overlay.png
"""
import cv2
import numpy as np
from omr_constants import *

img = cv2.imread("debug_scans/last_warped.png")
if img is None:
    print("ERROR: debug_scans/last_warped.png not found. Scan a sheet first.")
    exit()

col_width = (WIDTH - 2 * MARGIN) // 2
BUBBLE_MAP = ["D", "C", "B", "A"]
warped_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

print(f"QS_ROW0_CENTER_Y = {QS_ROW0_CENTER_Y}")
print(f"QS_ROW_SPACING   = {QS_ROW_SPACING}")
print(f"QS_OPT_SPACING   = {QS_OPT_SPACING}")
print(f"col_width        = {col_width}")
print()

for q in range(20):
    if q < 10:
        col_idx = 1  # right column → Q1-10
        r_idx = q
    else:
        col_idx = 0  # left column  → Q11-20
        r_idx = q - 10

    base_x = MARGIN + 200 + col_idx * (col_width + 100)
    y = QS_ROW0_CENTER_Y + r_idx * QS_ROW_SPACING

    dens = []
    for i in range(4):
        cx = base_x + i * QS_OPT_SPACING
        cy = y
        # measure density
        y1, y2 = int(cy - 35), int(cy + 35)
        x1, x2 = int(cx - 35), int(cx + 35)
        roi = warped_gray[y1:y2, x1:x2]
        _, th = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        mask = np.zeros_like(th)
        cv2.circle(mask, (35, 35), int(35 * 0.82), 255, -1)
        wt = cv2.bitwise_and(th, mask)
        d = cv2.countNonZero(wt) / (np.pi * (35 * 0.82) ** 2)
        dens.append(d)

        # Draw: green if best candidate, red otherwise
        color = (0, 255, 0) if d == max(dens) else (0, 0, 255)
        cv2.circle(img, (cx, cy), 38, color, 3)
        label = BUBBLE_MAP[i]
        cv2.putText(img, f"{label}:{d:.2f}", (cx - 40, cy - 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

    bi = int(np.argmax(dens))
    detected = BUBBLE_MAP[bi] if dens[bi] > 0.08 else "?"
    print(f"Q{q+1:2d}: col={col_idx} base_x={base_x} y={y}  detected={detected}  dens={[f'{d:.2f}' for d in dens]}")
    # Draw question number
    cv2.putText(img, f"Q{q+1}", (base_x + 4 * QS_OPT_SPACING + 10, y + 10),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 128, 255), 2)

out = "debug_scans/coords_overlay.png"
# Scale down for viewing (A4 at 300dpi is huge)
scale = 0.3
small = cv2.resize(img, (int(WIDTH * scale), int(HEIGHT * scale)))
cv2.imwrite(out, img)
cv2.imwrite("debug_scans/coords_overlay_small.png", small)
print(f"\nSaved: {out}")
print("Also saved small version: debug_scans/coords_overlay_small.png")
