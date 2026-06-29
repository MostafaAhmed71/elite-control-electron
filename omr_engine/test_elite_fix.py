import sys
import os
# Add current dir to path
sys.path.append(os.getcwd())
from scanner import scan_omr

img_path = "_الأول_المتوسط_قسم_عام_متوسطة_نخب_منتظم_page-0001.jpg"
if os.path.exists(img_path):
    print(f"---Testing scan on {img_path}---")
    result = scan_omr(img_path, style="elite")
    print(f"Student ID detected: {result['student_id']}")
    print(f"Alignment status: {'Perfect' if result['perfect_align'] else 'Failed'}")
    print("Answers detected:")
    for q, a in sorted(result['answers'].items(), key=lambda x: int(x[0])):
        if int(q) <= 10:
            print(f"Q{q}: {a}")
else:
    print("Test image not found.")
