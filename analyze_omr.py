import csv, json, statistics

# Load CSV
rows = []
with open('omr_engine/dataset/eval_v1.csv', encoding='utf-8-sig') as f:
    rows = list(csv.DictReader(f))

total = len(rows)
auto_accepted = sum(1 for r in rows if r['decision_status'] == 'AUTO_ACCEPTED')
review_required = sum(1 for r in rows if r['decision_status'] == 'REVIEW_REQUIRED')

# Accuracy
total_correct = sum(int(r['score_correct']) for r in rows if r['score_correct'])
total_q = sum(int(r['score_total']) for r in rows if r['score_total'])
sheet_perfect = sum(1 for r in rows if r['sheet_perfect'] == 'True')
total_review_qs = sum(int(r['review_questions']) for r in rows if r['review_questions'])

# High confidence sheets
auto_wrong = [r for r in rows if r['decision_status']=='AUTO_ACCEPTED' and int(r['score_correct'])==0]
auto_partial = [r for r in rows if r['decision_status']=='AUTO_ACCEPTED' and 0 < int(r['score_correct']) < int(r['score_total'])]
review_high_score = [r for r in rows if r['decision_status']=='REVIEW_REQUIRED' and int(r['score_correct']) >= 15]

print('=== تقرير دقة التصحيح الآلي ===')
print(f'إجمالي الأوراق: {total}')
print(f'AUTO_ACCEPTED: {auto_accepted} ({auto_accepted/total*100:.1f}%)')
print(f'REVIEW_REQUIRED: {review_required} ({review_required/total*100:.1f}%)')
print()
print(f'دقة على مستوى السؤال: {total_correct}/{total_q} = {total_correct/total_q*100:.2f}%')
print(f'أوراق مثالية (100% صحيحة): {sheet_perfect}/{total} = {sheet_perfect/total*100:.1f}%')
print(f'نسبة الأسئلة تحت المراجعة: {total_review_qs}/{total_q} = {total_review_qs/total_q*100:.1f}%')
print()
print(f'AUTO_ACCEPTED مع score=0 (خطأ كبير): {len(auto_wrong)} ورقة')
for r in auto_wrong:
    img = r['image']
    sid = r['student_id']
    conf = r['avg_confidence']
    print(f'  - {img}: student={sid}, confidence={conf}')
print(f'AUTO_ACCEPTED مع نتيجة جزئية: {len(auto_partial)}')
for r in auto_partial:
    img = r['image']
    sid = r['student_id']
    sc = r['score_correct']
    st = r['score_total']
    conf = r['avg_confidence']
    print(f'  - {img}: {sc}/{st}, conf={conf}')
print()
print(f'REVIEW_REQUIRED لكن نتيجة ممتازة (>=15): {len(review_high_score)} ورقة')
for r in review_high_score:
    img = r['image']
    sc = r['score_correct']
    st = r['score_total']
    print(f'  - {img}: {sc}/{st}')

scores = [int(r['score_correct']) for r in rows]
confs = [float(r['avg_confidence']) for r in rows if r['avg_confidence']]
print()
print(f'متوسط النتيجة: {statistics.mean(scores):.1f}/20')
print(f'متوسط الثقة: {statistics.mean(confs):.3f}')
print(f'أقل ثقة: {min(confs):.3f}, أعلى ثقة: {max(confs):.3f}')

# breakdown by score range
ranges = {'0-5': 0, '6-10': 0, '11-15': 0, '16-20': 0}
for r in rows:
    s = int(r['score_correct'])
    if s <= 5: ranges['0-5'] += 1
    elif s <= 10: ranges['6-10'] += 1
    elif s <= 15: ranges['11-15'] += 1
    else: ranges['16-20'] += 1
print()
print('توزيع النتائج:')
for k, v in ranges.items():
    print(f'  {k} صحيح: {v} ورقة ({v/total*100:.1f}%)')
