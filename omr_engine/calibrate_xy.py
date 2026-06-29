"""
Measure exact X,Y of all bubbles in the right column (Q1-10).
"""
import cv2
import numpy as np
from omr_constants import *

img = cv2.imread("debug_scans/last_warped.png")
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Only right half
mid = WIDTH // 2
right_gray = gray[:, mid:]

circles = cv2.HoughCircles(
    right_gray, cv2.HOUGH_GRADIENT, dp=1, minDist=80,
    param1=50, param2=25, minRadius=28, maxRadius=55
)
circles = np.round(circles[0]).astype(int)
circles[:, 0] += mid  # back to full image coords

# Filter to question area
q_circles = [c for c in circles if 400 < c[1] < HEIGHT - 400]
q_circles = sorted(q_circles, key=lambda c: (c[1], c[0]))

print(f"Total circles in right half, question area: {len(q_circles)}")
print("\n(y, x, r) sorted by Y then X:")
for c in q_circles:
    print(f"  y={c[1]:5d}  x={c[0]:5d}  r={c[2]}")

# Group by Y (gap=100)
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
    print(f"  Row {i+1}: y={y}  x_positions={xs}")
