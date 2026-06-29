/** ترتيب أعمدة الكشف من اليمين إلى اليسار */
export const ROSTER_COLUMNS_RTL = [
  { key: 'index', label: 'م', showKey: 'indexShow', widthKey: 'colIndexPct', defaultPct: 6 },
  { key: 'name', label: 'اسم الطالب', showKey: 'nameShow', widthKey: 'colNamePct', defaultPct: 32 },
  { key: 'grade', label: 'الصف', showKey: 'gradeShow', widthKey: 'colGradePct', defaultPct: 16 },
  { key: 'seat', label: 'رقم الجلوس', showKey: 'seatShow', widthKey: 'colSeatPct', defaultPct: 12 },
  { key: 'notes', label: 'ملاحظات', showKey: 'notesShow', widthKey: 'colNotesPct', defaultPct: 34 },
];

/** قيمة خلية الجدول من بيانات الطالب */
export function getRosterStudentField(student, key) {
  if (!student) return key === 'notes' ? '' : '—';
  switch (key) {
    case 'seat':
      return String(student.seatNumber ?? student.seat_number ?? '').trim() || '—';
    case 'name':
      return String(student.name ?? student.studentName ?? '').trim() || '—';
    case 'grade':
      return String(student.grade ?? '').trim() || '—';
    case 'notes':
      return String(student.notes ?? student.note ?? student.remarks ?? '').trim();
    default:
      return '—';
  }
}

export const ROSTER_META_RTL = [
  { key: 'committee', label: 'رقم اللجنة', getValue: (page) => page.committeeNumber },
  { key: 'grade', label: 'الصف / المرحلة', getValue: (page) => page.grade },
  { key: 'count', label: 'عدد الطلاب', getValue: (page) => String(page.totalCount) },
];

export function getVisibleRosterColumns(table = {}) {
  const cols = ROSTER_COLUMNS_RTL.filter((col) => table[col.showKey] !== false).map((col) => ({
    ...col,
    pct: table[col.widthKey] ?? col.defaultPct,
  }));
  const sum = cols.reduce((s, c) => s + c.pct, 0);
  if (sum > 0 && Math.abs(sum - 100) > 0.5) {
    return cols.map((c) => ({ ...c, pct: (c.pct / sum) * 100 }));
  }
  return cols;
}

/** مواضع أعمدة من الحافة اليمنى (RTL) */
export function layoutRtlColumnRects(originX, totalWidth, columns) {
  let right = originX + totalWidth;
  return columns.map((col) => {
    const w = (totalWidth * col.pct) / 100;
    right -= w;
    return { ...col, x: right, w };
  });
}
