"""
Auto-calibrate: find the actual Y start of the questions section
by detecting bubble rows automatically from the warped image.
Run: python calibrate_y.py
"""
import cv2
import numpy as np
from omr_constants import *

img = cv2.imread("debug_scans/last_warped.png")
if img is None:
    print("ERROR: debug_scans/last_warped.png not found. Scan a sheet first.")
    exit()

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# Find circles in the right half of the image (Q1-10 area)
right_half = gray[:, WIDTH//2:]
blurred = cv2.GaussianBlur(right_half, (9, 9), 2)

circles = cv2.HoughCircles(
    blurred,
    cv2.HOUGH_GRADIENT,
    dp=1,
    minDist=80,
    param1=50,
    param2=25,
    minRadius=25,
    maxRadius=55
)

if circles is not None:
    circles = np.round(circles[0, :]).astype(int)
    # Offset x back to full image
    circles[:, 0] += WIDTH // 2
    # Get y values only in question area (between y=400 and y=3000)
    ys = sorted([c[1] for c in circles if 400 < c[1] < 3000])
    
    print(f"Found {len(circles)} circles in right half")
    print(f"Y values in question area: {ys}")
    
    # Find the first cluster (first row of bubbles)
    if ys:
        # Group by proximity
        groups = []
        current_group = [ys[0]]
        for y in ys[1:]:
            if y - current_group[-1] < 50:
                current_group.append(y)
            else:
                groups.append(current_group)
                current_group = [y]
        groups.append(current_group)
        
        # Valid groups (at least 2 circles)
        valid_groups = [g for g in groups if len(g) >= 2]
        row_centers = [int(np.mean(g)) for g in valid_groups]
        
        print(f"\nRow groupings: {valid_groups}")
        print(f"Row centers: {row_centers}")
        
        if len(row_centers) >= 2:
            spacings = [row_centers[i+1] - row_centers[i] for i in range(len(row_centers)-1)]
            print(f"Spacings between rows: {spacings}")
            print(f"Median spacing: {np.median(spacings):.0f}")
        
        if row_centers:
            print(f"\nFirst row Y = {row_centers[0]}")
            print(f"Current QS_ROW0_CENTER_Y = {QS_ROW0_CENTER_Y}")
            print(f"Difference = {row_centers[0] - QS_ROW0_CENTER_Y}")
else:
    print("No circles found!")
