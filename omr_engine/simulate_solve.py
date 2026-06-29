import cv2
import numpy as np
import scanner
import json
from omr_constants import *

# 1. Regenerate Simple Sheet
import generator
file_path = r"E:\control\omr_engine\temp_sheets\sheet_simple.png"
output_path = r"E:\control\omr_engine\temp_sheets\sheet_simple_solved.png"

print("Generating simple template...")
generator.generate_personalized_sheet("102", "علي مكي", filename=file_path)

# 2. "Solve" 5 questions
img = cv2.imread(file_path)
solutions = [0, 1, 2, 3, 0] # A, B, C, D, A
col_width = (WIDTH - 2 * MARGIN) // 2

for i, opt_idx in enumerate(solutions):
    col_idx, row_idx = i // 10, i % 10
    x_base = MARGIN + 200 + col_idx * (col_width + 100)
    y = QS_ROW0_CENTER_Y + row_idx * QS_ROW_SPACING
    x = x_base + opt_idx * QS_OPT_SPACING
    cv2.circle(img, (int(x), int(y)), 30, (0, 0, 0), -1)

# 3. Save and Scan
cv2.imwrite(output_path, img)
try:
    print("Scanning with QR Auto-ID...")
    result = scanner.scan_omr(output_path)
    print("--- Scan Results ---")
    print(json.dumps(result, indent=4, ensure_ascii=False))
except Exception as e:
    print(f"Error: {e}")
