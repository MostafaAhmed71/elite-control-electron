import cv2
import generator
import scanner
import json
from omr_constants import *

def test_full_flow():
    test_student = {
        "id": "ST-9999", 
        "name": "ياسين محمد علي",
        "class": "ثالث ثانوي - علمي",
        "subject": "الفيزياء الحديثة",
        "date": "2024-05-15"
    }
    
    # 1. Generate
    print("Generating professional sheet...")
    img = generator.generate_personalized_sheet(test_student, filename="verify_upgrade.png")
    
    # 2. Shade Answers (Q1:A, Q2:B, Q3:C, Q4:D)
    print("Shading answers...")
    import numpy as np
    from PIL import Image as PILImage
    # Convert PIL Image to OpenCV numpy array
    img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    
    col_width = (WIDTH - 2 * MARGIN) // 2
    for i, opt_idx in enumerate([0, 1, 2, 3]): 
        y = QS_ROW0_CENTER_Y + i * QS_ROW_SPACING
        x_base = MARGIN + 200  # First column
        opt_x = x_base + opt_idx * QS_OPT_SPACING
        cv2.circle(img_cv, (int(opt_x), int(y)), 35, (0, 0, 0), -1)
    
    cv2.imwrite("verify_upgrade_shaded.png", img_cv)
    
    # 3. Scan
    print("Scanning...")
    result = scanner.scan_omr("verify_upgrade_shaded.png")
    
    print("--- Scan Results ---")
    print(json.dumps(result, indent=4, ensure_ascii=False))
    
    # Assertions
    assert result["student_id"] == "ST-9999", f"ID mismatch: {result['student_id']}"
    assert result["answers"]["1"] == "A", f"Q1 mismatch: {result['answers']['1']}"
    assert result["answers"]["4"] == "D", f"Q4 mismatch: {result['answers']['4']}"
    print("Verification SUCCESS!")

if __name__ == "__main__":
    test_full_flow()
