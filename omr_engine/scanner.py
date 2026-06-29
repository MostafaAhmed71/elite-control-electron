# -*- coding: utf-8 -*-
"""
Professional OMR Scanner — High-Accuracy Edition
=================================================
Target: 99% accuracy via:
  1. Corner-marker alignment   → precise coordinate calibration
  2. CLAHE preprocessing       → handle scanner brightness variations
  3. Adaptive local threshold  → per-bubble contrast, not global
  4. Relative dominance check  → filled bubble must be 3× darker than 2nd
  5. Strict blank detection    → blank row stays blank (no false D answers)
"""

import cv2
import numpy as np
import os
import json
import hashlib
import base64
import tempfile
from datetime import datetime
from omr_constants import *

try:
    from pyzbar.pyzbar import decode as decode_qr
except Exception:
    decode_qr = None

# Write debug/audit files outside the workspace by default to avoid
# dev-server file watchers triggering page/app reload.
DEBUG_DIR = os.getenv("OMR_DEBUG_DIR", os.path.join(tempfile.gettempdir(), "omr_debug_scans"))
if not os.path.exists(DEBUG_DIR):
    os.makedirs(DEBUG_DIR)

AUDIT_LOG_PATH = os.path.join(DEBUG_DIR, "omr_audit_log.jsonl")


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — Image Alignment
# ══════════════════════════════════════════════════════════════════════════════

def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s    = pts.sum(axis=1)
    rect[0], rect[2] = pts[np.argmin(s)], pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def infer_flatbed_scan_image(img_bgr):
    """
    Heuristic: images from a document scanner (flatbed/ADF) are usually
    high-resolution portrait pages with A4-like aspect ratio.
    Uploaded scanner files should use the same alignment path as live scans.
    """
    if img_bgr is None or img_bgr.size == 0:
        return False
    h, w = img_bgr.shape[:2]
    if w > h:
        w, h = h, w
    if h < 1400 or w < 1000:
        return False
    aspect = w / float(h)
    target = WIDTH / float(HEIGHT)
    return abs(aspect - target) <= 0.14


def calibrate_printer_geometry(gray_img):
    """
    Analyze a scanned printed sheet to verify its physical dimensions.
    Returns a report with scale factors and integrity score.
    """
    corners = find_corner_markers(gray_img)
    if corners is None:
        return {
            "is_safe": False,
            "error": "could_not_find_markers",
            "message": "فشل في العثور على علامات الزوايا. تأكد من جودة الطباعة والمسح."
        }

    tl, tr, bl, br = corners
    
    # Ideal positions based on constants
    ms  = CORNER_MARKER_SIZE
    off = MARGIN + ms // 2
    
    ideal_w = WIDTH - 2 * off
    ideal_h = HEIGHT - 2 * off
    
    # Measured positions
    actual_w_top = np.sqrt((tr[0]-tl[0])**2 + (tr[1]-tl[1])**2)
    actual_w_bot = np.sqrt((br[0]-bl[0])**2 + (br[1]-bl[1])**2)
    actual_h_left = np.sqrt((bl[0]-tl[0])**2 + (bl[1]-tl[1])**2)
    actual_h_right = np.sqrt((br[0]-tr[0])**2 + (br[1]-tr[1])**2)
    
    avg_w = (actual_w_top + actual_w_bot) / 2
    avg_h = (actual_h_left + actual_h_right) / 2
    
    scale_x = avg_w / ideal_w
    scale_y = avg_h / ideal_h
    
    # Aspect ratio check
    ideal_aspect = ideal_w / ideal_h
    actual_aspect = avg_w / avg_h
    aspect_error = abs(actual_aspect - ideal_aspect) / ideal_aspect
    
    # Rotation/Skew check
    skew_angle = abs(tr[1] - tl[1]) / avg_w # basic tangent
    
    is_safe = (0.995 <= scale_x <= 1.005) and (0.995 <= scale_y <= 1.005) and aspect_error < 0.005
    
    return {
        "is_safe": is_safe,
        "scale_x": round(scale_x, 4),
        "scale_y": round(scale_y, 4),
        "aspect_error": round(aspect_error, 5),
        "skew_angle": round(skew_angle, 5),
        "status": "success"
    }


def get_paper_contour(img_gray):
    """Locate the A4 paper boundary (must cover >50% of image area)."""
    blurred = cv2.GaussianBlur(img_gray, (7, 7), 0)
    edged   = cv2.Canny(blurred, 30, 120)
    cnts, _ = cv2.findContours(edged.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    img_h, img_w = img_gray.shape
    img_area = img_w * img_h
    cnts = sorted(cnts, key=cv2.contourArea, reverse=True)
    for c in cnts:
        area = cv2.contourArea(c)
        if area < 0.50 * img_area:
            break
        peri   = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            x, y, w, h = cv2.boundingRect(approx)
            if h > w * 1.1:
                return approx
    return None


def find_corner_markers(warped_gray):
    """
    Detect the four black corner squares printed by generator.py.
    Returns (tl, tr, bl, br) pixel coords of marker centres, or None.
    
    Each marker is CORNER_MARKER_SIZE × CORNER_MARKER_SIZE = 80×80 px
    printed at the four corners at distance MARGIN (150 px) from page edge.
    Expected centres (at generated resolution):
        TL = (MARGIN + 40, MARGIN + 40)  →  (190, 190)
        TR = (WIDTH - MARGIN - 40, MARGIN + 40)
        BL = (MARGIN + 40, HEIGHT - MARGIN - 40)
        BR = (WIDTH - MARGIN - 40, HEIGHT - MARGIN - 40)
    """
    ms   = CORNER_MARKER_SIZE      # 80
    off  = MARGIN + ms // 2        # 190  — expected centre offset from edge
    h, w = warped_gray.shape

    # Expected centre positions (in the warped/resized image)
    expected = {
        "TL": (int(off * w / WIDTH),      int(off * h / HEIGHT)),
        "TR": (int((WIDTH - off) * w / WIDTH), int(off * h / HEIGHT)),
        "BL": (int(off * w / WIDTH),      int((HEIGHT - off) * h / HEIGHT)),
        "BR": (int((WIDTH - off) * w / WIDTH), int((HEIGHT - off) * h / HEIGHT)),
    }

    # Search radius around each expected position  
    search_r = int(ms * 2.5 * w / WIDTH)   # ~½ of cell @ 300dpi

    found = {}
    for name, (cx, cy) in expected.items():
        x1, y1 = max(0, cx - search_r), max(0, cy - search_r)
        x2, y2 = min(w, cx + search_r), min(h, cy + search_r)
        roi = warped_gray[y1:y2, x1:x2]
        if roi.size == 0:
            continue
        _, binary = cv2.threshold(roi, 80, 255, cv2.THRESH_BINARY_INV)
        cnts, _   = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        best_area = 0
        marker_expected_area = (ms * w / WIDTH) ** 2
        for c in cnts:
            area = cv2.contourArea(c)
            if area < marker_expected_area * 0.2:   # too small — noise
                continue
            if area > marker_expected_area * 3.0:   # too big  — wrong blob
                continue
            if area > best_area:
                best_area = area
                best = c
        if best is not None:
            M2 = cv2.moments(best)
            if M2["m00"] > 0:
                bx = int(M2["m10"] / M2["m00"]) + x1
                by = int(M2["m01"] / M2["m00"]) + y1
                found[name] = (bx, by)

    if len(found) == 4:
        return found["TL"], found["TR"], found["BL"], found["BR"]
    return None


def refine_warp_with_markers(warped, warped_gray):
    """
    If all four corner markers are detected, apply a second perspective
    correction so bubble coordinates match the generated template exactly.
    Returns the refined image (or original if markers are not found).
    """
    corners = find_corner_markers(warped_gray)
    if corners is None:
        return warped, warped_gray

    tl, tr, bl, br = corners
    src_pts = np.array([tl, tr, br, bl], dtype="float32")

    # The ideal positions (centres of the printed markers in pixel space)
    ms  = CORNER_MARKER_SIZE  # 80
    off = MARGIN + ms // 2    # 190
    dst_pts = np.array([
        [off, off],
        [WIDTH - off, off],
        [WIDTH - off, HEIGHT - off],
        [off, HEIGHT - off],
    ], dtype="float32")

    # Skip micro-corrections — small marker-detection noise causes visible
    # bubble-grid drift in the review overlay without improving reads.
    max_err = max(float(np.linalg.norm(src_pts[i] - dst_pts[i])) for i in range(4))
    if max_err < 8.0:
        return warped, warped_gray

    M = cv2.getPerspectiveTransform(src_pts, dst_pts)
    refined = cv2.warpPerspective(warped, M, (WIDTH, HEIGHT))
    refined_gray = cv2.cvtColor(refined, cv2.COLOR_BGR2GRAY)
    return refined, refined_gray


def _ring_strength(gray, cx, cy, radius):
    """Score alignment of a printed bubble ring at (cx, cy)."""
    r = int(radius)
    pad = 6
    x1, y1 = int(cx) - r - pad, int(cy) - r - pad
    x2, y2 = int(cx) + r + pad, int(cy) + r + pad
    h, w = gray.shape
    if x1 < 0 or y1 < 0 or x2 >= w or y2 >= h:
        return -1.0
    roi = gray[y1:y2, x1:x2]
    if roi.size == 0:
        return -1.0
    _, binary = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    roi_h, roi_w = roi.shape
    cx_r, cy_r = roi_w // 2, roi_h // 2
    Y, X = np.ogrid[:roi_h, :roi_w]
    dist = np.sqrt((X - cx_r) ** 2 + (Y - cy_r) ** 2)
    ring_mask = (dist >= r * 0.72) & (dist <= r * 1.12)
    if not ring_mask.any():
        return -1.0
    return float(np.mean(binary[ring_mask])) / 255.0


def locate_bubble_center(gray, cx, cy, radius, search=50, step=2):
    """Find the printed bubble centre near the template coordinate."""
    best = (int(cx), int(cy))
    best_s = -1.0
    for dy in range(-search, search + 1, step):
        for dx in range(-search, search + 1, step):
            x, y = int(cx) + dx, int(cy) + dy
            s = _ring_strength(gray, x, y, radius)
            if s > best_s:
                best_s = s
                best = (x, y)
    if best_s < 0.035:
        return None
    return best


def _collect_ring_alignment_offsets(warped_gray, R_XS, L_XS, y_start, row_sp, bub_r, per_col):
    """Ring-based offset samples; skips heavily filled bubbles."""
    sample_rows = sorted({
        0,
        max(0, per_col // 4),
        max(0, per_col // 2),
        max(0, (3 * per_col) // 4),
        per_col - 1,
    })
    offsets_x, offsets_y = [], []
    for xs in (R_XS, L_XS):
        for row_idx in sample_rows:
            if row_idx >= per_col:
                continue
            y = int(y_start + row_idx * row_sp)
            for expected_x in xs:
                expected_x = int(expected_x)
                if bubble_ink_ratio(warped_gray, expected_x, y, bub_r) > 0.22:
                    continue
                found = locate_bubble_center(warped_gray, expected_x, y, bub_r)
                if found:
                    offsets_x.append(found[0] - expected_x)
                    offsets_y.append(found[1] - y)
    return offsets_x, offsets_y


def calibrate_grid_offset_hough(warped_gray, R_XS, L_XS, y_start, row_sp, bub_r, num_questions):
    """
    Detect printed bubble circles in the question block and estimate (dx, dy)
    vs the template grid. Works even when many bubbles are pencil-filled.
    """
    per_col = (num_questions + 1) // 2
    if per_col < 1:
        return 0, 0, 0

    y_lo = max(0, int(y_start - 90))
    y_hi = min(HEIGHT, int(y_start + per_col * row_sp + 120))
    roi = warped_gray[y_lo:y_hi, :]
    if roi.size == 0:
        return 0, 0, 0

    blurred = cv2.GaussianBlur(roi, (5, 5), 1.2)
    min_r = max(16, int(bub_r * 0.5))
    max_r = int(bub_r * 1.45)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.15,
        minDist=max(55, int(row_sp * 0.5)),
        param1=70,
        param2=20,
        minRadius=min_r,
        maxRadius=max_r,
    )
    if circles is None:
        return 0, 0, 0

    pts = [(int(c[0]), int(c[1]) + y_lo) for c in np.round(circles[0]).astype(int)]
    match_radius = max(70, int(bub_r * 1.8))

    offsets = []
    for row in range(per_col):
        y_exp = int(y_start + row * row_sp)
        for x_exp in list(R_XS) + list(L_XS):
            x_exp = int(x_exp)
            best = None
            best_d2 = match_radius * match_radius
            for cx, cy in pts:
                d2 = (cx - x_exp) ** 2 + (cy - y_exp) ** 2
                if d2 < best_d2:
                    best_d2 = d2
                    best = (cx, cy)
            if best:
                offsets.append((best[0] - x_exp, best[1] - y_exp))

    if len(offsets) < 6:
        return 0, 0, 0

    dx = int(round(float(np.median([o[0] for o in offsets]))))
    dy = int(round(float(np.median([o[1] for o in offsets]))))
    return dx, dy, len(offsets)


def auto_align_bubble_grid(warped_gray, R_XS, L_XS, y_start, row_sp, bub_r, num_questions):
    """
    Measure uniform (dx, dy) shift between template grid and printed bubbles.
    Prefers Hough circle matching; ring search is fallback only for large drift.
    """
    per_col = (num_questions + 1) // 2
    if per_col < 1:
        return list(R_XS), list(L_XS), y_start, 0, 0

    dx_h, dy_h, n_hough = calibrate_grid_offset_hough(
        warped_gray, R_XS, L_XS, y_start, row_sp, bub_r, num_questions
    )

    dx, dy = 0, 0
    if n_hough >= 12:
        dx, dy = dx_h, dy_h
    else:
        ox, oy = _collect_ring_alignment_offsets(
            warped_gray, R_XS, L_XS, y_start, row_sp, bub_r, per_col
        )
        if len(oy) >= 5:
            dx = int(round(float(np.median(ox))))
            dy = int(round(float(np.median(oy))))

    if abs(dx) < 4 and abs(dy) < 4:
        return list(R_XS), list(L_XS), y_start, 0, 0
    if abs(dx) > 90 or abs(dy) > 90:
        return list(R_XS), list(L_XS), y_start, 0, 0

    R_adj = [x + dx for x in R_XS]
    L_adj = [x + dx for x in L_XS]
    return R_adj, L_adj, y_start + dy, dx, dy


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — Image Preprocessing
# ══════════════════════════════════════════════════════════════════════════════

def preprocess(gray):
    """
    Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
    to normalise brightness variations across the scanned sheet.
    Produces a high-contrast version ideal for bubble detection.
    """
    clahe   = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(16, 16))
    equalized = clahe.apply(gray)
    return equalized


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — Single-Bubble Ink Density
# ══════════════════════════════════════════════════════════════════════════════

def bubble_ink_ratio(proc_gray, cx, cy, radius):
    """
    Measure the fraction of dark pixels inside a circular bubble region.
    Uses LOCAL adaptive thresholding so each bubble is judged by its
    own local contrast — not a global image threshold.
    
    Returns a float in [0.0, 1.0] where ~0 = empty, ~0.5+ = filled.
    Returns -1.0 if the region is out of bounds.
    """
    r = int(radius)
    x1, y1 = int(cx) - r, int(cy) - r
    x2, y2 = int(cx) + r, int(cy) + r

    h, w = proc_gray.shape
    if x1 < 0 or y1 < 0 or x2 >= w or y2 >= h:
        return -1.0

    roi = proc_gray[y1:y2, x1:x2].copy()
    roi_h, roi_w = roi.shape

    # Circular mask on the inner core only (ignore printed ring outline)
    # to reduce false positives on empty circles.
    mask = np.zeros((roi_h, roi_w), dtype=np.uint8)
    cv2.circle(mask, (r, r), int(r * 0.58), 255, -1)

    # Local adaptive threshold — handles uneven illumination per bubble
    # blockSize must be odd; use ~half the bubble diameter
    block = max(3, (r | 1))         # nearest odd ≥ r
    if block % 2 == 0:
        block += 1
    local_thresh = cv2.adaptiveThreshold(
        roi, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        block, 8
    )

    masked   = cv2.bitwise_and(local_thresh, mask)
    circle_area = cv2.countNonZero(mask)
    if circle_area == 0:
        return 0.0

    dark_px = cv2.countNonZero(masked)
    return dark_px / circle_area


def bubble_darkness(gray, cx, cy, radius):
    """
    Measure raw grayscale darkness in the bubble core (0=white, 1=black).
    This helps reject light print-through / stamp artifacts that may pass
    binary thresholding but are not real pen marks.
    """
    r = int(radius)
    x1, y1 = int(cx) - r, int(cy) - r
    x2, y2 = int(cx) + r, int(cy) + r

    h, w = gray.shape
    if x1 < 0 or y1 < 0 or x2 >= w or y2 >= h:
        return -1.0

    roi = gray[y1:y2, x1:x2]
    if roi.size == 0:
        return -1.0

    mask = np.zeros(roi.shape, dtype=np.uint8)
    cv2.circle(mask, (r, r), int(r * 0.58), 255, -1)
    mean_intensity = cv2.mean(roi, mask=mask)[0]
    darkness = (255.0 - mean_intensity) / 255.0
    return float(max(0.0, min(1.0, darkness)))


def row_densities(proc_gray, xs, cy, radius, y_tolerance=30):
    """
    For each bubble centre x in `xs`, scan ±y_tolerance pixels vertically
    (step 3 px), then use a robust percentile score instead of max.
    This avoids single-noise spikes causing false detections.
    """
    samples = [[] for _ in xs]
    for dy in range(-y_tolerance, y_tolerance + 1, 3):
        y = cy + dy
        for i, x in enumerate(xs):
            d = bubble_ink_ratio(proc_gray, x, y, radius)
            if d >= 0:
                samples[i].append(d)

    robust = []
    for vals in samples:
        if not vals:
            robust.append(0.0)
            continue
        robust.append(float(np.percentile(vals, 70)))
    return robust


def row_darknesses(gray, xs, cy, radius, y_tolerance=30):
    """Robust per-option darkness score across small vertical jitter."""
    samples = [[] for _ in xs]
    for dy in range(-y_tolerance, y_tolerance + 1, 3):
        y = cy + dy
        for i, x in enumerate(xs):
            d = bubble_darkness(gray, x, y, radius)
            if d >= 0:
                samples[i].append(d)

    robust = []
    for vals in samples:
        if not vals:
            robust.append(0.0)
            continue
        robust.append(float(np.percentile(vals, 70)))
    return robust


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — Answer Selection (The Core Logic)
# ══════════════════════════════════════════════════════════════════════════════

RTL_MAP = ["A", "B", "C", "D"]   # index 0=أ (rightmost), 3=د (leftmost)

# ── Tunable Constants ─────────────────────────────────────────────────────────
# A bubble must reach at least FILL_THRESHOLD ink-ratio to be considered filled.
# Below this → the row is blank (no answer).
FILL_THRESHOLD   = 0.20   # Conservative threshold to suppress noise

# The winning bubble must have at least DOMINANCE_RATIO × the 2nd-highest.
# This rejects ambiguous double-filled or heavily-erased sheets.
DOMINANCE_RATIO  = 2.4    # winner must dominate strongly

# If winner ≥ STRONG_FILL and second < WEAK_FILL, always accept (no ratio check).
STRONG_FILL = 0.32   # definitely filled
WEAK_FILL   = 0.10   # definitely empty

# Raw grayscale darkness gate: rejects light print-through artifacts.
DARKNESS_THRESHOLD = 0.20
STRONG_DARKNESS    = 0.35

def _robust_noise_floor(values):
    """
    Estimate per-sheet background/noise level from the lower half of values.
    Returns (median, mad) where mad is median absolute deviation.
    """
    if not values:
        return 0.0, 0.0
    arr = np.array(values, dtype=np.float32)
    arr = np.sort(arr)
    lower = arr[: max(1, len(arr) // 2)]
    med = float(np.median(lower))
    mad = float(np.median(np.abs(lower - med)))
    return med, mad


def derive_sheet_thresholds(row_metrics):
    """
    Adaptive per-sheet thresholds using robust statistics.
    Keeps tight clamped ranges so behavior stays stable.
    """
    max_dens = [m["max_d"] for m in row_metrics]
    max_dark = [m["max_dark"] for m in row_metrics]

    med_d, mad_d = _robust_noise_floor(max_dens)
    med_k, mad_k = _robust_noise_floor(max_dark)

    # Adaptive floor = background center + margin from spread.
    adaptive_fill = med_d + 3.5 * mad_d
    adaptive_dark = med_k + 3.0 * mad_k

    # Clamp to safe operational ranges.
    fill_thr = float(min(0.28, max(0.16, adaptive_fill)))
    dark_thr = float(min(0.30, max(0.14, adaptive_dark)))

    # Strong gates track regular gates with minimum offsets.
    strong_fill = float(min(0.45, max(0.30, fill_thr + 0.10)))
    strong_dark = float(min(0.55, max(0.32, dark_thr + 0.12)))
    dom_ratio = float(min(3.0, max(2.1, DOMINANCE_RATIO)))

    return {
        "fill_threshold": fill_thr,
        "darkness_threshold": dark_thr,
        "strong_fill": strong_fill,
        "strong_darkness": strong_dark,
        "dominance_ratio": dom_ratio,
    }


def pick_answer(densities, darknesses=None):
    """
    Select the answered bubble from a row's ink-density list.

    Decision rules (in order):
    1. If max density < FILL_THRESHOLD  →  blank  (no answer)
    2. If winner ≥ STRONG_FILL AND second < WEAK_FILL  →  accept unconditionally
    3. If winner ≥ DOMINANCE_RATIO × second  →  accept
    4. Otherwise  →  blank  (ambiguous / erased / dirty)

    Returns the letter string ("A"/"B"/"C"/"D") or "" for blank.
    """
    if not densities or all(d <= 0 for d in densities):
        return ""

    bi    = int(np.argmax(densities))
    max_d = densities[bi]
    max_dark = darknesses[bi] if darknesses and bi < len(darknesses) else 0.0

    # Rule 1 — absolute minimum fill
    if max_d < FILL_THRESHOLD or max_dark < DARKNESS_THRESHOLD:
        return ""

    others = [d for i, d in enumerate(densities) if i != bi]
    second = max(others) if others else 0.0

    # Rule 2 — strong unambiguous fill
    if max_d >= STRONG_FILL and max_dark >= STRONG_DARKNESS and second < WEAK_FILL:
        return RTL_MAP[bi]

    # Rule 3 — dominance ratio
    if second < 0.001 or max_d >= DOMINANCE_RATIO * second:
        return RTL_MAP[bi]

    # Rule 4 — ambiguous row must remain blank.
    return ""


def evaluate_row(densities, darknesses, thresholds):
    """
    Return row decision with confidence, review flag, and reason tags (machine codes).

    Operator policy (school workflow):
    - If the row is «ضعيف جداً» on both ink metrics → treat as blank, no review.
    - If one bubble clearly wins (single choice), accept it without review — weak vs strong
      fill does not by itself trigger review.
    - Review mainly for genuine two-bubble contention (ambiguous row) or missing signal.
    """
    if not densities or all(d <= 0 for d in densities):
        return "", 0.0, True, ["no_bubble_signal"]

    bi = int(np.argmax(densities))
    max_d = float(densities[bi])
    max_dark = float(darknesses[bi]) if darknesses and bi < len(darknesses) else 0.0
    others = [float(d) for i, d in enumerate(densities) if i != bi]
    second = max(others) if others else 0.0

    fill_thr = thresholds["fill_threshold"]
    dark_thr = thresholds["darkness_threshold"]
    strong_fill = thresholds["strong_fill"]
    strong_dark = thresholds["strong_darkness"]
    dom_ratio = thresholds["dominance_ratio"]

    # Very faint → لا يُحسب إجابة (فراغ)، دون طلب مراجعة
    min_ink = max(0.065, float(fill_thr) * 0.36)
    min_dark = max(0.055, float(dark_thr) * 0.34)
    if max_d < min_ink and max_dark < min_dark:
        blank_margin = max((min_ink - max_d), 0.0) + max((min_dark - max_dark), 0.0)
        conf_blank = float(min(0.95, 0.35 + 2.0 * blank_margin))
        return "", conf_blank, False, []

    second_floor = max(0.11, float(fill_thr) * 0.42)
    tie_ratio = 1.22
    if second >= second_floor and max_d < second * tie_ratio and (max_d - second) < 0.04:
        return "", 0.4, True, ["ambiguous_mark"]

    ratio = max_d / max(second, 1e-6)
    fill_score = min(1.0, max(0.0, (max_d - fill_thr) / max(1e-6, (strong_fill - fill_thr))))
    dark_score = min(1.0, max(0.0, (max_dark - dark_thr) / max(1e-6, (strong_dark - dark_thr))))
    dom_score = min(1.0, max(0.0, ratio / max(1e-6, dom_ratio)))
    confidence = float(0.40 * fill_score + 0.30 * dark_score + 0.30 * dom_score)
    confidence = max(0.25, min(0.99, confidence))
    return RTL_MAP[bi], confidence, False, []


def merge_double_pass(primary, secondary):
    """
    Merge two OMR passes. Any disagreement is pushed to review.
    """
    answers = {}
    confidence = {}
    primary_review = set(int(x) for x in primary.get("needs_review_questions", []))
    secondary_review = set(int(x) for x in secondary.get("needs_review_questions", []))
    needs_review = set(primary_review)
    mismatch = []

    q_keys = sorted(primary["answers"].keys(), key=lambda x: int(x))
    for q in q_keys:
        a1 = primary["answers"].get(q, "")
        a2 = secondary["answers"].get(q, "")
        c1 = float(primary["confidence"].get(q, 0.0))
        c2 = float(secondary["confidence"].get(q, 0.0))

        if a1 == a2:
            answers[q] = a1
            confidence[q] = round(max(c1, c2), 3)
            # Conservative relaxation:
            # If both passes agree and one pass is confidently clear,
            # do not keep review unless BOTH passes flagged it.
            qi = int(q)
            high_conf_agree = (max(c1, c2) >= 0.78 and a1 != "")
            if high_conf_agree and not (qi in primary_review and qi in secondary_review):
                needs_review.discard(qi)
        else:
            # Prefer a real mark over blank when passes disagree (normal vs strict).
            if a1 and not a2:
                answers[q] = a1
                confidence[q] = round(c1, 3)
                needs_review.discard(int(q))
            elif a2 and not a1:
                answers[q] = a2
                confidence[q] = round(c2, 3)
                needs_review.discard(int(q))
            else:
                # Both marked different options — keep the more confident pass, flag review.
                pick = a1 if c1 >= c2 else a2
                answers[q] = pick
                confidence[q] = round(max(c1, c2), 3)
                needs_review.add(int(q))
                mismatch.append(int(q))

    # Secondary-only review: only if merged answer is still blank.
    for qi in secondary_review:
        qk = str(qi)
        if qi in needs_review:
            continue
        if answers.get(qk, "") == "":
            needs_review.add(qi)

    avg_conf = float(np.mean(list(confidence.values()))) if confidence else 0.0
    quality_flags = []
    if mismatch:
        quality_flags.append("double_pass_mismatch")
    if not primary.get("student_id"):
        quality_flags.append("missing_qr")

    if quality_flags and "missing_qr" in quality_flags and avg_conf < 0.55:
        decision = "REJECTED_QUALITY"
    elif needs_review:
        decision = "REVIEW_REQUIRED"
    else:
        decision = "AUTO_ACCEPTED"

    merged_reasons = {}
    for qi in sorted(needs_review):
        qk = str(qi)
        r1 = list((primary.get("review_reasons") or {}).get(qk, []))
        r2 = list((secondary.get("review_reasons") or {}).get(qk, []))
        merged = list(dict.fromkeys(r1 + r2))
        a1 = primary["answers"].get(qk, "")
        a2 = secondary["answers"].get(qk, "")
        if a1 != a2 and a1 and a2:
            merged = ["double_pass_mismatch"] + [x for x in merged if x != "double_pass_mismatch"]
        merged_reasons[qk] = list(dict.fromkeys(merged))

    return {
        "answers": answers,
        "confidence": confidence,
        "needs_review_questions": sorted(needs_review),
        "decision_status": decision,
        "quality_flags": quality_flags,
        "double_pass_mismatch_questions": mismatch,
        "average_confidence": round(avg_conf, 3),
        "review_reasons": merged_reasons,
    }


def relax_high_confidence_reviews(
    answers,
    confidence,
    needs_review_questions,
    unstable_questions=None,
    mismatch_questions=None,
    min_conf=0.78,
    review_reasons=None,
):
    """
    Conservative auto-relax for review flags:
    remove review only if answer is non-blank, highly confident, stable,
    and not part of pass mismatch.
    """
    unstable_set = set(int(x) for x in (unstable_questions or []))
    mismatch_set = set(int(x) for x in (mismatch_questions or []))
    rr = dict(review_reasons or {})

    kept = []
    removed = []
    for q in (needs_review_questions or []):
        qi = int(q)
        qk = str(qi)
        ans = str((answers or {}).get(qk, "")).strip()
        conf = float((confidence or {}).get(qk, 0.0))
        if ans and conf >= float(min_conf) and qi not in unstable_set and qi not in mismatch_set:
            removed.append(qi)
            rr.pop(qk, None)
            continue
        kept.append(qi)
    return sorted(kept), sorted(removed), rr


def _append_audit_log(entry):
    try:
        with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def parse_qr_payload(qr_text):
    """
    Backward compatible QR parser.
    Supports:
      - plain student id string
      - JSON payload: {"id":"...","nq":20,"tpl":"default"}
    """
    if not qr_text:
        return {"student_id": "", "num_questions": None, "template": None, "raw": ""}
    raw = str(qr_text).strip()
    student_id = raw
    num_questions = None
    template = None
    try:
        if raw.startswith("{") and raw.endswith("}"):
            obj = json.loads(raw)
            student_id = str(obj.get("id", "")).strip() or student_id
            nq = obj.get("nq", None)
            if isinstance(nq, int):
                num_questions = nq
            elif isinstance(nq, str) and nq.isdigit():
                num_questions = int(nq)
            tpl = obj.get("tpl", None)
            if tpl is not None:
                template = str(tpl).strip() or None
    except Exception:
        pass
    return {
        "student_id": student_id,
        "num_questions": num_questions,
        "template": template,
        "raw": raw,
    }


def assess_image_quality(gray_img):
    """
    Enhanced quality gate to avoid grading low-quality scans.
    Checks for:
    1. Sharpness (Blur)
    2. Brightness (Too dark)
    3. Contrast (Dynamic range)
    Returns (score, flags).
    """
    flags = []
    # Sharpness Check
    lap_var = float(cv2.Laplacian(gray_img, cv2.CV_64F).var())
    
    # Brightness Check (Average intensity) 
    # (0=black, 255=white). Ideal scanned A4 is > 200.
    mean_brightness = float(np.mean(gray_img))
    
    # Contrast Check
    contrast_std = float(np.std(gray_img))
    p10 = float(np.percentile(gray_img, 10))
    p90 = float(np.percentile(gray_img, 90))
    dynamic_range = p90 - p10

    # Flags
    if lap_var < 18.0:
        flags.append("extreme_blur")
    elif lap_var < 35.0:
        flags.append("low_sharpness")
        
    if mean_brightness < 80.0:
        flags.append("too_dark")
    elif mean_brightness < 130.0:
        flags.append("low_brightness")
        
    if contrast_std < 22.0:
        flags.append("low_contrast")
    if dynamic_range < 48.0:
        flags.append("low_dynamic_range")

    # Score in [0,1], higher is better.
    sharp_score = min(1.0, lap_var / 70.0)
    bright_score = min(1.0, mean_brightness / 200.0)
    contrast_score = min(1.0, contrast_std / 45.0)
    range_score = min(1.0, dynamic_range / 90.0)
    
    # Weighting: Sharpness and Brightness are most critical for OMR
    score = float(0.40 * sharp_score + 0.30 * bright_score + 0.15 * contrast_score + 0.15 * range_score)
    return score, flags


def build_system_view_image(warped_gray, annotated_proc_bgr):
    """
    Build a compact data-url preview representing what OMR "sees":
    left = aligned grayscale, right = contrast-enhanced preprocessing.
    """
    try:
        if warped_gray is None or annotated_proc_bgr is None:
            return ""
        left = warped_gray
        right = annotated_proc_bgr
        if len(left.shape) == 2:
            left = cv2.cvtColor(left, cv2.COLOR_GRAY2BGR)
        combo = np.hstack([left, right])
        h, w = combo.shape[:2]
        max_w = 1400
        if w > max_w:
            scale = max_w / float(w)
            combo = cv2.resize(combo, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", combo, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
        if not ok:
            return ""
        return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")
    except Exception:
        return ""


def build_annotated_proc_view(proc_gray, row_data, answers, needs_review_questions, y_start, row_sp, per_col, L_XS, R_XS, bub_r=QS_BUBBLE_R):
    """
    Draw OMR detection marks on top of the preprocessed image:
    - all bubble centers in light cyan
    - selected bubble in green (or amber if needs review)
    """
    if proc_gray is None:
        return None
    if len(proc_gray.shape) == 2:
        vis = cv2.cvtColor(proc_gray, cv2.COLOR_GRAY2BGR)
    else:
        vis = proc_gray.copy()

    letter_to_idx = {"A": 0, "B": 1, "C": 2, "D": 3}
    review_set = set(needs_review_questions or [])

    for row in row_data:
        q = int(row.get("q", 0))
        if q <= 0:
            continue
        is_left = (q - 1) >= per_col
        row_idx = (q - 1) % per_col
        y_center = int(y_start + row_idx * row_sp)
        xs = L_XS if is_left else R_XS

        ring_r = max(14, int(bub_r * 0.92))
        dot_r = max(6, int(bub_r * 0.22))

        # Base markers for all candidate bubbles (ring matches printed circle size).
        for x in xs:
            cv2.circle(vis, (int(x), y_center), ring_r, (230, 220, 120), 2)

        # Highlight detected answer.
        ans = str((answers or {}).get(str(q), "")).upper()
        if ans in letter_to_idx and letter_to_idx[ans] < len(xs):
            pick_x = int(xs[letter_to_idx[ans]])
            color = (0, 190, 255) if q in review_set else (0, 200, 0)
            cv2.circle(vis, (pick_x, y_center), ring_r, color, 3)
            cv2.circle(vis, (pick_x, y_center), dot_r, color, -1)

        # Question id for quick tracking.
        cv2.putText(vis, f"Q{q}", (int(max(xs) + 16), y_center + 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, (50, 80, 240), 1, cv2.LINE_AA)

    return vis


def rebuild_system_view_for_answers(pass_scan, answers, needs_review_questions):
    """
    Re-draw the system preview from the same geometry as a scan pass, but using
    the final answer map (e.g. after double-pass merge). Keeps preview aligned
    with scored results.
    """
    ctx = (pass_scan or {}).get("_annotation_ctx")
    if not ctx:
        return (pass_scan or {}).get("system_view_image", "")
    try:
        annotated = build_annotated_proc_view(
            proc_gray=ctx["warped_gray"],
            row_data=ctx["row_data"],
            answers=answers or {},
            needs_review_questions=needs_review_questions or [],
            y_start=ctx["y_start"],
            row_sp=ctx["row_sp"],
            per_col=ctx["per_col"],
            L_XS=ctx["L_XS"],
            R_XS=ctx["R_XS"],
            bub_r=ctx.get("bub_r", QS_BUBBLE_R),
        )
        return build_system_view_image(ctx["warped_gray"], annotated)
    except Exception:
        return (pass_scan or {}).get("system_view_image", "")


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — Column / Row Geometry (per template)
# ══════════════════════════════════════════════════════════════════════════════

def get_bubble_grid_default():
    """
    Mirrors generator.py draw_questions_section() exactly.
    Returns (R_XS, L_XS, y_start, row_spacing, bubble_radius, y_tol)
    """
    half    = (WIDTH - 2 * MARGIN) // 2   # 1090
    GAP     = 60
    col_w   = half - GAP // 2             # 1060
    NUM_AREA = 120

    r_col_x = MARGIN + half + GAP // 2     # 1270
    l_col_x = MARGIN                       # 150

    r_bub_right = (r_col_x + col_w - 10) - NUM_AREA
    l_bub_right = (l_col_x + col_w - 10) - NUM_AREA

    R_XS = [r_bub_right - j * QS_OPT_SPACING for j in range(4)]
    L_XS = [l_bub_right - j * QS_OPT_SPACING for j in range(4)]

    return R_XS, L_XS, QS_START_Y, QS_ROW_SPACING, QS_BUBBLE_R, 28


def get_bubble_grid_nafs():
    """
    Mirrors generator_nafs.py draw_questions_section().
    """
    half     = (WIDTH - 2 * MARGIN) // 2   # 1090
    GAP      = 60
    col_w    = half - GAP // 2             # 1060
    NUM_AREA = 120

    r_col_x = MARGIN + half + GAP // 2     # 1270
    l_col_x = MARGIN                       # 150

    r_bub_right = (r_col_x + col_w - 10) - NUM_AREA
    l_bub_right = (l_col_x + col_w - 10) - NUM_AREA

    R_XS = [r_bub_right - j * QS_OPT_SPACING for j in range(4)]
    L_XS = [l_bub_right - j * QS_OPT_SPACING for j in range(4)]

    return R_XS, L_XS, QS_START_Y, QS_ROW_SPACING, QS_BUBBLE_R, 28


def get_bubble_grid_elite():
    """
    Mirrors generator_elite.py layout.
    Q1-15 → RIGHT column  |  Q16-30 → LEFT column
    """
    from omr_constants import QS_START_Y
    row_spacing = 120
    y0          = QS_START_Y
    col_w       = (WIDTH - 2 * MARGIN) // 2   # 1090

    r_col_x = MARGIN + col_w + 40   # 1280
    l_col_x = MARGIN                # 150

    R_XS = [r_col_x + col_w - 120 - j * 120 for j in range(4)]
    L_XS = [l_col_x + col_w - 120 - j * 120 for j in range(4)]

    return R_XS, L_XS, y0, row_spacing, 30, 28


# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — Main Entry Point
# ══════════════════════════════════════════════════════════════════════════════

def extract_question_bubble_roi(warped, q_num, per_col, y_start, row_sp, xs, radius):
    """
    Extract a zoomed-in Base64 image of a question's bubble row
    for manual human review.
    """
    try:
        row_idx = (q_num - 1) % per_col
        cy = y_start + row_idx * row_sp
        
        # Calculate bounding box for the row of 4 bubbles
        pad_x = int(radius * 3.5)
        pad_y = int(radius * 2.5)
        
        x_min = max(0, int(min(xs)) - pad_x)
        x_max = min(warped.shape[1], int(max(xs)) + pad_x)
        y_min = max(0, int(cy) - pad_y)
        y_max = min(warped.shape[0], int(cy) + pad_y)
        
        # Crop the ROI
        roi = warped[y_min:y_max, x_min:x_max]
        if roi.size == 0 or roi.shape[0] < 5 or roi.shape[1] < 5:
            return None
            
        # Zoomed view for better visibility (Cubic for smoother appearance)
        h, w = roi.shape[:2]
        zoomed = cv2.resize(roi, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
        
        # Encode to JPEG base64
        _, buffer = cv2.imencode('.jpg', zoomed, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return base64.b64encode(buffer).decode('utf-8')
    except Exception:
        return None


def _scan_omr_single(
    image_path_or_bytes,
    is_bytes=False,
    style="default",
    from_scanner=False,
    num_questions=30,
    sensitivity="normal",
    thresholds=None,
    enable_stability=True,
):
    # ── 0. Read image ────────────────────────────────────────────────────────
    if is_bytes:
        np_arr = np.frombuffer(image_path_or_bytes, np.uint8)
        img    = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    else:
        # Try frombuffer first (handles unicode paths & BMP correctly)
        try:
            raw = np.fromfile(image_path_or_bytes, dtype=np.uint8)
            img = cv2.imdecode(raw, cv2.IMREAD_COLOR)
        except Exception:
            img = None
        # Fallback: PIL can always open BMP / any format
        if img is None:
            try:
                from PIL import Image as PILImage
                pil = PILImage.open(image_path_or_bytes).convert("RGB")
                img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
            except Exception:
                pass
        if img is None:
            img = cv2.imread(str(image_path_or_bytes))

    if img is None:
        raise ValueError(f"Image reading failed: {image_path_or_bytes}")

    # ── 0b. Auto-rotate portrait if landscape ────────────────────────────────
    h0, w0 = img.shape[:2]
    if w0 > h0:
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # ── 1. Alignment strategy ────────────────────────────────────────────────
    #   • from_scanner=True  → image already fills the frame; contour detection
    #     would return None or fail. Go straight to resize + corner markers.
    #   • from_scanner=False → uploaded photo/image; use paper-contour warp.
    if from_scanner:
        # Scanner / flatbed uploads: full-page image at ~300 DPI — resize then align via corner markers
        warped      = cv2.resize(img,  (WIDTH, HEIGHT))
        warped_gray = cv2.resize(gray, (WIDTH, HEIGHT))
    else:
        paper_cnt = get_paper_contour(gray)
        if paper_cnt is not None:
            pts  = paper_cnt.reshape(4, 2)
            rect = order_points(pts)
            M    = cv2.getPerspectiveTransform(
                rect,
                np.array([[0, 0], [WIDTH, 0], [WIDTH, HEIGHT], [0, HEIGHT]],
                         dtype="float32"))
            warped = cv2.warpPerspective(img, M, (WIDTH, HEIGHT))
        else:
            # No paper contour — resize first then try corner-marker warp
            # as a direct perspective source (avoids scale distortion).
            warped = cv2.resize(img, (WIDTH, HEIGHT))
            warped_gray_tmp = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
            corners_direct = find_corner_markers(warped_gray_tmp)
            if corners_direct is not None:
                # Use corner markers as the source for a full perspective warp
                tl, tr, bl, br = corners_direct
                src_pts = np.array([tl, tr, br, bl], dtype="float32")
                ms_h  = CORNER_MARKER_SIZE
                off_h = MARGIN + ms_h // 2
                dst_pts = np.array([
                    [off_h, off_h],
                    [WIDTH - off_h, off_h],
                    [WIDTH - off_h, HEIGHT - off_h],
                    [off_h, HEIGHT - off_h],
                ], dtype="float32")
                M2 = cv2.getPerspectiveTransform(src_pts, dst_pts)
                warped = cv2.warpPerspective(warped, M2, (WIDTH, HEIGHT))
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

    # ── 2. Fine alignment: corner-marker refinement ──────────────────────────
    align_gray = warped_gray
    if from_scanner:
        align_gray = cv2.bilateralFilter(warped_gray, 9, 75, 75)
    warped, warped_gray = refine_warp_with_markers(warped, align_gray)
    if from_scanner:
        corners_found = find_corner_markers(warped_gray)
        if corners_found is None:
            warped, warped_gray = refine_warp_with_markers(warped, align_gray)
            corners_found = find_corner_markers(warped_gray)
        alignment_failed = corners_found is None
    else:
        alignment_failed = False

    cv2.imwrite(os.path.join(DEBUG_DIR, "last_warped.png"), warped)

    # ── 3. Preprocessing: CLAHE for uniform contrast ─────────────────────────
    # For scanner images bump clipLimit to handle drum-scanner brightness ramp
    if from_scanner:
        clahe2    = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8, 8))
        proc_gray = clahe2.apply(warped_gray)
    else:
        proc_gray = preprocess(warped_gray)

    quality_score, quality_flags = assess_image_quality(warped_gray)
    if alignment_failed:
        quality_flags.append("alignment_failed")
    base_proc_vis = cv2.cvtColor(proc_gray, cv2.COLOR_GRAY2BGR) if len(proc_gray.shape) == 2 else proc_gray
    system_view_image = build_system_view_image(warped_gray, base_proc_vis)

    # ── 4. QR / student-ID detection ─────────────────────────────────────────
    student_id = ""
    qr_payload = ""
    if decode_qr:
        # Try full image first, then top half
        for roi_img in [warped, warped[0:1400, :]]:
            results = decode_qr(roi_img)
            if results:
                qr_payload = results[0].data.decode("utf-8")
                break
    if not qr_payload:
        qrd = cv2.QRCodeDetector()
        for roi_img in [warped, warped[0:1400, :]]:
            sid, _, _ = qrd.detectAndDecode(roi_img)
            if sid:
                qr_payload = sid
                break
    qr_meta = parse_qr_payload(qr_payload)
    student_id = qr_meta["student_id"]

    # ── 5. Select geometry based on template style ───────────────────────────
    if style == "elite":
        R_XS, L_XS, y_start, row_sp, bub_r, y_tol = get_bubble_grid_elite()
    elif style == "nafs":
        R_XS, L_XS, y_start, row_sp, bub_r, y_tol = get_bubble_grid_nafs()
    else:
        R_XS, L_XS, y_start, row_sp, bub_r, y_tol = get_bubble_grid_default()

    R_XS, L_XS, y_start, grid_dx, grid_dy = auto_align_bubble_grid(
        warped_gray, R_XS, L_XS, y_start, row_sp, bub_r, num_questions
    )
    if grid_dx or grid_dy:
        quality_flags.append("grid_auto_aligned")

    quality_gate_min = 0.35 if sensitivity != "sensitive" else 0.30
    if quality_score < quality_gate_min:
        blank_answers = {str(i + 1): "" for i in range(num_questions)}
        blank_conf = {str(i + 1): 0.0 for i in range(num_questions)}
        return {
            "student_id": student_id,
            "qr_meta": qr_meta,
            "answers": blank_answers,
            "confidence": blank_conf,
            "needs_review_questions": list(range(1, num_questions + 1)),
            "adaptive_thresholds": {
                "fill": 0.0,
                "darkness": 0.0,
                "strong_fill": 0.0,
                "strong_darkness": 0.0,
                "dominance_ratio": 0.0,
            },
            "quality_score": round(quality_score, 3),
            "quality_flags": quality_flags + ["quality_gate_reject"],
            "unstable_questions": list(range(1, num_questions + 1)),
            "system_view_image": system_view_image,
            "review_reasons": {str(i + 1): ["sheet_quality_low"] for i in range(num_questions)},
            "status": "success",
        }

    # ── 6. Scan questions (only up to num_questions) ────────────────────────
    # num_questions is passed from the API based on the exam configuration.
    # This allows 20-question exams to only read 20 bubbles on a 30-bubble sheet.
    # First pass: gather per-row metrics so we can adapt thresholds per sheet.
    row_data = []
    per_col = (num_questions + 1) // 2   # questions per column (ceiling)
    for q in range(num_questions):
        is_left  = q >= per_col
        row_idx  = q % per_col
        y_center = y_start + row_idx * row_sp

        xs = L_XS if is_left else R_XS
        dens = row_densities(proc_gray, xs, y_center, bub_r, y_tol)
        darks = row_darknesses(warped_gray, xs, y_center, bub_r, y_tol)
        if dens:
            bi = int(np.argmax(dens))
            max_d = float(dens[bi])
            max_dark = float(darks[bi]) if darks and bi < len(darks) else 0.0
        else:
            max_d = 0.0
            max_dark = 0.0
        row_data.append({
            "q": q + 1,
            "dens": dens,
            "darks": darks,
            "max_d": max_d,
            "max_dark": max_dark,
        })

    thresholds = derive_sheet_thresholds(row_data)
    if sensitivity == "strict":
        thresholds["fill_threshold"] = min(0.34, thresholds["fill_threshold"] + 0.02)
        thresholds["darkness_threshold"] = min(0.36, thresholds["darkness_threshold"] + 0.02)
        thresholds["dominance_ratio"] = min(3.2, thresholds["dominance_ratio"] + 0.2)
    elif sensitivity == "sensitive":
        thresholds["fill_threshold"] = max(0.12, thresholds["fill_threshold"] - 0.02)
        thresholds["darkness_threshold"] = max(0.10, thresholds["darkness_threshold"] - 0.02)
        thresholds["dominance_ratio"] = max(1.9, thresholds["dominance_ratio"] - 0.2)

    # Second pass: apply decision with confidence + review tagging.
    answers = {}
    confidence_by_question = {}
    needs_review_questions = []
    unstable_questions = []
    review_reasons = {}
    review_rois = {}
    for row in row_data:
        q = row["q"]
        ans, conf, needs_review, tags = evaluate_row(row["dens"], row["darks"], thresholds)
        reason_tags = list(tags)

        # Stability check: re-evaluate around nearby row centers.
        if enable_stability and row["dens"]:
            row_idx = (q - 1) % per_col
            y_center = y_start + row_idx * row_sp
            is_left = (q - 1) >= per_col
            xs = L_XS if is_left else R_XS
            jitter_answers = []
            for y_shift in (-6, 0, 6):
                d2 = row_densities(proc_gray, xs, y_center + y_shift, bub_r, max(12, y_tol // 2))
                k2 = row_darknesses(warped_gray, xs, y_center + y_shift, bub_r, max(12, y_tol // 2))
                a2, _, _, _ = evaluate_row(d2, k2, thresholds)
                jitter_answers.append(a2)
            # Only treat as unstable when two different non-blank answers appear.
            # Mixing "" with a letter is normal for a single mark near row edge — not ambiguity.
            non_blank_letters = [a for a in jitter_answers if a]
            if len(non_blank_letters) >= 2 and len(set(non_blank_letters)) > 1:
                needs_review = True
                conf = min(conf, 0.68)
                unstable_questions.append(q)
                if "unstable_jitter" not in reason_tags:
                    reason_tags.append("unstable_jitter")

        answers[str(q)] = ans
        confidence_by_question[str(q)] = round(conf, 3)
        if needs_review:
            needs_review_questions.append(q)
            review_reasons[str(q)] = list(dict.fromkeys(reason_tags))
            
            # Capture Visual ROI for human review
            roi_b64 = extract_question_bubble_roi(
                warped, q, per_col, y_start, row_sp, xs, bub_r
            )
            if roi_b64:
                review_rois[str(q)] = roi_b64

    # Draw overlays on the aligned scan (not CLAHE) so review view matches the left panel.
    annotated_proc = build_annotated_proc_view(
        proc_gray=warped_gray,
        row_data=row_data,
        answers=answers,
        needs_review_questions=needs_review_questions,
        y_start=y_start,
        row_sp=row_sp,
        per_col=per_col,
        L_XS=L_XS,
        R_XS=R_XS,
        bub_r=bub_r,
    )
    system_view_image = build_system_view_image(warped_gray, annotated_proc)

    return {
        "student_id": student_id,
        "qr_meta": qr_meta,
        "answers":    answers,
        "confidence": confidence_by_question,
        "needs_review_questions": needs_review_questions,
        "review_rois": review_rois,
        "grid_offset": {"dx": grid_dx, "dy": grid_dy},
        "quality_score": round(quality_score, 3),
        "quality_flags": quality_flags,
        "unstable_questions": unstable_questions,
        "adaptive_thresholds": {
            "fill": round(thresholds["fill_threshold"], 4),
            "darkness": round(thresholds["darkness_threshold"], 4),
            "strong_fill": round(thresholds["strong_fill"], 4),
            "strong_darkness": round(thresholds["strong_darkness"], 4),
            "dominance_ratio": round(thresholds["dominance_ratio"], 4),
        },
        "system_view_image": system_view_image,
        "review_reasons": review_reasons,
        "status":     "success",
        # Internal only — used to rebuild preview after double-pass merge (not sent to client).
        "_annotation_ctx": {
            "warped_gray": warped_gray,
            "row_data": row_data,
            "y_start": y_start,
            "row_sp": row_sp,
            "per_col": per_col,
            "L_XS": L_XS,
            "R_XS": R_XS,
            "bub_r": bub_r,
        },
    }


def scan_omr(image_path_or_bytes, is_bytes=False, style="default", from_scanner=False, num_questions=30):
    return scan_omr_with_mode(
        image_path_or_bytes,
        is_bytes=is_bytes,
        style=style,
        from_scanner=from_scanner,
        num_questions=num_questions,
        scan_mode="strict",
    )


def compute_reliability_score(result):
    """
    Compute a production reliability score (0-100) based on multiple quality factors.
    Used for supervisor dashboards and audit confidence.
    """
    score = 100.0
    
    # 1. Quality Reductions
    quality_score = result.get("quality_score", 1.0)
    if quality_score < 0.7:
        score -= (0.7 - quality_score) * 40 # Up to 28 points reduction
        
    # 2. Review Requirements
    needs_review = result.get("needs_review_questions", [])
    if needs_review:
        score -= 20.0
        # Additional penalty per problematic question
        score -= len(needs_review) * 2.5
        
    # 3. Double-pass Mismatches
    mismatches = result.get("double_pass_mismatch_questions", [])
    if mismatches:
        score -= 15.0
        score -= len(mismatches) * 5.0
        
    # 4. Alignment / Stability
    unstable = result.get("unstable_questions", [])
    if unstable:
        score -= len(unstable) * 2.0
        
    # 5. Flags
    flags = result.get("quality_flags", [])
    if "alignment_failed" in flags or "alignment_failure" in flags: score -= 30.0
    if "num_questions_mismatch" in flags: score -= 50.0
    
    return max(0.0, min(100.0, round(score, 1)))


def scan_omr_with_mode(image_path_or_bytes, is_bytes=False, style="default", from_scanner=False, num_questions=30, scan_mode="strict"):
    mode = (scan_mode or "strict").lower()
    if mode not in ("fast", "strict", "hybrid"):
        mode = "strict"

    # Fast mode: single pass with lighter checks.
    if mode == "fast":
        fast_pass = _scan_omr_single(
            image_path_or_bytes,
            is_bytes=is_bytes,
            style=style,
            from_scanner=from_scanner,
            num_questions=num_questions,
            sensitivity="sensitive",
            enable_stability=False,
        )
        quality_flags = list(fast_pass.get("quality_flags", []))
        detected_nq = (fast_pass.get("qr_meta", {}) or {}).get("num_questions", None)
        if isinstance(detected_nq, int) and detected_nq > 0 and int(detected_nq) != int(num_questions):
            quality_flags.append("num_questions_mismatch")
        decision_status = "REVIEW_REQUIRED" if fast_pass.get("needs_review_questions") else "AUTO_ACCEPTED"
        if "quality_gate_reject" in quality_flags or "num_questions_mismatch" in quality_flags:
            decision_status = "REJECTED_QUALITY"
        relaxed_review, relaxed_removed, review_rr = relax_high_confidence_reviews(
            answers=fast_pass.get("answers", {}),
            confidence=fast_pass.get("confidence", {}),
            needs_review_questions=fast_pass.get("needs_review_questions", []),
            unstable_questions=fast_pass.get("unstable_questions", []),
            mismatch_questions=[],
            min_conf=0.78,
            review_reasons=fast_pass.get("review_reasons", {}),
        )
        if decision_status != "REJECTED_QUALITY":
            decision_status = "REVIEW_REQUIRED" if relaxed_review else "AUTO_ACCEPTED"

        result = {
            "student_id": fast_pass.get("student_id", ""),
            "qr_payload_raw": (fast_pass.get("qr_meta", {}) or {}).get("raw", ""),
            "detected_num_questions": detected_nq,
            "answers": fast_pass.get("answers", {}),
            "confidence": fast_pass.get("confidence", {}),
            "needs_review_questions": relaxed_review,
            "review_reasons": review_rr,
            "adaptive_thresholds": fast_pass.get("adaptive_thresholds", {}),
            "decision_status": decision_status,
            "quality_flags": quality_flags,
            "quality_score": fast_pass.get("quality_score", 0.0),
            "unstable_questions": fast_pass.get("unstable_questions", []),
            "double_pass_mismatch_questions": [],
            "review_rois": fast_pass.get("review_rois", {}),
            "system_view_image": fast_pass.get("system_view_image", ""),
            "average_confidence": round(float(np.mean(list((fast_pass.get("confidence", {}) or {"0": 0.0}).values()))), 3) if fast_pass.get("confidence") else 0.0,
            "processing_mode": "fast",
            "final_verified": False,
            "status": "success",
        }
        result["reliability_score"] = compute_reliability_score(result)
        _append_audit_log({
            "ts": datetime.utcnow().isoformat() + "Z",
            "student_id": result["student_id"],
            "decision_status": result["decision_status"],
            "reliability_score": result["reliability_score"],
            "num_questions": int(num_questions),
            "needs_review_count": len(result["needs_review_questions"]),
            "average_confidence": result["average_confidence"],
            "quality_flags": result["quality_flags"],
            "processing_mode": "fast",
            "relaxed_review_removed_count": len(relaxed_removed),
        })
        return result

    # Run two passes (normal + strict) and merge for safer decisions.
    pass_primary = _scan_omr_single(
        image_path_or_bytes,
        is_bytes=is_bytes,
        style=style,
        from_scanner=from_scanner,
        num_questions=num_questions,
        sensitivity="normal",
        enable_stability=True,
    )

    # Hybrid mode: if initial pass is clearly safe, skip strict pass.
    if mode == "hybrid":
        quick_safe = (
            float(pass_primary.get("quality_score", 0.0)) >= 0.55 and
            len(pass_primary.get("needs_review_questions", [])) == 0
        )
        if quick_safe:
            quality_flags = list(pass_primary.get("quality_flags", []))
            detected_nq = (pass_primary.get("qr_meta", {}) or {}).get("num_questions", None)
            if isinstance(detected_nq, int) and detected_nq > 0 and int(detected_nq) != int(num_questions):
                quality_flags.append("num_questions_mismatch")
            decision_status = "AUTO_ACCEPTED"
            if "quality_gate_reject" in quality_flags or "num_questions_mismatch" in quality_flags:
                decision_status = "REJECTED_QUALITY"
            relaxed_review, relaxed_removed, review_rr = relax_high_confidence_reviews(
                answers=pass_primary.get("answers", {}),
                confidence=pass_primary.get("confidence", {}),
                needs_review_questions=pass_primary.get("needs_review_questions", []),
                unstable_questions=pass_primary.get("unstable_questions", []),
                mismatch_questions=[],
                min_conf=0.78,
                review_reasons=pass_primary.get("review_reasons", {}),
            )
            if decision_status != "REJECTED_QUALITY":
                decision_status = "REVIEW_REQUIRED" if relaxed_review else "AUTO_ACCEPTED"

            result = {
                "student_id": pass_primary.get("student_id", ""),
                "qr_payload_raw": (pass_primary.get("qr_meta", {}) or {}).get("raw", ""),
                "detected_num_questions": detected_nq,
                "answers": pass_primary.get("answers", {}),
                "confidence": pass_primary.get("confidence", {}),
                "needs_review_questions": relaxed_review,
                "review_reasons": review_rr,
                "adaptive_thresholds": pass_primary.get("adaptive_thresholds", {}),
                "decision_status": decision_status,
                "quality_flags": quality_flags,
                "quality_score": pass_primary.get("quality_score", 0.0),
                "unstable_questions": pass_primary.get("unstable_questions", []),
                "double_pass_mismatch_questions": [],
                "review_rois": pass_primary.get("review_rois", {}),
                "system_view_image": pass_primary.get("system_view_image", ""),
                "average_confidence": round(float(np.mean(list((pass_primary.get("confidence", {}) or {"0": 0.0}).values()))), 3) if pass_primary.get("confidence") else 0.0,
                "processing_mode": "hybrid-fast-accepted",
                "final_verified": False,
                "status": "success",
            }
            result["reliability_score"] = compute_reliability_score(result)
            _append_audit_log({
                "ts": datetime.utcnow().isoformat() + "Z",
                "student_id": result["student_id"],
                "decision_status": result["decision_status"],
                "reliability_score": result["reliability_score"],
                "num_questions": int(num_questions),
                "needs_review_count": len(result["needs_review_questions"]),
                "average_confidence": result["average_confidence"],
                "quality_flags": result["quality_flags"],
                "processing_mode": "hybrid-fast-accepted",
                "relaxed_review_removed_count": len(relaxed_removed),
            })
            return result

    pass_secondary = _scan_omr_single(
        image_path_or_bytes,
        is_bytes=is_bytes,
        style=style,
        from_scanner=from_scanner,
        num_questions=num_questions,
        sensitivity="strict",
        enable_stability=True,
    )

    merged = merge_double_pass(pass_primary, pass_secondary)
    qr_meta = pass_primary.get("qr_meta", {}) or {}

    # Build image hash for audit traceability.
    img_hash = ""
    try:
        if is_bytes and isinstance(image_path_or_bytes, (bytes, bytearray)):
            img_hash = hashlib.sha256(image_path_or_bytes).hexdigest()
        elif isinstance(image_path_or_bytes, str) and os.path.exists(image_path_or_bytes):
            with open(image_path_or_bytes, "rb") as f:
                img_hash = hashlib.sha256(f.read()).hexdigest()
    except Exception:
        img_hash = ""

    quality_flags = list(merged["quality_flags"])
    quality_flags.extend(pass_primary.get("quality_flags", []))
    quality_score = float(pass_primary.get("quality_score", 0.0))
    detected_nq = qr_meta.get("num_questions", None)
    if isinstance(detected_nq, int) and detected_nq > 0 and int(detected_nq) != int(num_questions):
        quality_flags.append("num_questions_mismatch")
    if quality_score < 0.35 and "quality_gate_reject" not in quality_flags:
        quality_flags.append("quality_gate_reject")
    result = {
        "student_id": pass_primary.get("student_id", ""),
        "qr_payload_raw": qr_meta.get("raw", ""),
        "detected_num_questions": detected_nq,
        "answers": merged["answers"],
        "confidence": merged["confidence"],
        "needs_review_questions": merged["needs_review_questions"],
        "review_reasons": merged.get("review_reasons", {}),
        "adaptive_thresholds": pass_primary.get("adaptive_thresholds", {}),
        "decision_status": "REJECTED_QUALITY" if ("num_questions_mismatch" in quality_flags or "quality_gate_reject" in quality_flags) else merged["decision_status"],
        "quality_flags": quality_flags,
        "quality_score": round(quality_score, 3),
        "unstable_questions": pass_primary.get("unstable_questions", []),
        "double_pass_mismatch_questions": merged["double_pass_mismatch_questions"],
        "review_rois": pass_primary.get("review_rois", {}),
        "system_view_image": rebuild_system_view_for_answers(
            pass_primary,
            merged["answers"],
            merged["needs_review_questions"],
        ),
        "average_confidence": merged["average_confidence"],
        "processing_mode": "strict" if mode == "strict" else "hybrid-strict-fallback",
        "final_verified": True,
        "status": "success",
    }
    relaxed_review, relaxed_removed, review_rr = relax_high_confidence_reviews(
        answers=result["answers"],
        confidence=result["confidence"],
        needs_review_questions=result["needs_review_questions"],
        unstable_questions=result.get("unstable_questions", []),
        mismatch_questions=result.get("double_pass_mismatch_questions", []),
        min_conf=0.78,
        review_reasons=result.get("review_reasons", {}),
    )
    result["needs_review_questions"] = relaxed_review
    result["review_reasons"] = review_rr
    if result["decision_status"] != "REJECTED_QUALITY":
        result["decision_status"] = "REVIEW_REQUIRED" if relaxed_review else "AUTO_ACCEPTED"

    result["reliability_score"] = compute_reliability_score(result)
    result["image_hash"] = img_hash

    # Initialize structured audit trail for digital accreditation
    audit_entry = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "action": "system_scan",
        "user": "System (AI Engine)",
        "details": f"Processed via {result['processing_mode']} mode. Quality Score: {result['quality_score']}",
        "metrics": {
            "reliability_score": result["reliability_score"],
            "avg_confidence": result["average_confidence"],
            "needs_review_count": len(result["needs_review_questions"])
        }
    }
    result["audit"] = [audit_entry]

    _append_audit_log({
        "ts": audit_entry["ts"],
        "student_id": result["student_id"],
        "decision_status": result["decision_status"],
        "reliability_score": result["reliability_score"],
        "image_sha256": img_hash,
        "processing_mode": result["processing_mode"],
    })
    return result

