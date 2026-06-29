import scanner
import json

file_path = r"E:\control\omr_engine\temp_sheets\sheet_1.png"

try:
    print(f"Scanning {file_path}...")
    result = scanner.scan_omr(file_path)
    print("--- Scan Results ---")
    print(json.dumps(result, indent=4, ensure_ascii=False))
except Exception as e:
    print(f"Error during scan: {e}")
