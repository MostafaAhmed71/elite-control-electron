import cv2
import numpy as np
import os

img_path = "_الأول_المتوسط_قسم_عام_متوسطة_نخب_منتظم_page-0001.jpg"
img = cv2.imdecode(np.fromfile(img_path, dtype=np.uint8), cv2.IMREAD_COLOR)

if img is not None:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    # Binary Threshold to find black markers
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 15)
    
    cv2.imwrite("debug_threshold.png", thresh)
    print("Threshold image saved as debug_threshold.png. Examining contours...")
    
    cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    found_candidates = 0
    for c in cnts:
        x, y, w, h = cv2.boundingRect(c)
        area = cv2.contourArea(c)
        # Relaxed constraints for debugging
        if 0.5 < w/h < 1.7 and 15 < w < 500:
            cv2.rectangle(img, (x, y), (x+w, y+h), (0, 255, 0), 3)
            found_candidates += 1
            
    cv2.imwrite("debug_contours.png", img)
    print(f"Found {found_candidates} candidates. Result saved to debug_contours.png")
else:
    print("Image not found.")
