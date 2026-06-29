"""
Measure X positions in the LEFT column (Q11-20).
"""
import cv2
import numpy as np
from omr_constants import *

img = cv2.imread("debug_scans/last_warped.png")
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

mid = WIDTH // 2
left_gray = gray[:, :mid]

circles = cv2.HoughCircles(
    left_gray, cv2.HOUGH_GRADIENT, dp=1, minDist=80,
    param1=50, param2=25, minRadius=28, maxRadius=55
)
if circles is None:
    print("No circles found in left half!")
    exit()

circles = np.round(circles[0]).astype(int)
q_circles = [c for c in circles if 400 < c[1] < HEIGHT - 400]
q_circles = sorted(q_circles, key=lambda c: (c[1], c[0]))

print(f"Total circles in LEFT half, question area: {len(q_circles)}")

rows = []
current = [q_circles[0]]
for c in q_circles[1:]:
    if abs(c[1] - current[0][1]) < 100:
        current.append(c)
    else:
        rows.append(current)
        current = [c]
rows.append(current)

print(f"\n{len(rows)} rows detected:")
for i, row in enumerate(rows):
    xs = sorted([c[0] for c in row])
    y = int(np.mean([c[1] for c in row]))
    print(f"  Row {i+1} (Q{i+11}): y={y}  x={xs}")
