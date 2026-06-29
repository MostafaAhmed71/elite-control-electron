import os
import re

files_to_fix = [
    r"E:\control elite\control\control\omr_engine\generator.py",
    r"E:\control elite\control\control\omr_engine\generator_elite.py",
    r"E:\control elite\control\control\omr_engine\generator_custom.py",
    r"E:\control elite\control\control\omr_engine\generator_nafs.py"
]

for fpath in files_to_fix:
    if not os.path.exists(fpath):
        continue
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Replace anything between img.save(buf, format= and buf.seek(0)
    # This handles any messed up formatting by PowerShell
    pattern = r'img\.save\(buf,\s*format=.*?\s*buf\.seek\(0\)'
    replacement = 'img.save(buf, format="JPEG", quality=95)\n        buf.name = "sheet.jpg"\n        buf.seek(0)'
    
    new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    
    if new_content != content:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Fixed {os.path.basename(fpath)}")
