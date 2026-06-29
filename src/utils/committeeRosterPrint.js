import { formatCommitteeDisplay } from './attendanceLayout';
import { committeeMatchKey, getStudentsInCommittee } from './committeeUtils';
import { compareStudentsBySeatNumber } from './seatNumberGenerator';
import { mergeManagerFooterLayout } from './committeeRosterManagerFooter';

const STORAGE_KEY = 'committeeRosterPrintConfig_v2';

/** قالب مدمج — بدون صورة خارجية */
export const DEFAULT_COMMITTEE_ROSTER_CONFIG = {
  version: 2,
  title: 'كشف توزيع الطلاب على لجان الاختبار',
  subtitle: 'الفصل الدراسي — اختبارات نهاية العام',
  showMinistryLine: true,
  showSchoolName: true,
  showMetaBox: true,
  showManagerSignature: true,
  managerTitle: 'مدير المدرسة',
  managerName: 'محمد نصر الدين ',
  signatureLineLabel: 'التوقيع :',
  stampLabel: 'الختم',
  managerFooter: mergeManagerFooterLayout(null),
  table: {
    fontSizeRem: 0.82,
    headerFontSizeRem: 0.88,
    rowHeightMm: 7.2,
    indexShow: true,
    seatShow: true,
    nameShow: true,
    gradeShow: true,
    notesShow: true,
    colIndexPct: 6,
    colSeatPct: 12,
    colNamePct: 32,
    colGradePct: 16,
    colNotesPct: 34,
  },
  maxRows: 25,
};

function isLegacyOverlayConfig(parsed) {
  return parsed?.headerCommittee?.top != null || parsed?.table?.startTop != null;
}

export function mergeCommitteeRosterConfig(parsed) {
  const def = DEFAULT_COMMITTEE_ROSTER_CONFIG;
  if (!parsed || typeof parsed !== 'object') {
    return { ...def, table: { ...def.table }, managerFooter: mergeManagerFooterLayout(null) };
  }
  if (parsed.version !== 2 && isLegacyOverlayConfig(parsed)) {
    return {
      ...def,
      maxRows: parsed.maxRows ?? def.maxRows,
      table: { ...def.table },
      managerFooter: mergeManagerFooterLayout(null),
    };
  }
  return {
    ...def,
    ...parsed,
    table: { ...def.table, ...parsed.table },
    managerFooter: mergeManagerFooterLayout(parsed.managerFooter),
  };
}

export function loadCommitteeRosterConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      const legacy = localStorage.getItem('committeeRosterPrintConfig');
      if (legacy) return mergeCommitteeRosterConfig(JSON.parse(legacy));
      return mergeCommitteeRosterConfig(null);
    }
    return mergeCommitteeRosterConfig(JSON.parse(saved));
  } catch {
    return mergeCommitteeRosterConfig(null);
  }
}

export function saveCommitteeRosterConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, version: 2 }));
}

export function resetCommitteeRosterConfig() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('committeeRosterPrintConfig');
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function committeeHeaderNumber(committee) {
  const raw = String(committee?.name || '').trim();
  if (!raw) return '—';
  return formatCommitteeDisplay(committeeMatchKey(raw) || raw);
}

export function resolveCommitteeGradeLabel(committee, rosterStudents) {
  if (committee?.grade?.trim()) return committee.grade.trim();
  const grades = [...new Set((rosterStudents || []).map((s) => s.grade).filter(Boolean))];
  return grades.length ? grades.join(' و ') : '—';
}

export function resolveRosterSchoolName(appConfig) {
  return String(appConfig?.platformName || '').trim() || 'المدرسة';
}

/** صفحات كشف لجنة واحدة */
export function buildCommitteeRosterPages(committee, allStudents, config = DEFAULT_COMMITTEE_ROSTER_CONFIG) {
  const roster = [...getStudentsInCommittee(committee, allStudents)].sort(compareStudentsBySeatNumber);
  const max = config.maxRows || 25;
  const chunks = chunkArray(roster, max);
  const gradeLabel = resolveCommitteeGradeLabel(committee, roster);
  const committeeNum = committeeHeaderNumber(committee);

  return chunks.map((students, chunkIndex) => ({
    id: `${committee.id}-${chunkIndex}`,
    committeeId: committee.id,
    committeeNumber: committeeNum,
    grade: gradeLabel,
    totalCount: roster.length,
    pageIndex: chunkIndex + 1,
    totalPages: chunks.length,
    globalStartIndex: chunkIndex * max,
    students,
  }));
}

export function buildAllCommitteeRosterPages(committees, allStudents, config = DEFAULT_COMMITTEE_ROSTER_CONFIG) {
  const sorted = [...(committees || [])].sort((a, b) =>
    committeeHeaderNumber(a).localeCompare(committeeHeaderNumber(b), 'ar', { numeric: true })
  );
  return sorted.flatMap((c) => buildCommitteeRosterPages(c, allStudents, config));
}
