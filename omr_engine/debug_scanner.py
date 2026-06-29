# -*- coding: utf-8 -*-
"""
debug_scanner.py — Diagnose scanner image issues
=================================================
Run AFTER a scanner scan:
    .\\venv\\Scripts\\python.exe debug_scanner.py

Reads the last scanner_raw_p1.png saved by main.py and shows:
  - Image dimensions (should be ~2480×3508 for 300 DPI)
  - Whether corner markers were found
  - QR code reading result
  - Ink density for every bubble
  - Annotated image saved to debug_scans/debug_scanner_annotated.png
"""
import cv2
import numpy as np
import sys
import os
sys.path.insert(0, '.')

import scanner
from omr_constants import *

IMG_PATH = "debug_scans/scanner_raw_p1.png"
STYLE    = "nafs"   # change if needed

def main():
    if not os.path.exists(IMG_PATH):
        print(f"ERROR: {IMG_PATH} not found. Scan a sheet first.")
        return

    img = cv2.imread(IMG_PATH)
    if img is None:
        from PIL import Image as PIL_Image
        pil = PIL_Image.open(IMG_PATH).convert("RGB")
        img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

    h, w = img.shape[:2]
    print(f"\n📐 Image dimensions: {w}×{h} px")
    print(f"   Expected for 300 DPI A4: ~2480×3508")
    
    if w > h:
        print("   ⚠️  Image is LANDSCAPE — will auto-rotate")
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
        h, w = img.shape[:2]
        print(f"   After rotation: {w}×{h}")

    ratio = w / WIDTH
    print(f"   Scale ratio vs. template: {ratio:.3f}  (1.000 = perfect)")
    if abs(ratio - 1.0) > 0.05:
        print(f"   ⚠️  Scale is off — DPI mismatch likely. Scanner DPI must be set to 300.")

    # Try QR decode on raw image
    gray_raw = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    qrd = cv2.QRCodeDetector()
    sid_raw, _, _ = qrd.detectAndDecode(img)
    print(f"\n🔲 QR on raw image: {repr(sid_raw) if sid_raw else 'NOT FOUND'}")

    # Run full scan_omr pipeline
    print(f"\n🚀 Running scan_omr(from_scanner=True, style={STYLE!r})...")
    result = scanner.scan_omr(IMG_PATH, is_bytes=False, style=STYLE, from_scanner=True)
    print(f"   Student ID : {result['student_id'] or '(not found)'}")
    print(f"   Answers    : {result['answers']}")

    # Reload warped image
    warped_path = "debug_scans/last_warped.png"
    warped = cv2.imread(warped_path)
    if warped is None:
        print("Cannot load last_warped.png"); return

    warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    proc_gray   = scanner.preprocess(warped_gray)

    # Corner markers
    corners = scanner.find_corner_markers(warped_gray)
    if corners:
        print(f"\n✅ Corner markers found: {corners}")
        for pt in corners:
            sx = int(pt[0] * warped.shape[1] / WIDTH)
            sy = int(pt[1] * warped.shape[0] / HEIGHT)
            cv2.drawMarker(warped, (sx, sy), (0, 255, 255), cv2.MARKER_CROSS, 40, 4)
    else:
        print(f"\n❌ Corner markers NOT found — using resize-only alignment")

    # Get bubble grid
    if STYLE == 'elite':
        R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_elite()
    elif STYLE == 'nafs':
        R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_nafs()
    else:
        R_XS, L_XS, y_start, row_sp, bub_r, y_tol = scanner.get_bubble_grid_default()

    print(f"\n📊 Per-question ink densities:")
    print(f"{'Q':<4} {'A':<7} {'B':<7} {'C':<7} {'D':<7}  → ans")
    print("-" * 50)

    labels = ["A", "B", "C", "D"]
    for q in range(30):
        is_left  = q >= 15
        row_idx  = q % 15
        y_center = y_start + row_idx * row_sp
        xs       = L_XS if is_left else R_XS
        dens     = scanner.row_densities(proc_gray, xs, y_center, bub_r, y_tol)
        ans      = scanner.pick_answer(dens)
        print(f"Q{q+1:<3} {dens[0]:.3f}  {dens[1]:.3f}  {dens[2]:.3f}  {dens[3]:.3f}   → {ans or '(blank)'}")

        # Annotate warped image
        for i, x in enumerate(xs):
            colour = (0, 200, 0) if labels[i] == ans else (0, 0, 220)
            px = int(x * warped.shape[1] / WIDTH)
            py = int(y_center * warped.shape[0] / HEIGHT)
            cv2.circle(warped, (px, py), max(6, int(bub_r * warped.shape[1] / WIDTH)),
                       colour, 3)

    out = "debug_scans/debug_scanner_annotated.png"
    cv2.imwrite(out, warped)
    print(f"\n💾 Annotated image saved → {out}")
    
    scale = 900 / warped.shape[0]
    disp  = cv2.resize(warped, (int(warped.shape[1] * scale), 900))
    cv2.imshow("Scanner Debug — press any key", disp)
    cv2.waitKey(0)
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
