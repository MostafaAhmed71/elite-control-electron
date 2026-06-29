import os
import sys

# Add current dir to path
sys.path.append(os.getcwd())

from scanner import scan_omr_with_mode, compute_reliability_score

print("Testing reliability score logic...")

mock_result = {
    "quality_score": 0.8,
    "needs_review_questions": [],
    "double_pass_mismatch_questions": [],
    "quality_flags": []
}

score = compute_reliability_score(mock_result)
print(f"Perfect scan score: {score}")

blurry_result = {
    "quality_score": 0.5,
    "needs_review_questions": [1, 2],
    "double_pass_mismatch_questions": [],
    "quality_flags": ["low_sharpness"]
}

score2 = compute_reliability_score(blurry_result)
print(f"Blurry + 2 issues score: {score2}")

# Test real function (with elite_template.png existing in dir)
try:
    if os.path.exists("elite_template.png"):
        res = scan_omr_with_mode("elite_template.png", num_questions=30, scan_mode="hybrid")
        print(f"Real scan reliability: {res.get('reliability_score')}")
except Exception as e:
    print(f"Error during scan: {e}")
