# -*- coding: utf-8 -*-
"""
debug_student.py  — Visual OMR Debug Tool
==========================================
Usage (from omr_engine folder):
    .\\venv\\Scripts\\python.exe debug_student.py
    
Opens the last scanned image and draws:
  - Green circle  = detected answer
  - Red circle    = empty bubble position
  - Yellow dot    = corner markers found
  
Prints actual ink density for every bubble so you can tune thresholds.
"""
import cv2
import numpy as np
import sys
import os
sys.path.insert(0, '.')

from omr_constants import *
import scanner

# ── Config ────────────────────────────────────────────────────────────────────
IMG_PATH = "debug_scans/last_warped.png"
STYLE    = "default"      # change to "nafs" or "elite" if needed
OUT_PATH = "debug_scans/debug_annotated.png"

def main():
    if not os.path.exists(IMG_PATH):
        print(f"ERROR: {IMG_PATH} not found. Scan a sheet first.")
        return

    # Run full scan to get aligned image + answers
    result = scanner.scan_omr(IMG_PATH, is_bytes=False, style=STYLE)
    print(f"\nStudent ID : {result['student_id']}")
    print(f"Answers    : {result['answers']}\n")

    # Reload the (now-aligned) warped image for annotation
    img = cv2.imread(IMG_PATH)
    if img is None:
        print("Cannot read image")
        return

    gray      = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    proc_gray = scanner.preprocess(gray)

    # Get geometry
    if STYLE == "elite":
        R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_elite()
    elif STYLE == "nafs":
        R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_nafs()
    else:
        R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_default()

    print(f"{'Q':<4} {'A':<4} {'B':<6} {'C':<6} {'D':<6}  → Detected")
    print("-" * 45)

    for q in range(30):
        is_left  = q >= 15
        row_idx  = q % 15
        y_center = y_start + row_idx * row_sp
        xs       = L_XS if is_left else R_XS

        dens = scanner.row_densities(proc_gray, xs, y_center, bub_r, y_tol)
        ans  = scanner.pick_answer(dens)

        labels = ["A", "B", "C", "D"]
        d_str  = "  ".join(f"{d:.3f}" for d in dens)
        print(f"Q{q+1:<3} {dens[0]:.3f}  {dens[1]:.3f}  {dens[2]:.3f}  {dens[3]:.3f}   → {ans or '(blank)'}")

        # Annotate image
        for i, x in enumerate(xs):
            colour = (0, 200, 0) if labels[i] == ans else (0, 0, 200)
            thickness = 4 if labels[i] == ans else 2
            cv2.circle(img,
                       (int(x * img.shape[1] / WIDTH), int(y_center * img.shape[0] / HEIGHT)),
                       max(5, int(bub_r * img.shape[1] / WIDTH)),
                       colour, thickness)
        
        # Label
        q_x = int(xs[0] * img.shape[1] / WIDTH) + 5
        q_y = int(y_center * img.shape[0] / HEIGHT)
        cv2.putText(img, f"Q{q+1}", (q_x, q_y - int(bub_r * img.shape[0] / HEIGHT) - 3),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (80, 80, 80), 1)

    # Show corner markers
    corners = scanner.find_corner_markers(gray)
    if corners:
        for pt in corners:
            sx = int(pt[0] * img.shape[1] / WIDTH)
            sy = int(pt[1] * img.shape[0] / HEIGHT)
            cv2.drawMarker(img, (sx, sy), (0, 255, 255),
                           cv2.MARKER_CROSS, 30, 3)
        print("\n✅ Corner markers detected — fine alignment applied")
    else:
        print("\n⚠️  Corner markers NOT detected — using coarse alignment only")

    # Scale down for display (fit on screen)
    scale    = 900 / img.shape[0]
    disp     = cv2.resize(img, (int(img.shape[1] * scale), 900))
    cv2.imwrite(OUT_PATH, img)
    print(f"\nAnnotated image saved → {OUT_PATH}")

    cv2.imshow("OMR Debug — press any key to close", disp)
    cv2.waitKey(0)
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
