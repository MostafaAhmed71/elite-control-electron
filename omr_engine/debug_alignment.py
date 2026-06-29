import cv2
import numpy as np
import scanner

file_path = r"E:\control\omr_engine\temp_sheets\sheet_1_solved.png"
output_debug = r"E:\control\omr_engine\debug_alignment.png"

# Load and process like scanner.py
img = cv2.imread(file_path)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
blurred = cv2.GaussianBlur(gray, (5, 5), 0)
thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 41, 15)

# Find markers and warp
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
markers = []
for c in contours:
    x, y, w, h = cv2.boundingRect(c)
    if 0.7 <= w/h <= 1.3 and 50 <= w <= 200:
        markers.append([x + w//2, y + h//2])

if len(markers) < 4:
    print(f"Error: Found {len(markers)} markers")
    exit()

rect = scanner.order_points(np.array(markers[:4]))
M = cv2.getPerspectiveTransform(rect, scanner.DEST_POINTS)
warped = cv2.warpPerspective(img, M, (scanner.WIDTH, scanner.HEIGHT))

# Draw where we are looking for ID Grid
id_start_x_base = (scanner.WIDTH - 9 * 85) // 2
id_start_y_row0 = 740
for col in range(10):
    for row in range(10):
        cv2.circle(warped, (id_start_x_base + col * 85, id_start_y_row0 + row * 75), 10, (0, 0, 255), 2)

# Draw where we are looking for Questions
q_sampler_y = 1680
col_width = (scanner.WIDTH - 2 * 150) // 2
for q in range(20):
    col_idx, row_idx = q // 10, q % 10
    x_base = 150 + 200 + col_idx * (col_width + 100)
    y = q_sampler_y + row_idx * 100
    for p in range(4):
        cv2.circle(warped, (x_base + p * 100, y), 12, (255, 0, 0), 2)

# Save visual debug
cv2.imwrite(output_debug, warped)
print(f"Debug alignment image saved to {output_debug}")
