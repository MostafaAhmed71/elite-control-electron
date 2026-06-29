import { committeeNumberOnly } from './committeeUtils';
import { mergeManagerFooterLayout } from './committeeRosterManagerFooter';
import { resolveRosterSchoolName } from './committeeRosterPrint';
import {
  buildObserverSheetPages,
  buildObserverSummaryMeta,
  buildObserverSummaryRows,
  OBSERVER_SHEET_STAGES,
} from './observerSheetTemplates';

const STORAGE_KEY = 'observerRosterPrintConfig_v1';

/** قالب مدمج — بدون صور خارجية */
export const DEFAULT_OBSERVER_ROSTER_CONFIG = {
  version: 1,
  committeeTitle: 'كشف ملاحظي اللجنة',
  summaryTitle: 'الكشف المجمع لملاحظي الاختبار',
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
  committeeMaxRows: 20,
  summaryMaxRows: 25,
  signatureColumnLabel: 'التوقيع',
  table: {
    fontSizeRem: 0.82,
    headerFontSizeRem: 0.88,
    rowHeightMm: 7.2,
  },
};

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function mergeObserverRosterConfig(parsed) {
  const def = DEFAULT_OBSERVER_ROSTER_CONFIG;
  if (!parsed || typeof parsed !== 'object') {
    return { ...def, table: { ...def.table }, managerFooter: mergeManagerFooterLayout(null) };
  }
  return {
    ...def,
    ...parsed,
    table: { ...def.table, ...parsed.table },
    managerFooter: mergeManagerFooterLayout(parsed.managerFooter),
  };
}

export function loadObserverRosterConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return mergeObserverRosterConfig(null);
    return mergeObserverRosterConfig(JSON.parse(saved));
  } catch {
    return mergeObserverRosterConfig(null);
  }
}

export function saveObserverRosterConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, version: 1 }));
}

function safeRosterFilePart(text, maxLen = 32) {
  return (
    String(text ?? '')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, maxLen) || 'مرحلة'
  );
}

/** اسم ملف PDF للتصدير — يتضمن المرحلة */
export function buildObserverRosterPdfFilename(mode, stageId, filters = {}) {
  const stagePart = safeRosterFilePart(
    OBSERVER_SHEET_STAGES[stageId]?.studentStage ||
      OBSERVER_SHEET_STAGES[stageId]?.label ||
      stageId
  );
  const stamp = new Date().toISOString().slice(0, 10);
  const day =
    filters.day && filters.day !== 'الكل' ? safeRosterFilePart(filters.day, 16) : '';
  const periodPart = parseInt(filters.period, 10) === 2 ? 'ف2' : parseInt(filters.period, 10) === 1 ? 'ف1' : '';
  const tail = [day, periodPart, stamp].filter(Boolean).join('_');

  if (mode === 'summary') return `كشف_مجمع_ملاحظين_${stagePart}_${tail}.pdf`;
  if (mode === 'committee') return `كشوف_ملاحظين_لجان_${stagePart}_${tail}.pdf`;
  return `كشوف_ملاحظين_${stagePart}_كاملة_${tail}.pdf`;
}

/** صفحات كشف لجنة واحدة (قائمة الملاحظين) */
export function buildObserverCommitteeRosterPages(pages, config = DEFAULT_OBSERVER_ROSTER_CONFIG) {
  const max = config.committeeMaxRows || 20;
  const list = Array.isArray(pages) ? pages : [];

  return list.flatMap((page) => {
    const observers = page.observers || [];
    if (!observers.length) return [];
    const chunks = chunkArray(observers, max);
    return chunks.map((chunk, chunkIndex) => ({
      id: `${page.committeeId}-${chunkIndex}`,
      type: 'committee',
      committeeId: page.committeeId,
      committeeNumber: page.committeeNum || committeeNumberOnly(page.committee),
      committeeLabel: page.committee,
      room: page.room || '—',
      stageLabel: page.stageLabel || '—',
      sheetStageLabel: page.sheetStageLabel || page.stageLabel || '—',
      observers: chunk,
      observerCount: observers.length,
      pageIndex: chunkIndex + 1,
      totalPages: chunks.length,
      globalStartIndex: chunkIndex * max,
    }));
  });
}

/** صفحات الكشف المجمع (جدول المعلم + اللجنة) */
export function buildObserverSummaryRosterPages(rows, meta, config = DEFAULT_OBSERVER_ROSTER_CONFIG) {
  const max = config.summaryMaxRows || 25;
  const list = Array.isArray(rows) ? rows : [];
  const chunks = chunkArray(list, max);

  return chunks.map((chunk, chunkIndex) => ({
    id: `summary-${chunkIndex}`,
    type: 'summary',
    meta: meta || {},
    rows: chunk.map((row, idx) => ({
      ...row,
      serial: chunkIndex * max + idx + 1,
      committeeNum:
        committeeNumberOnly(row.committeeRaw || row.committee) ||
        String(row.committee || '').trim(),
    })),
    pageIndex: chunkIndex + 1,
    totalPages: chunks.length,
    globalStartIndex: chunkIndex * max,
  }));
}

export function buildObserverRosterData({
  committees,
  observers,
  assignments,
  appConfig,
  stageId,
  filters = {},
  config = loadObserverRosterConfig(),
}) {
  const committeeSource = buildObserverSheetPages(committees, observers, assignments, stageId, filters);
  const summaryRows = buildObserverSummaryRows(committees, observers, assignments, stageId, filters);
  const summaryMeta = buildObserverSummaryMeta(appConfig, stageId, filters);

  return {
    committeePages: buildObserverCommitteeRosterPages(committeeSource, config),
    summaryPages: buildObserverSummaryRosterPages(summaryRows, summaryMeta, config),
    summaryRows,
    committeeSource,
  };
}

export { resolveRosterSchoolName };
