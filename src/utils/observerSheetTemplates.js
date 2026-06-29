import jsPDF from 'jspdf';
import { formatCommitteeDisplay } from './attendanceLayout';
import { COMMITTEE_STAGES, committeeLabelWithStage, committeeNumberOnly } from './committeeUtils';
import { resolveExamSchedule, buildSheetMetaFromSchedule, periodLabel } from './examSchedule';
import { resolveCommitteeAssignmentsMap } from './observerAssignments';
import { preloadImages, SEAT_CARD_FONT_FAMILY } from './pdfExport';

export const OBSERVER_SHEET_PREVIEW_WIDTH = 400;

export const OBSERVER_SHEET_STAGES = {
  middle: {
    id: 'middle',
    studentStage: 'متوسط',
    label: 'المرحلة المتوسطة',
    template: '/grade_middle_school.jpeg',
    width: 1240,
    height: 1754,
  },
  secondary: {
    id: 'secondary',
    studentStage: 'ثانوي',
    label: 'المرحلة الثانوية',
    template: '/grade_high_school.jpeg',
    width: 1240,
    height: 1754,
  },
};

const DEFAULT_HEADER_FIELDS = {
  committee: {
    top: 18,
    right: 50,
    fontSize: 1.35,
    color: '#0f172a',
    textAlign: 'center',
    shrinkToFit: true,
    maxWidthPct: 85,
    minFontSize: 0.9,
  },
  room: {
    top: 24,
    right: 50,
    fontSize: 1,
    color: '#334155',
    textAlign: 'center',
    maxWidthPct: 80,
  },
  stageLabel: {
    top: 29,
    right: 50,
    fontSize: 0.9,
    color: '#475569',
    textAlign: 'center',
  },
  observerCount: {
    top: 33,
    right: 50,
    fontSize: 0.85,
    color: '#64748b',
    textAlign: 'center',
  },
};

const DEFAULT_LIST = {
  startTop: 38,
  right: 50,
  rowHeight: 3.2,
  fontSize: 0.95,
  color: '#0f172a',
  textAlign: 'center',
  indexShow: true,
  indexRight: 42,
  nameRight: 50,
  maxRows: 20,
};

export const OBSERVER_FIELD_META = [
  { key: 'committee', label: 'اسم اللجنة' },
  { key: 'room', label: 'القاعة' },
  { key: 'stageLabel', label: 'المرحلة' },
  { key: 'observerCount', label: 'عدد الملاحظين' },
];

/** الكشف المجمع — المادة، اليوم، التاريخ، الفترة + جدول المعلم/اللجنة */
const DEFAULT_SUMMARY_META = {
  subject: {
    top: 13,
    right: 50,
    fontSize: 1.15,
    color: '#0f172a',
    textAlign: 'center',
    shrinkToFit: true,
    maxWidthPct: 88,
    minFontSize: 0.85,
  },
  day: {
    top: 18,
    right: 50,
    fontSize: 0.95,
    color: '#334155',
    textAlign: 'center',
    maxWidthPct: 85,
  },
  date: {
    top: 22.5,
    right: 50,
    fontSize: 0.95,
    color: '#334155',
    textAlign: 'center',
    maxWidthPct: 85,
  },
  period: {
    top: 27,
    right: 50,
    fontSize: 0.95,
    color: '#475569',
    textAlign: 'center',
    maxWidthPct: 85,
  },
};

const DEFAULT_SUMMARY_TABLE = {
  startTop: 32,
  rowHeight: 2.35,
  fontSize: 0.88,
  color: '#0f172a',
  indexShow: false,
  indexRight: 78,
  indexTop: 0,
  indexFontSize: 0.82,
  indexColor: '#64748b',
  nameRight: 55,
  nameTop: 0,
  nameFontSize: 0.88,
  nameColor: '#0f172a',
  nameShrinkToFit: true,
  nameMaxWidthPct: 36,
  nameMinFontSize: 0.65,
  committeeRight: 32,
  committeeTop: 0,
  committeeFontSize: 0.88,
  committeeColor: '#0f172a',
  committeeShrinkToFit: true,
  committeeMaxWidthPct: 22,
  committeeMinFontSize: 0.65,
  maxRowsPerPage: 28,
  /** ضبط كل معلم/صف على حدة — المفتاح rowKey أو رقم الصف */
  rowOverrides: {},
};

/** أعمدة جدول الكشف المجمع — اسم المعلم ورقم اللجنة */
export const OBSERVER_SUMMARY_TABLE_COLUMNS = [
  {
    key: 'index',
    label: 'الترقيم',
    rightKey: 'indexRight',
    topKey: 'indexTop',
    fontKey: 'indexFontSize',
    colorKey: 'indexColor',
    anchor: 'center',
  },
  {
    key: 'name',
    label: 'اسم المعلم',
    rightKey: 'nameRight',
    topKey: 'nameTop',
    fontKey: 'nameFontSize',
    colorKey: 'nameColor',
    anchor: 'center',
  },
  {
    key: 'committee',
    label: 'رقم اللجنة',
    rightKey: 'committeeRight',
    topKey: 'committeeTop',
    fontKey: 'committeeFontSize',
    colorKey: 'committeeColor',
    anchor: 'center',
  },
];

/** موضع صف المعلم على الصفحة (%) — مثل كشوف الطباعة */
export function getObserverSummaryRowTop(table, rowIdx, rowKey) {
  const t = table || DEFAULT_SUMMARY_TABLE;
  const shift = getSummaryRowShift(t, rowKey, rowIdx);
  return (t.startTop ?? 32) + rowIdx * (t.rowHeight ?? 2.35) + (shift.top || 0);
}

/** إزاحة صف معيّن (معلم) */
export function getSummaryRowShift(table, rowKey, rowIdx) {
  const t = table || {};
  const o =
    (rowKey != null && t.rowOverrides?.[rowKey]) ||
    t.rowOverrides?.[rowIdx] ||
    t.rowOverrides?.[String(rowIdx)] ||
    {};
  return {
    top: Number(o.top) || 0,
    right: Number(o.right) || 0,
    fontSize: Number(o.fontSize) || 0,
  };
}

export function normalizeSummaryTable(table) {
  const t = { ...DEFAULT_SUMMARY_TABLE, ...(table || {}), indexShow: false };
  const clean = {};
  Object.entries(t.rowOverrides || {}).forEach(([k, v]) => {
    const top = Math.min(3, Math.max(-3, Number(v?.top) || 0));
    const right = Math.min(3, Math.max(-3, Number(v?.right) || 0));
    const fontSize = Math.min(0.6, Math.max(-0.6, Number(v?.fontSize) || 0));
    if (top || right || fontSize) clean[k] = { top, right, fontSize };
  });
  t.rowOverrides = clean;
  return t;
}

export const OBSERVER_SUMMARY_META_FIELDS = [
  { key: 'subject', label: 'المادة' },
  { key: 'day', label: 'اليوم' },
  { key: 'date', label: 'التاريخ' },
  { key: 'period', label: 'الفترة' },
];

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`تعذّر تحميل الصورة: ${src}`));
    img.src = src;
  });
}

const _dimsCache = {};

export async function ensureObserverStageDimensions(stageId) {
  const def = OBSERVER_SHEET_STAGES[stageId];
  if (!def) throw new Error(`مرحلة غير معروفة: ${stageId}`);
  if (_dimsCache[stageId]) {
    def.width = _dimsCache[stageId].width;
    def.height = _dimsCache[stageId].height;
    return def;
  }
  const img = await loadImageElement(def.template);
  def.width = img.naturalWidth || def.width;
  def.height = img.naturalHeight || def.height;
  _dimsCache[stageId] = { width: def.width, height: def.height };
  return def;
}

export function getObserverStageDef(stageId) {
  const def = OBSERVER_SHEET_STAGES[stageId];
  if (!def) throw new Error(`مرحلة غير معروفة: ${stageId}`);
  return def;
}

export function resolveObserverSummaryLayout(appConfig, stageId) {
  const raw = appConfig?.observerSheets?.[stageId]?.summary || {};
  const meta = {};
  for (const key of Object.keys(DEFAULT_SUMMARY_META)) {
    meta[key] = { ...DEFAULT_SUMMARY_META[key], ...(raw.meta?.[key] || raw[key] || {}) };
  }
  const table = normalizeSummaryTable({ ...DEFAULT_SUMMARY_TABLE, ...(raw.table || {}) });
  return { meta, table };
}

export function resolveObserverSheetLayout(appConfig, stageId) {
  const raw = appConfig?.observerSheets?.[stageId] || {};
  const fields = {};
  for (const key of Object.keys(DEFAULT_HEADER_FIELDS)) {
    fields[key] = { ...DEFAULT_HEADER_FIELDS[key], ...(raw.fields?.[key] || {}) };
  }
  const list = { ...DEFAULT_LIST, ...(raw.list || {}) };
  const summary = resolveObserverSummaryLayout(appConfig, stageId);
  return { fields, list, summary };
}

export function cloneObserverSummaryLayout(summary) {
  const meta = {};
  for (const key of Object.keys(DEFAULT_SUMMARY_META)) {
    meta[key] = { ...DEFAULT_SUMMARY_META[key], ...(summary?.meta?.[key] || {}) };
  }
  return {
    meta,
    table: normalizeSummaryTable(summary?.table),
  };
}

export function cloneObserverSheetLayout(layout) {
  const fields = {};
  for (const key of Object.keys(DEFAULT_HEADER_FIELDS)) {
    fields[key] = { ...DEFAULT_HEADER_FIELDS[key], ...(layout?.fields?.[key] || {}) };
  }
  return {
    fields,
    list: { ...DEFAULT_LIST, ...(layout?.list || {}) },
    summary: cloneObserverSummaryLayout(layout?.summary),
  };
}

export function normalizeObserverSheetsConfig(config) {
  if (!config) return config;
  const next = { ...config };
  const obs = { ...(next.observerSheets || {}) };
  for (const stageId of Object.keys(OBSERVER_SHEET_STAGES)) {
    if (!obs[stageId]) {
      obs[stageId] = {
        fields: { ...DEFAULT_HEADER_FIELDS },
        list: { ...DEFAULT_LIST },
        summary: {
          meta: { ...DEFAULT_SUMMARY_META },
          table: { ...DEFAULT_SUMMARY_TABLE },
        },
      };
    } else {
      obs[stageId] = {
        fields: {
          ...DEFAULT_HEADER_FIELDS,
          ...(obs[stageId].fields || {}),
        },
        list: { ...DEFAULT_LIST, ...(obs[stageId].list || {}) },
        summary: (() => {
          const resolved = resolveObserverSummaryLayout(
            { observerSheets: { [stageId]: obs[stageId] } },
            stageId
          );
          return { meta: resolved.meta, table: resolved.table };
        })(),
      };
    }
  }
  next.observerSheets = obs;
  return next;
}

export function getObserverPixelSize(stageId, previewWidth = OBSERVER_SHEET_PREVIEW_WIDTH) {
  const t = getObserverStageDef(stageId);
  return {
    width: previewWidth,
    height: Math.round((previewWidth * t.height) / t.width),
  };
}

/** صفحات كشوف الملاحظين من توزيع اللجان (حسب اليوم والفترة) */
export function buildObserverSheetPages(committees, observers, assignments, stageId, filters = {}) {
  const stageDef = getObserverStageDef(stageId);
  const studentStage = stageDef.studentStage;
  const assignmentMap = resolveCommitteeAssignmentsMap(assignments, filters);

  const filtered = (committees || [])
    .filter((c) => !c.stage || c.stage === studentStage)
    .sort((a, b) => {
      const ka = String(a.name || '').replace(/\D/g, '') || a.name;
      const kb = String(b.name || '').replace(/\D/g, '') || b.name;
      return String(ka).localeCompare(String(kb), 'ar', { numeric: true });
    });

  return filtered.map((committee) => {
    const obsIds = assignmentMap[committee.id] || [];
    const names = obsIds
      .map((id) => observers.find((o) => o.id === id)?.name)
      .filter(Boolean);
    const stageLabel =
      COMMITTEE_STAGES.find((s) => s.id === committee.stage)?.label ||
      stageDef.label;

    return {
      committeeId: committee.id,
      committee: formatCommitteeDisplay(committee.name),
      committeeNum: committeeNumberOnly(committee),
      committeeFull: committeeLabelWithStage(committee),
      room: committee.room || '—',
      stageLabel,
      sheetStageLabel: stageDef.label,
      observerCount: names.length ? `عدد الملاحظين: ${names.length}` : 'لا يوجد ملاحظون',
      observers: names,
    };
  });
}

function setObserverFont(ctx, fontPx) {
  ctx.font = `900 ${fontPx}px ${SEAT_CARD_FONT_FAMILY}`;
}

function drawObserverText(ctx, text, x, y) {
  const match = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
  const px = match ? parseFloat(match[1]) : 16;
  const stroke = Math.max(0.45, px * 0.045);
  ctx.lineWidth = stroke;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function fitLine(ctx, text, maxW, basePx, minPx) {
  const raw = String(text).trim();
  if (!raw) return { fontPx: basePx, text: raw };
  let fontPx = basePx;
  setObserverFont(ctx, fontPx);
  if (ctx.measureText(raw).width <= maxW) return { fontPx, text: raw };
  for (let i = 0; i < 12; i++) {
    fontPx = Math.max(minPx, fontPx * 0.96);
    setObserverFont(ctx, fontPx);
    if (ctx.measureText(raw).width <= maxW) return { fontPx, text: raw };
    if (fontPx <= minPx) break;
  }
  let t = raw;
  setObserverFont(ctx, minPx);
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return { fontPx: minPx, text: `${t}…` };
}

export function observerFieldStyle(fieldCfg, previewWidth, text = '') {
  if (!fieldCfg) return {};
  const t = previewWidth / OBSERVER_SHEET_PREVIEW_WIDTH;
  let fontPx = Math.round((fieldCfg.fontSize ?? 1) * 16 * t * 10) / 10;
  const maxWidthPct = fieldCfg.maxWidthPct ?? 80;
  const maxWPx = previewWidth * (maxWidthPct / 100);

  if (fieldCfg.shrinkToFit && text) {
    const minPx = Math.round((fieldCfg.minFontSize ?? 0.85) * 16 * t * 10) / 10;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) fontPx = fitLine(ctx, text, maxWPx, fontPx, minPx).fontPx;
  }

  const align = fieldCfg.textAlign || 'right';
  const style = {
    position: 'absolute',
    top: `${fieldCfg.top}%`,
    fontSize: `${fontPx}px`,
    color: fieldCfg.color || '#0f172a',
    fontWeight: 900,
    fontFamily: SEAT_CARD_FONT_FAMILY,
    lineHeight: 1.15,
    textAlign: align,
    whiteSpace: 'nowrap',
    maxWidth: `${maxWidthPct}%`,
    zIndex: 2,
  };

  if (align === 'center') {
    style.right = `${fieldCfg.right ?? 50}%`;
    style.top = `${fieldCfg.top}%`;
    style.transform = 'translate(50%, -50%)';
  } else if (fieldCfg.left != null) {
    style.left = `${fieldCfg.left}%`;
  } else {
    style.right = `${fieldCfg.right ?? 10}%`;
  }
  return style;
}

function paintHeaderField(ctx, canvas, fieldCfg, text, previewWidth) {
  if (!text || !String(text).trim() || !fieldCfg) return;
  const scale = canvas.width / previewWidth;
  const align = fieldCfg.textAlign || 'right';
  let x;
  if (align === 'center') {
    x = canvas.width * ((fieldCfg.right ?? 50) / 100);
  } else if (fieldCfg.left != null) {
    x = (fieldCfg.left / 100) * canvas.width + 6 * scale;
  } else {
    x = canvas.width - ((fieldCfg.right ?? 10) / 100) * canvas.width - 6 * scale;
  }
  const y = (fieldCfg.top / 100) * canvas.height;
  const maxWPx = canvas.width * ((fieldCfg.maxWidthPct ?? 80) / 100);
  const baseFontPx = Math.round((fieldCfg.fontSize ?? 1) * 16 * scale * 10) / 10;

  ctx.fillStyle = fieldCfg.color || '#0f172a';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  if (fieldCfg.shrinkToFit) {
    const minPx = Math.round((fieldCfg.minFontSize ?? 0.85) * 16 * scale * 10) / 10;
    const { fontPx, text: display } = fitLine(ctx, text, maxWPx, baseFontPx, minPx);
    setObserverFont(ctx, fontPx);
    drawObserverText(ctx, display, x, y);
    return;
  }

  setObserverFont(ctx, baseFontPx);
  drawObserverText(ctx, String(text), x, y);
}

function paintObserverList(ctx, canvas, listCfg, observers, previewWidth) {
  const list = observers || [];
  if (!list.length || !listCfg) return;

  const scale = canvas.width / previewWidth;
  const align = listCfg.textAlign || 'center';
  const startTop = listCfg.startTop ?? 38;
  const rowHeight = listCfg.rowHeight ?? 3.2;
  const baseFontPx = Math.round((listCfg.fontSize ?? 0.95) * 16 * scale * 10) / 10;
  const maxRows = listCfg.maxRows ?? 20;
  const color = listCfg.color || '#0f172a';

  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';

  const rows = list.slice(0, maxRows);
  rows.forEach((name, i) => {
    const top = startTop + i * rowHeight;
    const y = (top / 100) * canvas.height;

    if (listCfg.indexShow) {
      const ix = canvas.width * ((listCfg.indexRight ?? 42) / 100);
      setObserverFont(ctx, baseFontPx * 0.9);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748b';
      drawObserverText(ctx, `${i + 1}.`, ix, y);
      ctx.fillStyle = color;
    }

    let x;
    if (align === 'center') {
      x = canvas.width * ((listCfg.nameRight ?? listCfg.right ?? 50) / 100);
    } else {
      x = canvas.width - ((listCfg.nameRight ?? listCfg.right ?? 50) / 100) * canvas.width;
    }
    setObserverFont(ctx, baseFontPx);
    ctx.textAlign = align;
    drawObserverText(ctx, String(name), x, y);
  });
}

export async function renderObserverSheetToCanvas(page, layout, stageId) {
  const stageDef = await ensureObserverStageDimensions(stageId);
  const { fields, list } = layout;

  await preloadImages([stageDef.template]);
  const img = await loadImageElement(stageDef.template);

  const canvas = document.createElement('canvas');
  canvas.width = stageDef.width;
  canvas.height = stageDef.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء لوحة الرسم');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const previewW = OBSERVER_SHEET_PREVIEW_WIDTH;
  const headerData = {
    committee: page.committee,
    room: page.room,
    stageLabel: page.stageLabel,
    observerCount: page.observerCount,
  };

  for (const { key } of OBSERVER_FIELD_META) {
    const val = headerData[key];
    if (val != null && String(val).trim()) {
      paintHeaderField(ctx, canvas, fields[key], String(val), previewW);
    }
  }

  paintObserverList(ctx, canvas, list, page.observers, previewW);

  return canvas;
}

function addCanvasToPdf(pdf, canvas, isNewPage) {
  if (isNewPage) pdf.addPage();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const w = canvas.width;
  const h = canvas.height;
  const pageW = 210;
  const pageH = 297;
  const imgRatio = w / h;
  const pageRatio = pageW / pageH;
  let drawW;
  let drawH;
  let x;
  let y;
  if (Math.abs(imgRatio - pageRatio) < 0.02) {
    drawW = pageW;
    drawH = pageH;
    x = 0;
    y = 0;
  } else if (imgRatio > pageRatio) {
    drawW = pageW;
    drawH = pageW / imgRatio;
    x = 0;
    y = (pageH - drawH) / 2;
  } else {
    drawH = pageH;
    drawW = pageH * imgRatio;
    x = (pageW - drawW) / 2;
    y = 0;
  }
  pdf.addImage(dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
}

export async function exportObserverSheetsToPdf(pages, layout, stageId, filename) {
  const list = Array.isArray(pages) ? pages : [];
  if (!list.length) throw new Error('لا توجد كشوف للتصدير');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < list.length; i++) {
    const canvas = await renderObserverSheetToCanvas(list[i], layout, stageId);
    addCanvasToPdf(pdf, canvas, i > 0);
    if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
  }
  pdf.save(filename);
  return pdf;
}

export function buildSampleObserverPage(stageId) {
  const stageDef = getObserverStageDef(stageId);
  return {
    committee: 'اللجنة 2',
    room: 'قاعة 101',
    stageLabel: stageDef.label,
    observerCount: 'عدد الملاحظين: 3',
    observers: ['أ. محمد العتيبي', 'أ. سارة القحطاني', 'أ. خالد الدوسري'],
  };
}

/** بيانات رأس الكشف المجمع من جدول الفترات */
export function buildObserverSummaryMeta(appConfig, stageId, filters = {}) {
  const stageDef = getObserverStageDef(stageId);
  const schedule = resolveExamSchedule(appConfig?.examSchedule);
  const meta = buildSheetMetaFromSchedule(schedule, {
    stage: stageDef.studentStage,
    grade: 'الكل',
    period: filters.period ?? 1,
    day: filters.day ?? 'الكل',
  });
  return {
    subject: meta.subject || '—',
    day: meta.day || '—',
    date: meta.date || '—',
    period: meta.periodLabel || periodLabel(filters.period) || '—',
    stage: stageDef.label || '—',
  };
}

/** صفوف الجدول: اسم المعلم + رقم اللجنة (حسب اليوم والفترة) */
export function buildObserverSummaryRows(committees, observers, assignments, stageId, filters = {}) {
  const stageDef = getObserverStageDef(stageId);
  const studentStage = stageDef.studentStage;
  const assignmentMap = resolveCommitteeAssignmentsMap(assignments, filters);
  const rows = [];

  for (const committee of committees || []) {
    if (committee.stage && committee.stage !== studentStage) continue;
    const committeeLabel = formatCommitteeDisplay(committee.name);
    const obsIds = assignmentMap[committee.id] || [];
    for (const obsId of obsIds) {
      const name = observers.find((o) => o.id === obsId)?.name;
      if (name) {
        rows.push({
          rowKey: `${obsId}__${committee.id}`,
          observerId: obsId,
          committeeId: committee.id,
          teacherName: name,
          committee: committeeLabel,
          committeeRaw: committee.name,
        });
      }
    }
  }

  return rows.sort((a, b) => {
    const ca = String(a.committee).replace(/\D/g, '') || a.committee;
    const cb = String(b.committee).replace(/\D/g, '') || b.committee;
    if (ca !== cb) return String(ca).localeCompare(String(cb), 'ar', { numeric: true });
    return String(a.teacherName).localeCompare(String(b.teacherName), 'ar', { numeric: true });
  });
}

export function buildSampleSummaryRows() {
  return [
    { rowKey: 'sample-0', teacherName: 'أحمد محمد العتيبي', committee: 'اللجنة 1' },
    { rowKey: 'sample-1', teacherName: 'سارة علي القحطاني', committee: 'اللجنة 1' },
    { rowKey: 'sample-2', teacherName: 'خالد الدوسري', committee: 'اللجنة 2' },
    { rowKey: 'sample-3', teacherName: 'نورة الشمري', committee: 'اللجنة 3' },
  ];
}

function paintSummaryTableCell(ctx, canvas, tableCfg, text, previewWidth, opts) {
  const {
    rightPct,
    fontSizeRem,
    color,
    shrinkToFit,
    maxWidthPct,
    minFontSizeRem,
  } = opts;
  const scale = canvas.width / previewWidth;
  const x = canvas.width * ((rightPct ?? 50) / 100);
  const y = opts.y;
  const baseFontPx = Math.round((fontSizeRem ?? tableCfg.fontSize ?? 0.88) * 16 * scale * 10) / 10;
  const maxWPx = canvas.width * ((maxWidthPct ?? 30) / 100);

  ctx.fillStyle = color || tableCfg.color || '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let fontPx = baseFontPx;
  let display = String(text ?? '').trim();
  if (!display) return;

  if (shrinkToFit) {
    const minPx = Math.round((minFontSizeRem ?? 0.65) * 16 * scale * 10) / 10;
    ({ fontPx, text: display } = fitLine(ctx, display, maxWPx, baseFontPx, minPx));
  }

  setObserverFont(ctx, fontPx);
  drawObserverText(ctx, display, x, y);
}

function summaryCellY(canvas, rowTopPct, colTopPct) {
  return ((rowTopPct + (colTopPct || 0)) / 100) * canvas.height;
}

function paintSummaryTableRow(ctx, canvas, tableCfg, row, rowIndex, previewWidth) {
  const rowKey = row.rowKey ?? String(rowIndex);
  const shift = getSummaryRowShift(tableCfg, rowKey, rowIndex);
  const rowTop = getObserverSummaryRowTop(tableCfg, rowIndex, rowKey);
  const rightAdj = shift.right || 0;
  const baseFontRem = (tableCfg.fontSize ?? 0.88) + (shift.fontSize || 0);

  if (tableCfg.indexShow !== false) {
    paintSummaryTableCell(ctx, canvas, tableCfg, String(rowIndex + 1), previewWidth, {
      rightPct: (tableCfg.indexRight ?? 78) + rightAdj,
      fontSizeRem: tableCfg.indexFontSize ?? baseFontRem,
      color: tableCfg.indexColor ?? '#64748b',
      shrinkToFit: false,
      y: summaryCellY(canvas, rowTop, tableCfg.indexTop),
    });
  }

  paintSummaryTableCell(ctx, canvas, tableCfg, row.teacherName, previewWidth, {
    rightPct: (tableCfg.nameRight ?? 55) + rightAdj,
    fontSizeRem: tableCfg.nameFontSize ?? baseFontRem,
    color: tableCfg.nameColor ?? tableCfg.color ?? '#0f172a',
    shrinkToFit: tableCfg.nameShrinkToFit !== false,
    maxWidthPct: tableCfg.nameMaxWidthPct ?? 36,
    minFontSizeRem: tableCfg.nameMinFontSize ?? 0.65,
    y: summaryCellY(canvas, rowTop, tableCfg.nameTop),
  });

  paintSummaryTableCell(ctx, canvas, tableCfg, row.committee, previewWidth, {
    rightPct: (tableCfg.committeeRight ?? 32) + rightAdj,
    fontSizeRem: tableCfg.committeeFontSize ?? baseFontRem,
    color: tableCfg.committeeColor ?? tableCfg.color ?? '#0f172a',
    shrinkToFit: tableCfg.committeeShrinkToFit !== false,
    maxWidthPct: tableCfg.committeeMaxWidthPct ?? 22,
    minFontSizeRem: tableCfg.committeeMinFontSize ?? 0.65,
    y: summaryCellY(canvas, rowTop, tableCfg.committeeTop),
  });
}

/** تقسيم الصفوف على صفحات */
export function paginateSummaryRows(rows, maxPerPage = 28) {
  const list = rows || [];
  const max = Math.max(1, maxPerPage);
  const pages = [];
  for (let i = 0; i < list.length; i += max) {
    pages.push(list.slice(i, i + max));
  }
  if (!pages.length) pages.push([]);
  return pages;
}

export async function renderObserverSummaryToCanvas(
  metaData,
  tableRows,
  summaryLayout,
  stageId,
  pageIndex = 0,
  rowOffset = 0
) {
  const stageDef = await ensureObserverStageDimensions(stageId);
  const { meta, table } = summaryLayout;

  await preloadImages([stageDef.template]);
  const img = await loadImageElement(stageDef.template);

  const canvas = document.createElement('canvas');
  canvas.width = stageDef.width;
  canvas.height = stageDef.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء لوحة الرسم');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const previewW = OBSERVER_SHEET_PREVIEW_WIDTH;
  for (const { key } of OBSERVER_SUMMARY_META_FIELDS) {
    const val = metaData[key];
    if (val != null && String(val).trim()) {
      paintHeaderField(ctx, canvas, meta[key], String(val), previewW);
    }
  }

  const maxPerPage = table.maxRowsPerPage ?? DEFAULT_SUMMARY_TABLE.maxRowsPerPage;
  const slice = (tableRows || []).slice(0, maxPerPage);
  slice.forEach((row, i) => {
    paintSummaryTableRow(ctx, canvas, table, row, rowOffset + i, previewW);
  });

  return canvas;
}

export async function exportObserverSummaryToPdf(
  appConfig,
  committees,
  observers,
  assignments,
  stageId,
  filters,
  filename
) {
  const summaryLayout = resolveObserverSummaryLayout(appConfig, stageId);
  const metaData = buildObserverSummaryMeta(appConfig, stageId, filters);
  const allRows = buildObserverSummaryRows(committees, observers, assignments, stageId, filters);
  if (!allRows.length) {
    throw new Error('لا توجد إسنادات ملاحظين. أكمل التوزيع من «توزيع الملاحظين» أولاً.');
  }

  const maxPerPage = summaryLayout.table.maxRowsPerPage ?? 28;
  const chunks = paginateSummaryRows(allRows, maxPerPage);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    const canvas = await renderObserverSummaryToCanvas(
      metaData,
      chunks[i],
      summaryLayout,
      stageId,
      i,
      offset
    );
    addCanvasToPdf(pdf, canvas, i > 0);
    offset += chunks[i].length;
    if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
  }
  pdf.save(filename);
  return pdf;
}

/** كشف مجمع + كشوف اللجان في ملف واحد */
export async function exportObserverFullPackToPdf(
  appConfig,
  committees,
  observers,
  assignments,
  stageId,
  filters,
  filename
) {
  const layout = resolveObserverSheetLayout(appConfig, stageId);
  const committeePages = buildObserverSheetPages(committees, observers, assignments, stageId, filters);
  const summaryLayout = layout.summary;
  const metaData = buildObserverSummaryMeta(appConfig, stageId, filters);
  const allRows = buildObserverSummaryRows(committees, observers, assignments, stageId, filters);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let pageIndex = 0;

  if (allRows.length) {
    const maxPerPage = summaryLayout.table.maxRowsPerPage ?? 28;
    const chunks = paginateSummaryRows(allRows, maxPerPage);
    let offset = 0;
    for (const chunk of chunks) {
      const canvas = await renderObserverSummaryToCanvas(
        metaData,
        chunk,
        summaryLayout,
        stageId,
        pageIndex,
        offset
      );
      addCanvasToPdf(pdf, canvas, pageIndex > 0);
      pageIndex++;
      offset += chunk.length;
    }
  }

  for (const page of committeePages) {
    const canvas = await renderObserverSheetToCanvas(page, layout, stageId);
    addCanvasToPdf(pdf, canvas, pageIndex > 0);
    pageIndex++;
  }

  if (!pageIndex) throw new Error('لا توجد بيانات للتصدير');
  pdf.save(filename);
  return pdf;
}
