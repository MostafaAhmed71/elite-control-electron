import { formatCommitteeDisplay } from './attendanceLayout';
import { committeeMatchKey, findCommitteeRecord as findCommitteeRecordUtil } from './committeeUtils';
import { resolveExamSchedule, buildSheetMetaForStudents, periodLabel } from './examSchedule';

/** ربط قديم (مفتاح الحقل) → معرّف الربط الجديد */
export const LEGACY_FIELD_BINDINGS = {
  committee: 'committees.committeeName',
  grade: 'students.grade',
  subject: 'printSheets.subject',
  examDate: 'printSheets.examDateLine',
  period: 'printSheets.periodLabel',
  studentCount: 'committees.studentCountLabel',
  title: 'school.platformName',
  notes: 'filters.summary',
};

/**
 * مصادر البيانات — كل حقل يُجلب تلقائياً من النظام
 * binding: `${sourceId}.${fieldId}`
 */
export const COVER_DATA_SOURCES = [
  {
    id: 'committees',
    label: 'إدارة اللجان',
    icon: 'users',
    fields: [
      { id: 'committeeName', label: 'اسم اللجنة (منسّق)' },
      { id: 'committeeNameRaw', label: 'اسم اللجنة كما في السجل' },
      { id: 'committeeRoom', label: 'قاعة / موقع اللجنة' },
      { id: 'committeeCapacity', label: 'سعة اللجنة' },
      { id: 'studentCount', label: 'عدد الطلاب في اللجنة' },
      { id: 'studentCountLabel', label: 'عدد الطلاب (نص كامل)' },
      { id: 'seatsRemaining', label: 'المقاعد المتبقية' },
      { id: 'occupancyPct', label: 'نسبة الإشغال %' },
    ],
  },
  {
    id: 'printSheets',
    label: 'طباعة الكشوف / جدول الفترات',
    icon: 'printer',
    fields: [
      { id: 'subject', label: 'المادة' },
      { id: 'examDay', label: 'يوم الاختبار' },
      { id: 'examDate', label: 'تاريخ الاختبار' },
      { id: 'examDateLine', label: 'اليوم والتاريخ معاً' },
      { id: 'periodLabel', label: 'الفترة (نص)' },
      { id: 'periodNumber', label: 'رقم الفترة' },
    ],
  },
  {
    id: 'students',
    label: 'بيانات الطلاب (حسب الفلتر)',
    icon: 'graduation',
    fields: [
      { id: 'stage', label: 'المرحلة' },
      { id: 'grade', label: 'الصف' },
      { id: 'gradesList', label: 'كل الصفوف (مجمّع)' },
    ],
  },
  {
    id: 'school',
    label: 'إعدادات النظام',
    icon: 'settings',
    fields: [
      { id: 'platformName', label: 'اسم المنصة / المدرسة' },
      { id: 'managerName', label: 'اسم المدير' },
      { id: 'academicYear', label: 'العام الدراسي' },
    ],
  },
  {
    id: 'filters',
    label: 'ملخص الاختيار الحالي',
    icon: 'filter',
    fields: [
      { id: 'stageLabel', label: 'المرحلة المختارة' },
      { id: 'gradeLabel', label: 'الصف المختار' },
      { id: 'committeeLabel', label: 'اللجنة المختارة' },
      { id: 'summary', label: 'ملخص الفلاتر' },
    ],
  },
];

export function bindingId(sourceId, fieldId) {
  return `${sourceId}.${fieldId}`;
}

export function parseBindingId(binding) {
  if (!binding || typeof binding !== 'string') return { sourceId: null, fieldId: null };
  const i = binding.indexOf('.');
  if (i < 0) return { sourceId: null, fieldId: binding };
  return { sourceId: binding.slice(0, i), fieldId: binding.slice(i + 1) };
}

export function getBindingMeta(binding) {
  const { sourceId, fieldId } = parseBindingId(binding);
  const source = COVER_DATA_SOURCES.find((s) => s.id === sourceId);
  const field = source?.fields?.find((f) => f.id === fieldId);
  return {
    binding,
    sourceLabel: source?.label || '—',
    fieldLabel: field?.label || fieldId || '—',
    label: field ? `${source.label} — ${field.label}` : binding,
  };
}

export function listAllBindings() {
  const out = [];
  for (const src of COVER_DATA_SOURCES) {
    for (const f of src.fields) {
      out.push({
        binding: bindingId(src.id, f.id),
        sourceId: src.id,
        sourceLabel: src.label,
        fieldId: f.id,
        fieldLabel: f.label,
        label: `${src.label} — ${f.label}`,
      });
    }
  }
  return out;
}

export function findCommitteeRecord(committees, committeeKey, stage = null) {
  return findCommitteeRecordUtil(committees, committeeKey, stage);
}

/** فلترة الطلاب مثل صفحة طباعة الكشوف */
export function filterStudentsForCover(students, filters = {}) {
  const { stage = 'الكل', grade = 'الكل', committee = 'الكل' } = filters;
  return (students || []).filter((s) => {
    const matchStage = stage === 'الكل' || s.stage === stage;
    const matchGrade = grade === 'الكل' || s.grade === grade;
    const matchCommittee =
      committee === 'الكل' ||
      String(s.committee || '').trim() === String(committee || '').trim() ||
      committeeMatchKey(s.committee) === committeeMatchKey(committee);
    // عند تحديد لجنة + مرحلة في الفلاتر
    if (
      matchCommittee &&
      committee !== 'الكل' &&
      stage !== 'الكل' &&
      s.stage &&
      stage !== s.stage
    ) {
      return false;
    }
    return matchStage && matchGrade && matchCommittee;
  });
}

/** لجان فريدة ضمن الطلاب المفلترين */
export function committeesFromStudents(students) {
  const keys = new Set();
  (students || []).forEach((s) => {
    const k = String(s.committee || '').trim();
    if (k) keys.add(k);
  });
  return [...keys].sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
}

export function buildCoverContext({
  appConfig,
  students = [],
  committees = [],
  filters = {},
  committee = null,
}) {
  const scopedAll = filterStudentsForCover(students, filters);
  const committeeKey = committee && committee !== 'الكل' ? committee : filters.committee;
  const scoped =
    committee && committee !== 'الكل'
      ? filterStudentsForCover(students, { ...filters, committee })
      : scopedAll;

  const schedule = resolveExamSchedule(appConfig?.examSchedule);
  const sheetMeta = buildSheetMetaForStudents(schedule, filters, scoped);
  const stageFilter =
    filters.stage && filters.stage !== 'الكل' ? filters.stage : null;
  const record = findCommitteeRecord(committees, committeeKey, stageFilter);
  const count = scoped.length;
  const capacity = record?.capacity ? parseInt(record.capacity, 10) : null;
  const remaining =
    capacity != null && Number.isFinite(capacity) ? Math.max(0, capacity - count) : null;
  const occupancy =
    capacity != null && capacity > 0 ? Math.round((count / capacity) * 100) : null;

  const examDateLine = [sheetMeta.day, sheetMeta.date]
    .filter((x) => x && x !== '—')
    .join(' — ');

  const stageVal =
    filters.stage && filters.stage !== 'الكل'
      ? filters.stage
      : [...new Set(scoped.map((s) => s.stage).filter(Boolean))][0] || '—';
  const gradeVal =
    filters.grade && filters.grade !== 'الكل'
      ? filters.grade
      : [...new Set(scoped.map((s) => s.grade).filter(Boolean))][0] || '—';
  const gradesList = [...new Set(scoped.map((s) => s.grade).filter(Boolean))].join('، ') || '—';

  return {
    appConfig,
    filters,
    committee: committeeKey,
    committeeRecord: record,
    students: scoped,
    sheetMeta,
    examDateLine: examDateLine || '—',
    stageVal,
    gradeVal,
    gradesList,
    studentCount: count,
    capacity,
    remaining,
    occupancy,
  };
}

function resolveBindingValue(binding, ctx) {
  const { sourceId, fieldId } = parseBindingId(binding);
  if (!sourceId || !fieldId) return '—';

  const { appConfig, committee, committeeRecord, sheetMeta, examDateLine } = ctx;
  const cName = committeeRecord?.name || committee;
  const cDisplay = formatCommitteeDisplay(committee);

  switch (sourceId) {
    case 'committees':
      switch (fieldId) {
        case 'committeeName':
          return cDisplay || '—';
        case 'committeeNameRaw':
          return cName ? String(cName) : '—';
        case 'committeeRoom':
          return committeeRecord?.room ? String(committeeRecord.room) : '—';
        case 'committeeCapacity':
          return ctx.capacity != null ? String(ctx.capacity) : '—';
        case 'studentCount':
          return String(ctx.studentCount ?? 0);
        case 'studentCountLabel':
          return ctx.studentCount ? `عدد الطلاب: ${ctx.studentCount}` : '—';
        case 'seatsRemaining':
          return ctx.remaining != null ? String(ctx.remaining) : '—';
        case 'occupancyPct':
          return ctx.occupancy != null ? `${ctx.occupancy}%` : '—';
        default:
          return '—';
      }

    case 'printSheets':
      switch (fieldId) {
        case 'subject':
          return sheetMeta?.subject || '—';
        case 'examDay':
          return sheetMeta?.day || '—';
        case 'examDate':
          return sheetMeta?.date || '—';
        case 'examDateLine':
          return examDateLine || '—';
        case 'periodLabel':
          return sheetMeta?.periodLabel || periodLabel(sheetMeta?.period) || '—';
        case 'periodNumber':
          return sheetMeta?.period != null ? String(sheetMeta.period) : '—';
        default:
          return '—';
      }

    case 'students':
      switch (fieldId) {
        case 'stage':
          return ctx.stageVal || '—';
        case 'grade':
          return ctx.gradeVal || '—';
        case 'gradesList':
          return ctx.gradesList || '—';
        default:
          return '—';
      }

    case 'school':
      switch (fieldId) {
        case 'platformName':
          return appConfig?.platformName || '—';
        case 'managerName':
          return appConfig?.managerName || '—';
        case 'academicYear':
          return appConfig?.academicWeight || '—';
        default:
          return '—';
      }

    case 'filters': {
      const f = ctx.filters || {};
      switch (fieldId) {
        case 'stageLabel':
          return f.stage && f.stage !== 'الكل' ? f.stage : 'كل المراحل';
        case 'gradeLabel':
          return f.grade && f.grade !== 'الكل' ? f.grade : 'كل الصفوف';
        case 'committeeLabel':
          return committee && committee !== 'الكل' ? cDisplay : 'كل اللجان';
        case 'summary': {
          const parts = [];
          if (f.stage && f.stage !== 'الكل') parts.push(f.stage);
          if (f.grade && f.grade !== 'الكل') parts.push(f.grade);
          if (committee && committee !== 'الكل') parts.push(cDisplay);
          if (sheetMeta?.subject && sheetMeta.subject !== '—') parts.push(sheetMeta.subject);
          return parts.length ? parts.join(' · ') : '—';
        }
        default:
          return '—';
      }
    }

    default:
      return '—';
  }
}

/** يحلّ قيم كل حقول القالب من السياق */
export function resolveCoverFieldData(templateFields, ctx) {
  const out = {};
  for (const f of templateFields || []) {
    const binding = f.binding || LEGACY_FIELD_BINDINGS[f.key];
    if (!binding) {
      out[f.key] = f.sampleText || '—';
      continue;
    }
    const val = resolveBindingValue(binding, ctx);
    out[f.key] = val != null && String(val).trim() !== '' ? String(val) : '—';
  }
  return out;
}

/** سياق معاينة افتراضي عند ضبط المواضع */
export function buildDefaultPreviewContext(appConfig, students, committees) {
  const stages = [...new Set((students || []).map((s) => s.stage).filter(Boolean))];
  const stage = stages.includes('ثانوي') ? 'ثانوي' : stages[0] || 'ثانوي';
  const gradeStudents = (students || []).filter((s) => s.stage === stage);
  const grades = [...new Set(gradeStudents.map((s) => s.grade).filter(Boolean))];
  const grade = grades[0] || 'الكل';
  const comms = committeesFromStudents(
    gradeStudents.filter((s) => (grade === 'الكل' ? true : s.grade === grade))
  );
  const committee = comms[0] || 'الكل';

  return buildCoverContext({
    appConfig,
    students,
    committees,
    filters: {
      stage,
      grade,
      committee: 'الكل',
      period: 1,
      day: 'الكل',
    },
    committee,
  });
}

/** ترحيل حقول قديمة بدون binding */
export function migrateFieldBindings(fields) {
  return (fields || []).map((f) => {
    if (f.binding) return f;
    const binding = LEGACY_FIELD_BINDINGS[f.key];
    if (!binding) return f;
    const meta = getBindingMeta(binding);
    return {
      ...f,
      binding,
      label: f.label || meta.fieldLabel,
    };
  });
}
