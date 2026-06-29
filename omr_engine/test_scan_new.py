"""
Test the new auto-detect scanner on the last warped image.
"""
import cv2
import numpy as np
import sys
sys.path.insert(0, '.')
import scanner

result = scanner.scan_omr("debug_scans/last_warped.png", is_bytes=False, style="default")
print("Student ID:", result['student_id'])
print("Perfect align:", result['perfect_align'])
print("\nAnswers:")
for q in range(1, 21):
    ans = result['answers'].get(str(q), '?')
    print(f"  Q{q:2d}: {ans if ans else '(blank)'}")
