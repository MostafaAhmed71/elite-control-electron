import cv2
import scanner
import json
from omr_constants import *

file_path = r"E:\control\omr_engine\temp_sheets\sheet_0.png"
output_path = r"E:\control\omr_engine\temp_sheets\sheet_0_debug.png"

img = cv2.imread(file_path)
if img is None:
    print("Error: Could not find sheet_0.png")
    exit()

# Solve Q1:A, Q2:B, Q3:C, Q4:D, Q5:A
# Coordinates from omr_constants
col_width = (WIDTH - 2 * MARGIN) // 2
for i, opt_idx in enumerate([0, 1, 2, 3, 0]): # Column index for A, B, C, D
    y = QS_ROW0_CENTER_Y + i * QS_ROW_SPACING
    x_base = MARGIN + 200 # First column
    x = x_base + opt_idx * QS_OPT_SPACING
    cv2.circle(img, (int(x), int(y)), 35, (0, 0, 0), -1)

cv2.imwrite(output_path, img)
print(f"Shaded image saved to: {output_path}")

try:
    result = scanner.scan_omr(output_path)
    print("--- Scanning Status ---")
    print(json.dumps(result, indent=4, ensure_ascii=False))
except Exception as e:
    print(f"Scanning failed: {e}")
