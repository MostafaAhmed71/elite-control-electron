import { buildSheetMetaForStudents } from './examSchedule';

/** قالب كشف توقيع الطلاب — public/attendance_template.jpeg */
export const ATTENDANCE_TEMPLATE = '/attendance_template.jpeg';

/** عدد صفوف الطلاب الثابت على قالب A4 */
export const ATTENDANCE_PAGE_ROWS = 25;

/** نهاية جسم الجدول (%) قبل تذييل الصفحة */
export const ATTENDANCE_TABLE_BOTTOM_PCT = 89.5;

/** ترحيل إعدادات قديمة (20 أو 22 صف) إلى 25 */
export function normalizeAttendanceMaxRows(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v) || v < 1) return ATTENDANCE_PAGE_ROWS;
  if (v === 20 || v === 22) return ATTENDANCE_PAGE_ROWS;
  return v;
}

/** أقصى ارتفاع صف (%) لاحتواء كل الصفوف داخل الجدول */
export function maxRowHeightPct(startTop, rowCount = ATTENDANCE_PAGE_ROWS) {
  const start = startTop ?? DEFAULT_ATTENDANCE_LAYOUT.table.startTop;
  const available = ATTENDANCE_TABLE_BOTTOM_PCT - start;
  return Math.max(1.4, Math.round((available / Math.max(1, rowCount)) * 100) / 100);
}

/** عرض رقم اللجنة: «اللجنة 1» بدلاً من «1» فقط */
export function formatCommitteeDisplay(committee) {
  const raw = String(committee ?? '').trim();
  if (!raw || raw === 'غير محدد') return raw || '—';
  if (/^لجنة\s/i.test(raw) || /^اللجنة\s/i.test(raw)) return raw;
  return `اللجنة ${raw}`;
}

/**
 * مواضع معايرة على قالب A4
 * كل صف طالب (سطر واحد): م → الاسم → رقم الجلوس → الصف
 */
export const DEFAULT_ATTENDANCE_LAYOUT = {
  headerSubject: { top: 22.5, right: 10, fontSize: 0.85, show: false, bold: true },
  headerDay: { top: 22.5, right: 24, fontSize: 0.85, show: false, bold: true },
  headerDate: { top: 22.5, right: 36, fontSize: 0.85, show: false, bold: true },
  headerPeriod: { top: 22.5, right: 48, fontSize: 0.85, show: false, bold: true },
  headerCommittee: { top: 22.5, right: 60, fontSize: 0.82, show: true },
  headerGrade: { top: 22.5, right: 55, fontSize: 0.85, show: false },
  headerCount: { top: 22.5, right: 76, fontSize: 0.82, show: true },
  table: {
    startTop: 34.2,
    rowHeight: 2.05,
    fontSize: 0.62,
    indexShow: true,
    indexRight: 6.5,
    indexTop: 0,
    nameShow: true,
    nameRight: 15,
    nameTop: 0,
    /** عرض كافٍ لـ ~5 أجزاء اسم على سطر واحد */
    nameWidthPct: 38,
    seatShow: true,
    seatRight: 46,
    seatTop: 0,
    gradeShow: true,
    gradeRight: 53,
    gradeTop: 0,
    omrShow: false,
    omrRight: 0,
    omrTop: 0,
    signatureShow: false,
    signatureRight: 78,
    signatureTop: 0,
    rowOverrides: {},
  },
  maxRows: ATTENDANCE_PAGE_ROWS,
  /** نصوص رأس الكشف (تجاوز جدول الفترات عند الحفظ) */
  sheetMetaPreview: {},
};

/** موضع صف الطالب على الصفحة (%) */
export function getStudentRowTop(config, rowIdx) {
  const table = config.table;
  const o = table.rowOverrides?.[rowIdx] || {};
  return table.startTop + rowIdx * table.rowHeight + (o.top || 0);
}

export function getRowShift(config, rowIdx) {
  return config.table.rowOverrides?.[rowIdx] || { top: 0, right: 0, fontSize: 0 };
}

/** ترتيب صحيح: index < name < seat < grade (من اليمين لليسار) */
export function isTableColumnOrderValid(table) {
  const t = table;
  return (
    (t.indexRight ?? 0) < (t.nameRight ?? 0) &&
    (t.nameRight ?? 0) < (t.seatRight ?? 0) &&
    (t.seatRight ?? 0) < (t.gradeRight ?? 0) &&
    (t.gradeRight ?? 0) < 75
  );
}

export function normalizeAttendanceTable(table, maxRows = ATTENDANCE_PAGE_ROWS) {
  const d = DEFAULT_ATTENDANCE_LAYOUT.table;
  let t = { ...d, ...table };

  const rowCap = maxRowHeightPct(t.startTop, maxRows);
  if ((t.rowHeight ?? d.rowHeight) > rowCap) {
    t.rowHeight = rowCap;
  }

  const seatR = t.seatRight ?? d.seatRight;
  const nameR = t.nameRight ?? d.nameRight;
  const maxNameW = Math.max(20, seatR - nameR - 3);
  if ((t.nameWidthPct ?? d.nameWidthPct) < 28) {
    t.nameWidthPct = Math.min(d.nameWidthPct, maxNameW);
  }
  if ((t.nameWidthPct ?? 0) > maxNameW) {
    t.nameWidthPct = maxNameW;
  }

  if (!isTableColumnOrderValid(t)) {
    t = {
      ...t,
      startTop: d.startTop,
      rowHeight: d.rowHeight,
      fontSize: d.fontSize,
      indexRight: d.indexRight,
      nameRight: d.nameRight,
      nameWidthPct: d.nameWidthPct,
      seatRight: d.seatRight,
      gradeRight: d.gradeRight,
      rowOverrides: {},
    };
  }

  const clean = {};
  Object.entries(t.rowOverrides || {}).forEach(([k, v]) => {
    const top = Math.min(1.5, Math.max(-1.5, Number(v?.top) || 0));
    const right = Math.min(2, Math.max(-2, Number(v?.right) || 0));
    const fontSize = Math.min(0.5, Math.max(-0.5, Number(v?.fontSize) || 0));
    if (top || right || fontSize) clean[k] = { top, right, fontSize };
  });
  t.rowOverrides = clean;

  return t;
}

/** إعدادات طباعة الكشوف — بدون شعبة/فصل أو ملاحظات */
const PRINT_HEADER_KEYS = [
  'headerSubject',
  'headerDay',
  'headerDate',
  'headerPeriod',
  'headerCommittee',
  'headerGrade',
  'headerCount',
];

/** حقول المادة / اليوم / التاريخ / الفترة — خط عريض */
export const EXAM_META_HEADER_KEYS = ['headerSubject', 'headerDay', 'headerDate', 'headerPeriod'];

const PRINT_EXAM_HEADER_KEYS = EXAM_META_HEADER_KEYS;

export function resolvePrintSheetConfig(raw) {
  const src = raw || {};
  const base = resolveAttendanceConfig(raw);
  const maxRows = ATTENDANCE_PAGE_ROWS;
  const merged = { ...base, maxRows };
  PRINT_HEADER_KEYS.forEach((key) => {
    const def = DEFAULT_ATTENDANCE_LAYOUT[key];
    let show = base[key]?.show ?? def?.show ?? true;
    if (key === 'headerGrade') show = false;
    else if (PRINT_EXAM_HEADER_KEYS.includes(key)) show = true;
    merged[key] = { ...def, ...(base[key] || {}), show };
  });
  merged.sheetMetaPreview = {
    ...DEFAULT_ATTENDANCE_LAYOUT.sheetMetaPreview,
    ...(src.sheetMetaPreview || {}),
  };
  merged.table = normalizeAttendanceTable(
    {
      ...base.table,
      gradeShow: true,
      signatureShow: false,
      omrShow: false,
    },
    maxRows
  );
  return merged;
}

export function resolveAttendanceConfig(raw) {
  const src = raw || {};
  const maxRows = normalizeAttendanceMaxRows(src.maxRows ?? DEFAULT_ATTENDANCE_LAYOUT.maxRows);
  const mergedTable = {
    ...DEFAULT_ATTENDANCE_LAYOUT.table,
    ...src.table,
    rowOverrides: src.table?.rowOverrides || {},
  };
  const merged = { ...DEFAULT_ATTENDANCE_LAYOUT, ...src, maxRows };
  PRINT_HEADER_KEYS.forEach((key) => {
    merged[key] = { ...DEFAULT_ATTENDANCE_LAYOUT[key], ...(src[key] || {}) };
  });
  merged.sheetMetaPreview = {
    ...DEFAULT_ATTENDANCE_LAYOUT.sheetMetaPreview,
    ...(src.sheetMetaPreview || {}),
  };
  merged.table = normalizeAttendanceTable(mergedTable, maxRows);
  return merged;
}

export function clonePrintSheetConfig(raw) {
  return resolvePrintSheetConfig(raw);
}

export function sortStudentsForSheet(list) {
  return [...list].sort((a, b) => {
    const na = parseInt(String(a.seatNumber ?? '').replace(/\D/g, ''), 10);
    const nb = parseInt(String(b.seatNumber ?? '').replace(/\D/g, ''), 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ar', { numeric: true });
  });
}

/** مصدر بيانات الرأس: كائن جاهز أو { schedule, filters } */
export function mergeSheetMeta(manual, fromSchedule) {
  if (!fromSchedule && !manual) return undefined;
  const base = fromSchedule || {};
  if (!manual) return base;
  const pick = (key) => {
    const v = manual[key];
    if (v != null && String(v).trim() && v !== '—') return String(v).trim();
    return base[key];
  };
  return {
    subject: pick('subject') ?? '—',
    day: pick('day') ?? '—',
    date: pick('date') ?? '—',
    period: base.period ?? manual.period,
    periodLabel: pick('periodLabel') ?? '—',
  };
}

function resolvePageSheetMeta(metaSource, committeeStudents, config) {
  let fromSchedule;
  if (!metaSource) {
    fromSchedule = undefined;
  } else if (metaSource.schedule && metaSource.filters) {
    fromSchedule = buildSheetMetaForStudents(
      metaSource.schedule,
      metaSource.filters,
      committeeStudents
    );
  } else if (
    metaSource.subject !== undefined ||
    metaSource.day !== undefined ||
    metaSource.periodLabel !== undefined
  ) {
    return { ...metaSource };
  }
  return mergeSheetMeta(config?.sheetMetaPreview, fromSchedule);
}

/** تقسيم طلاب اللجان إلى صفحات A4 حسب maxRows */
export function buildAttendancePages(students, config, metaSource = null) {
  if (!config || !students?.length) return [];

  const grouped = {};
  students.forEach((s) => {
    const key = s.committee || 'غير محدد';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  const max = normalizeAttendanceMaxRows(config.maxRows);
  const pages = [];

  Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .forEach((committeeId) => {
      const committeeStudents = sortStudentsForSheet(grouped[committeeId]);
      const gradeText =
        [...new Set(committeeStudents.map((s) => s.grade).filter(Boolean))].join(' و ') || '—';
      const pageSheetMeta = resolvePageSheetMeta(metaSource, committeeStudents, config);

      for (let i = 0; i < committeeStudents.length; i += max) {
        const chunk = committeeStudents.slice(i, i + max);
        const chunkIndex = Math.floor(i / max);
        const totalPages = Math.ceil(committeeStudents.length / max);
        pages.push({
          id: `${committeeId}-${chunkIndex}`,
          committee: committeeId,
          grade: gradeText,
          totalCount: committeeStudents.length,
          pageIndex: chunkIndex + 1,
          totalPages,
          globalStartIndex: i,
          students: chunk,
          sheetMeta: pageSheetMeta ? { ...pageSheetMeta } : undefined,
        });
      }
    });

  return pages;
}
