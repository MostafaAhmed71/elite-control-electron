import cv2
import numpy as np

file_path = r"E:\control\omr_engine\temp_sheets\sheet_1.png"
img = cv2.imread(file_path)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
_, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)

# Find all circles
circles = cv2.HoughCircles(gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=50,
                           param1=50, param2=30, minRadius=20, maxRadius=30)

if circles is not None:
    circles = np.round(circles[0, :]).astype("int")
    # Sort by Y
    circles = sorted(circles, key=lambda x: x[1])
    print(f"Found {len(circles)} circles.")
    print(f"Top-most circle Y: {circles[0][1]}")
    # Group by Y to find rows
    rows = {}
    for (x, y, r) in circles:
        found_row = False
        for row_y in rows.keys():
            if abs(y - row_y) < 20:
                rows[row_y].append(y)
                found_row = True
                break
        if not found_row:
            rows[y] = [y]
    
    sorted_row_ys = sorted(rows.keys())
    print("Row Y-Coordinates found:")
    for i, y in enumerate(sorted_row_ys):
        print(f"Row {i}: Y={y}")
else:
    print("No circles found.")
