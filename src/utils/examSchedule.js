/** جدول اختبارات الفترات — يومان في نفس اليوم (فترة أولى / ثانية) */

export const EXAM_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

export const PERIOD_OPTIONS = [
  { value: 1, label: 'الفترة الأولى' },
  { value: 2, label: 'الفترة الثانية' },
];

export function periodLabel(period) {
  const n = parseInt(period, 10);
  return PERIOD_OPTIONS.find((p) => p.value === n)?.label || `الفترة ${n}`;
}

export const DEFAULT_EXAM_SCHEDULE = {
  dayDates: {
    الأحد: '',
    الاثنين: '',
    الثلاثاء: '',
    الأربعاء: '',
    الخميس: '',
  },
  entries: [],
};

export function resolveExamSchedule(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const dayDates = { ...DEFAULT_EXAM_SCHEDULE.dayDates, ...(src.dayDates || {}) };
  const entries = Array.isArray(src.entries) ? src.entries.map(normalizeEntry).filter(Boolean) : [];
  return { dayDates, entries };
}

function normalizeEntry(e) {
  if (!e?.stage || !e?.grade) return null;
  const period = parseInt(e.period, 10) === 2 ? 2 : 1;
  const day = EXAM_WEEKDAYS.includes(e.day) ? e.day : EXAM_WEEKDAYS[0];
  return {
    id: e.id || `es-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stage: String(e.stage).trim(),
    grade: String(e.grade).trim(),
    day,
    subject: String(e.subject ?? '').trim(),
    period,
  };
}

/** تاريخ اليوم من جدول الأيام */
export function dateForDay(schedule, day) {
  const d = schedule?.dayDates?.[day];
  return d ? String(d).trim() : '';
}

export function formatSheetDate(dateStr) {
  const s = String(dateStr ?? '').trim();
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    }
  } catch {
    /* keep raw */
  }
  return s;
}

/** مطابقة سجل الجدول للفلاتر */
export function findScheduleEntry(schedule, filters = {}) {
  const entries = schedule?.entries || [];
  const stage = filters.stage;
  const grade = filters.grade;
  const period = parseInt(filters.period, 10);
  const day = filters.day;

  const matches = entries.filter((e) => {
    if (stage && stage !== 'الكل' && e.stage !== stage) return false;
    if (grade && grade !== 'الكل' && e.grade !== grade) return false;
    if (period === 1 || period === 2) {
      if (e.period !== period) return false;
    }
    if (day && day !== 'الكل' && e.day !== day) return false;
    return true;
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  if (grade && grade !== 'الكل') {
    const exact = matches.find((e) => e.grade === grade);
    if (exact) return exact;
  }
  return matches[0];
}

function metaFromEntry(schedule, entry, filters = {}) {
  const rawDate = dateForDay(schedule, entry.day);
  return {
    subject: entry.subject || '—',
    day: entry.day || '—',
    date: rawDate ? formatSheetDate(rawDate) : '—',
    period: entry.period,
    periodLabel: periodLabel(entry.period),
    periodFilter: filters.period ? periodLabel(filters.period) : periodLabel(entry.period),
  };
}

/** بيانات رأس الكشف من الجدول + الفلاتر */
export function buildSheetMetaFromSchedule(schedule, filters = {}) {
  const entry = findScheduleEntry(schedule, filters);
  if (!entry) {
    return {
      subject: '—',
      day: '—',
      date: '—',
      period: filters.period ? parseInt(filters.period, 10) : null,
      periodLabel: filters.period ? periodLabel(filters.period) : '—',
    };
  }
  return metaFromEntry(schedule, entry, filters);
}

/**
 * مطابقة الجدول حسب طلاب الصفحة عندما تكون الفلاتر «الكل»
 */
export function buildSheetMetaForStudents(schedule, filters = {}, students = []) {
  if (!schedule?.entries?.length) {
    return buildSheetMetaFromSchedule(schedule, filters);
  }

  const stages = [...new Set(students.map((s) => s.stage).filter(Boolean))];
  const grades = [...new Set(students.map((s) => s.grade).filter(Boolean))];

  const attempts = [
    {
      ...filters,
      stage: filters.stage !== 'الكل' ? filters.stage : stages[0],
      grade: filters.grade !== 'الكل' ? filters.grade : grades[0],
    },
    { ...filters, grade: grades[0], stage: filters.stage },
    { ...filters, stage: stages[0] },
    filters,
  ];

  for (const f of attempts) {
    if (!f.grade || f.grade === 'الكل') continue;
    const entry = findScheduleEntry(schedule, f);
    if (entry) return metaFromEntry(schedule, entry, filters);
  }

  return buildSheetMetaFromSchedule(schedule, filters);
}

/** أيام متاحة لمرحلة/صف/فترة (للفلتر) */
export function daysForFilters(schedule, filters = {}) {
  const entries = schedule?.entries || [];
  const stage = filters.stage;
  const grade = filters.grade;
  const period = parseInt(filters.period, 10);

  const days = new Set();
  entries.forEach((e) => {
    if (stage && stage !== 'الكل' && e.stage !== stage) return;
    if (grade && grade !== 'الكل' && e.grade !== grade) return;
    if ((period === 1 || period === 2) && e.period !== period) return;
    if (e.day) days.add(e.day);
  });
  return [...days];
}

export function subjectNamesFromOmr(omrSubjects) {
  const list = Array.isArray(omrSubjects) ? omrSubjects : [];
  return [...new Set(list.map((s) => s?.name).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ar', { numeric: true })
  );
}
