import os
import sys

# Add current dir to path
sys.path.append(os.getcwd())

from scanner import scan_omr_with_mode, compute_reliability_score

print("Testing official audit trail logic...")

# Test real function (with elite_template.png existing in dir)
try:
    if os.path.exists("elite_template.png"):
        res = scan_omr_with_mode("elite_template.png", num_questions=30, scan_mode="hybrid")
        print(f"Scan Reliability: {res.get('reliability_score')}")
        print(f"Image Hash: {res.get('image_hash')}")
        
        audit = res.get('audit', [])
        print(f"Audit Trail Length: {len(audit)}")
        if audit:
            print(f"First Entry Action: {audit[0].get('action')}")
            print(f"First Entry Details: {audit[0].get('details')}")
            print(f"Digital integrity check: {'PASS' if res.get('image_hash') else 'FAIL'}")
        else:
            print("FAILED: No audit trail found.")
except Exception as e:
    print(f"Error during scan: {e}")
