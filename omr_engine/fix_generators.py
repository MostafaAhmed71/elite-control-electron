import os

files_to_fix = [
    r"E:\control elite\control\control\omr_engine\generator.py",
    r"E:\control elite\control\control\omr_engine\generator_elite.py",
    r"E:\control elite\control\control\omr_engine\generator_custom.py",
    r"E:\control elite\control\control\omr_engine\generator_nafs.py"
]

bad_str = 'img.save(buf, format=" JPEG\\, quality=95); buf.name = \\sheet.jpg\\'
good_str = 'img.save(buf, format="JPEG", quality=95)\n        buf.name = "sheet.jpg"'

bad_str2 = 'img.save(buf, format=" JPEG", quality=95); buf.name = "sheet.jpg"'
good_str2 = 'img.save(buf, format="JPEG", quality=95)\n        buf.name = "sheet.jpg"'

for fpath in files_to_fix:
    if not os.path.exists(fpath):
        continue
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()
    
    if bad_str in content:
        content = content.replace(bad_str, good_str)
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed bad_str in {os.path.basename(fpath)}")
        
    if bad_str2 in content:
        content = content.replace(bad_str2, good_str2)
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed bad_str2 in {os.path.basename(fpath)}")
        
    # Also fix if there's any remaining bad string literals that PowerShell injected
    import re
    # catch anything that looks like: img.save(buf, format=" JPEG\, quality=95); buf.name = \sheet.jpg\
    content = re.sub(r'img\.save\(buf, format=" JPEG\\, quality=95\); buf\.name = \\sheet\.jpg\\', good_str, content)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(content)
