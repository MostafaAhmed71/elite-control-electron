import re
import os

with open('generator.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Change S_EXAM text
content = re.sub(
    r'(S_EXAM\s*=\s*)".*?"',
    r'\1"الاختبار المحاكي لختبار نافس 2026 (اختبار مجمع)"',
    content
)

# 2. Add larger fonts
content = re.sub(
    r'FONT_XS = FONT_SM = FONT_MD = FONT_MD_B = None',
    r'FONT_XS = FONT_SM = FONT_MD = FONT_MD_B = FONT_LG = FONT_LABEL = None',
    content
)
font_block = """try:
    FONT_XS   = ImageFont.truetype(FONT_PATH, 25)
    FONT_SM   = ImageFont.truetype(FONT_PATH, 35)
    FONT_MD   = ImageFont.truetype(FONT_PATH, 55)
    FONT_MD_B = ImageFont.truetype("C:\\\\Windows\\\\Fonts\\\\arialbd.ttf", 60)
except:
    FONT_XS = FONT_SM = FONT_MD = FONT_MD_B = None"""

new_font_block = """try:
    FONT_XS   = ImageFont.truetype(FONT_PATH, 25)
    FONT_SM   = ImageFont.truetype(FONT_PATH, 35)
    FONT_MD   = ImageFont.truetype(FONT_PATH, 55)
    FONT_MD_B = ImageFont.truetype("C:\\\\Windows\\\\Fonts\\\\arialbd.ttf", 60)
    FONT_LG   = ImageFont.truetype(FONT_PATH, 65)      # Larger font
    FONT_LABEL= ImageFont.truetype(FONT_PATH, 42)      # Larger label font
except:
    FONT_XS = FONT_SM = FONT_MD = FONT_MD_B = FONT_LG = FONT_LABEL = None"""

content = content.replace(font_block, new_font_block)

# 3. Change "Subject" to "Day" in arabic S_SUBJ_LBL
content = re.sub(
    r'(S_SUBJ_LBL\s*=\s*)".*?"',
    r'\1"اليوم:"',
    content
)

# 4. Modify student info rows logic to use larger text
content = content.replace('def rt(label, box_right, y_top, font=FONT_SM):', 'def rt(label, box_right, y_top, font=FONT_LABEL):')

content = content.replace('font=FONT_MD)', 'font=FONT_LG)')
content = content.replace('font=FONT_MD,', 'font=FONT_LG,')

lines = content.split('\n')
for i, line in enumerate(lines):
    if 'cv  = ar(' in line or ('cv ' in line and 'FONT_SM' in lines[i+1]):
        lines[i+1] = lines[i+1].replace('FONT_SM', 'FONT_MD')
    if 'sv  = ar(' in line or ('sv ' in line and 'FONT_SM' in lines[i+1]):
        lines[i+1] = lines[i+1].replace('FONT_SM', 'FONT_MD')
    if 'seatv = ar(' in line or ('seatv ' in line and 'FONT_SM' in lines[i+1]):
        lines[i+1] = lines[i+1].replace('FONT_SM', 'FONT_MD')
    if 'commv = ar(' in line or ('commv ' in line and 'FONT_SM' in lines[i+1]):
        lines[i+1] = lines[i+1].replace('FONT_SM', 'FONT_MD')
    if 'dv  = ar(' in line or ('dv ' in line and 'FONT_SM' in lines[i+1]):
        lines[i+1] = lines[i+1].replace('FONT_SM', 'FONT_MD')
        
content = '\n'.join(lines)

with open('generator_nafs.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Generated generator_nafs.py successfully")
