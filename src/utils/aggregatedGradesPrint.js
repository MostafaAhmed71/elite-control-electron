/** طباعة كشف درجات مجمع: الصف + المادة + جدول (اسم الطالب | الدرجة) */

export const getSchoolNameByStage = (stage = '') => {
  const s = String(stage || '').trim();
  if (s === 'ابتدائي' || s === 'الابتدائي') return 'مدارس نخبة الشمال الأهلية والعالمية';
  return 'متوسطة وثانوية نخبة الشمال الأهلية';
};

export const resolveResultSubject = (result, exam = null) => {
  const fromExam = exam?.subject || '';
  const fromResult = result?.subject || result?.examSubject || '';
  const fromTitle = result?.examTitle || exam?.title || '';
  return String(fromExam || fromResult || fromTitle || '—').trim() || '—';
};

export const resolveResultClass = (result, exam = null) => {
  const fromResult = result?.studentGrade || '';
  const fromExam = exam?.grade || (Array.isArray(exam?.grades) ? exam.grades[0] : '') || '';
  return String(fromResult || fromExam || '—').trim() || '—';
};

/**
 * @param {Array<object>} results - نتائج معتمدة
 * @param {object} options
 */
export function printAggregatedGradesSheet(results, options = {}) {
  const list = (results || []).filter((r) => r && (r.studentName || r.studentId));
  if (!list.length) {
    window.alert('لا توجد نتائج معتمدة للطباعة.');
    return;
  }

  const {
    classGrade = '—',
    subject = '—',
    examTitle = '',
    examStage = '',
    sheetTitle = 'كشف درجات مجمع',
  } = options;

  const schoolName = getSchoolNameByStage(examStage);
  const sorted = [...list].sort((a, b) =>
    String(a.studentName || a.studentId || '').localeCompare(
      String(b.studentName || b.studentId || ''),
      'ar'
    )
  );

  const rows = sorted
    .map((r, idx) => {
      const name = r.studentName || r.studentId || '—';
      const score =
        r.score != null && r.total != null ? `${r.score} / ${r.total}` : r.score != null ? String(r.score) : '—';
      const pct =
        r.percentage != null && r.percentage !== ''
          ? `<span style="color:#64748b;font-size:11px;margin-right:6px">(${parseFloat(r.percentage).toFixed(1)}%)</span>`
          : '';
      return `
      <tr style="background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="border:1px solid #cbd5e1;padding:10px 8px;text-align:center;font-weight:700;color:#475569">${idx + 1}</td>
        <td style="border:1px solid #cbd5e1;padding:10px 14px;text-align:right;font-weight:700;color:#0f172a">${name}</td>
        <td style="border:1px solid #cbd5e1;padding:10px 12px;text-align:center;font-weight:900;font-size:15px;color:#1e293b">${score}${pct}</td>
      </tr>`;
    })
    .join('');

  const win = window.open('', '_blank', 'width=900,height=800');
  if (!win) {
    window.alert('يُرجى السماح بالنوافذ المنبثقة للطباعة.');
    return;
  }

  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
    <meta charset="UTF-8">
    <title>${sheetTitle} — ${classGrade} — ${subject}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #f1f5f9; direction: rtl; }
      @media print {
        body { background: white; }
        .no-print { display: none !important; }
        tr { page-break-inside: avoid; }
      }
    </style>
  </head><body>
    <div class="no-print" style="background:#1e3a5f;color:#fff;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:99">
      <span style="font-weight:700">📋 ${sheetTitle} — ${sorted.length} طالب</span>
      <button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:8px 20px;border-radius:8px;font-weight:bold;cursor:pointer">🖨️ طباعة</button>
    </div>
    <div style="padding:28px 32px;max-width:820px;margin:0 auto">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:20px;font-weight:900;color:#0f172a">${schoolName}</div>
        ${examTitle ? `<div style="font-size:14px;color:#475569;margin-top:6px;font-weight:700">${examTitle}</div>` : ''}
        <div style="font-size:18px;font-weight:900;margin-top:14px;padding:10px 24px;border:2px solid #0f172a;display:inline-block">${sheetTitle}</div>
        <div style="margin-top:12px;font-size:15px;font-weight:700;color:#334155">
          <span style="margin-left:20px">الصف: <strong style="color:#1e40af">${classGrade}</strong></span>
          <span>المادة: <strong style="color:#1e40af">${subject}</strong></span>
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-top:8px">تاريخ الطباعة: ${new Date().toLocaleDateString('ar-SA')}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;background:#fff;border:2px solid #0f172a">
        <thead>
          <tr style="background:#1e3a5f;color:#fff">
            <th style="border:1px solid #2d5a9e;padding:12px;width:48px;text-align:center">م</th>
            <th style="border:1px solid #2d5a9e;padding:12px;text-align:right">اسم الطالب</th>
            <th style="border:1px solid #2d5a9e;padding:12px;text-align:center;width:140px">الدرجة</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;text-align:center;font-size:11px;color:#94a3b8">نظام OMR — نخبة الشمال</div>
    </div>
  </body></html>`);
  win.document.close();
}

/** تحويل عناصر جلسة المسح إلى مصفوفة نتائج */
export function resultsFromScanItems(items) {
  return (items || [])
    .filter((it) => it?.confirmed && it?.result)
    .map((it) => it.result);
}
