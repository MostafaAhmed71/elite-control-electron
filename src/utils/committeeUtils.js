import { compareStudentsBySeatNumber } from './seatNumberGenerator';

/** مراحل اللجان — تطابق قيم stage في سجل الطالب */
export const COMMITTEE_STAGES = [
  { id: 'متوسط', label: 'المرحلة المتوسطة' },
  { id: 'ثانوي', label: 'المرحلة الثانوية' },
];

export function committeeMatchKey(name) {
  return String(name || '')
    .replace(/^اللجنة\s*/i, '')
    .replace(/^لجنة\s*/i, '')
    .trim();
}

/** رقم اللجنة فقط للطباعة على OMR (مثلاً: 1) — بدون «لجنة» أو «اللجنة» */
export function committeeNumberOnly(committeeOrName) {
  if (committeeOrName && typeof committeeOrName === 'object') {
    return committeeMatchKey(committeeOrName.name);
  }
  return committeeMatchKey(committeeOrName);
}

/** هل الطالب تابع لهذه اللجنة (مع مراعاة المرحلة إن وُجدت) */
export function studentMatchesCommittee(student, committee) {
  if (!committee || !student) return false;
  const sKey = String(student.committee || '').trim();
  if (!sKey) return false;
  const key = committeeMatchKey(committee.name);
  const nameMatch = sKey === key || student.committee === committee.name;
  if (!nameMatch) return false;
  if (committee.stage && student.stage && committee.stage !== student.stage) {
    return false;
  }
  if (committee.grade && student.grade && committee.grade !== student.grade) {
    return false;
  }
  return true;
}

export function getStudentsInCommittee(committee, allStudents = [], sortBySeat = true) {
  const list = allStudents.filter((s) => studentMatchesCommittee(s, committee));
  if (sortBySeat) {
    return list.sort(compareStudentsBySeatNumber);
  }
  return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar', { numeric: true }));
}

/** إيجاد سجل اللجنة — يُفضّل التطابق حسب المرحلة عند تكرار الرقم */
export function findCommitteeRecord(committees, committeeKey, stage = null) {
  if (!committeeKey || committeeKey === 'الكل') return null;
  const key = committeeMatchKey(committeeKey);
  const candidates = (committees || []).filter(
    (c) => committeeMatchKey(c.name) === key || c.name === committeeKey
  );
  if (!candidates.length) return null;
  if (stage && stage !== 'الكل') {
    const byStage = candidates.find((c) => c.stage === stage);
    if (byStage) return byStage;
  }
  return candidates[0];
}

export function committeeLabelWithStage(committee) {
  if (!committee?.name) return '—';
  const parts = [committee.name];
  if (committee.stage) {
    const stageLabel =
      COMMITTEE_STAGES.find((s) => s.id === committee.stage)?.label || committee.stage;
    parts.push(stageLabel);
  }
  if (committee.grade) parts.push(committee.grade);
  return parts.join(' — ');
}

/** صفوف مميزة لمرحلة معيّنة */
export function gradesForStage(students, stage) {
  if (!stage) return [];
  return [
    ...new Set(
      (students || [])
        .filter((s) => s.stage === stage)
        .map((s) => s.grade)
        .filter(Boolean)
    ),
  ].sort((a, b) => String(a).localeCompare(String(b), 'ar', { numeric: true }));
}

/** هل الطالب موزّع على لجنة موجودة فعلاً في النظام */
export function studentHasActiveCommittee(student, committees) {
  const key = String(student?.committee || '').trim();
  if (!key) return false;
  return (committees || []).some((c) => studentMatchesCommittee(student, c));
}

/** طلاب لديهم رقم لجنة لكن اللجنة حُذفت من السجل */
export function getOrphanCommitteeStudents(students, committees) {
  return (students || []).filter((s) => {
    const key = String(s.committee || '').trim();
    if (!key) return false;
    return !studentHasActiveCommittee(s, committees);
  });
}

/** لجان مناسبة لمرحلة و/أو صف (اللجنة العامة بدون grade تقبل أي صف في المرحلة) */
export function committeesForGrade(committees, students, grade, stage = null) {
  const resolvedStage =
    stage || (grade ? students.find((s) => s.grade === grade)?.stage : null);
  if (!resolvedStage && !grade) return committees || [];
  return (committees || []).filter((c) => {
    if (resolvedStage && c.stage && c.stage !== resolvedStage) return false;
    if (grade && c.grade && c.grade !== grade) return false;
    return true;
  });
}

/** إيجاد سجل موقع اللجنة من جدول locations */
export function findLocationRecord(locations, committeeKey) {
  if (!committeeKey) return null;
  const key = committeeMatchKey(committeeKey);
  const candidates = (locations || []).filter(
    (loc) => committeeMatchKey(loc.committee) === key || loc.committee === committeeKey
  );
  return candidates[0] || null;
}

/** تنسيق مقر اللجنة (مبنى، دور، غرفة) */
export function formatCommitteeVenue({ committeeRecord, locationRecord } = {}) {
  if (locationRecord) {
    const parts = [];
    if (locationRecord.building) parts.push(String(locationRecord.building));
    if (locationRecord.floor) parts.push(`الدور: ${locationRecord.floor}`);
    if (locationRecord.room) parts.push(`غرفة ${locationRecord.room}`);
    if (parts.length) return parts.join(' — ');
  }
  if (committeeRecord?.room) return String(committeeRecord.room);
  return null;
}

/** مقر لجنة الطالب — من locations أو حقل room في سجل اللجنة */
export function resolveStudentCommitteeVenue(student, committees, locations) {
  const committeeKey = String(student?.committee || '').trim();
  if (!committeeKey) return '—';
  const committeeRecord = findCommitteeRecord(committees, committeeKey, student?.stage);
  const locationRecord = findLocationRecord(locations, committeeKey);
  return formatCommitteeVenue({ committeeRecord, locationRecord }) || '—';
}
