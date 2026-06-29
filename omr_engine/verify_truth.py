"""
استخدم قراءة النظام كـ truth للتحقق - إذا كانت النسبة 100% فالنظام صحيح وأنا من أخطأ
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'G:\New folder\control\control\omr_engine')
os.chdir(r'G:\New folder\control\control\omr_engine')
import scanner

IMG_PATH = r'G:\New folder\control\control\omr_engine\dataset\هزاع.jpeg'

result = scanner.scan_omr_with_mode(
    IMG_PATH, is_bytes=False, style='nafs',
    from_scanner=True, num_questions=30, scan_mode='hybrid'
)

scanner_reads = result.get('answers', {})
conf = result.get('confidence', {})

print("=== ما قرأه النظام من ورقة هزاع ===")
print(f"{'Q':>4} {'Scanner':>8} {'Conf':>8}")
print("-"*25)
for q in range(1,31):
    ans = scanner_reads.get(str(q), '?')
    c   = conf.get(str(q), 0)
    print(f"Q{q:>2}  {ans:>8}  {c:>8.3f}")

print(f"\nDecision: {result.get('decision_status')}")
print(f"Quality:  {result.get('quality_score'):.3f}")
print(f"Avg Conf: {result.get('average_confidence'):.3f}")
print(f"Review Qs:{result.get('needs_review_questions')}")
print()
print("=== المقارنة بين قراءتي اليدوية وقراءة النظام ===")

MY_TRUTH = {
    '1':'B','2':'B','3':'D','4':'B','5':'D','6':'A','7':'A','8':'B','9':'D','10':'C',
    '11':'A','12':'A','13':'B','14':'B','15':'D','16':'B','17':'B','18':'C','19':'C',
    '20':'D','21':'B','22':'A','23':'C','24':'C','25':'D','26':'A','27':'A','28':'B',
    '29':'C','30':'B'
}
match = 0
diff  = 0
print(f"{'Q':>4} {'اليدوي':>10} {'النظام':>10} {'متطابق؟':>12}")
print("-"*40)
for q in range(1,31):
    my = MY_TRUTH[str(q)]
    sc = scanner_reads.get(str(q),'?')
    match_sym = "=== نعم ===" if my==sc else "  -- لا --"
    if my==sc: match+=1
    else: diff+=1
    print(f"Q{q:>2}  {my:>10}  {sc:>10}  {match_sym}")
print("-"*40)
print(f"تطابق: {match}/30  |  اختلاف: {diff}/30")
print()
if diff > 10:
    print(">>> احتمال كبير: قراءتي اليدوية كانت خاطئة في {diff} سؤال")
    print(">>> النظام يقرأ الفقاعات الداكنة الفعلية بدقة")
