import cv2
import numpy as np
import scanner
from omr_constants import *

file_path = r"E:\control\omr_engine\temp_sheets\sheet_1_solved.png"
output_debug = r"E:\control\omr_engine\debug_full.png"

img = cv2.imread(file_path)
if img is None: exit()

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
blurred = cv2.GaussianBlur(gray, (5, 5), 0)
thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 10)

# Found Markers
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
markers = []
for c in contours:
    x, y, w, h = cv2.boundingRect(c)
    if 0.7 <= w/h <= 1.3 and 50 <= w <= 200:
        markers.append([x + w//2, y + h//2])
        cv2.rectangle(img, (x, y), (x + w, y + h), (0, 255, 0), 3)

if len(markers) < 4:
    print(f"Only {len(markers)} markers found")
    cv2.imwrite(output_debug, img) # Save what we found
    exit()

rect = scanner.order_points(np.array(markers[:4]))
M = cv2.getPerspectiveTransform(rect, scanner.DEST_POINTS)
warped = cv2.warpPerspective(img, M, (WIDTH, HEIGHT))

# Draw Sampling Circles
id_start_x_base = (WIDTH - 9 * ID_COL_SPACING) // 2
for col in range(10):
    for row in range(10):
        cv2.circle(warped, (id_start_x_base + col * ID_COL_SPACING, ID_ROW0_CENTER_Y + row * ID_ROW_SPACING), 15, (0, 0, 255), 2)

col_width = (WIDTH - 2 * MARGIN) // 2
for q in range(20):
    col_idx, row_idx = q // 10, q % 10
    x_base = MARGIN + 200 + col_idx * (col_width + 100)
    y = QS_ROW0_CENTER_Y + row_idx * QS_ROW_SPACING
    for p in range(4):
        cv2.circle(warped, (x_base + p * QS_OPT_SPACING, y), 20, (255, 0, 0), 2)

cv2.imwrite(output_debug, warped)
print(f"Debug saved to {output_debug}")
