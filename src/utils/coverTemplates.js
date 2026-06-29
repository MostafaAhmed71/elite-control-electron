import {
  migrateFieldBindings,
  resolveCoverFieldData,
  buildDefaultPreviewContext,
} from './coverDataSources';
import jsPDF from 'jspdf';
import { preloadImages, SEAT_CARD_FONT_FAMILY } from './pdfExport';

const COVER_PDF_W_MM = 210;
const COVER_PDF_H_MM = 297;

/** مرحلة الغلاف → قيمة stage في سجل الطالب */
export function coverStageToStudentStage(coverStage) {
  if (coverStage === 'middle') return 'متوسط';
  if (coverStage === 'secondary') return 'ثانوي';
  return null;
}

export const COVER_STAGES = {
  middle: { id: 'middle', label: 'المرحلة المتوسطة' },
  secondary: { id: 'secondary', label: 'المرحلة الثانوية' },
};

export const COVER_PREVIEW_WIDTH = 400;

const COMMITTEE_FIELDS = [
  { key: 'committee', label: 'اللجنة', binding: 'committees.committeeName', color: '#0f172a' },
  { key: 'grade', label: 'الصف', binding: 'students.grade', color: '#334155' },
  { key: 'subject', label: 'المادة', binding: 'printSheets.subject', color: '#1e293b' },
  { key: 'examDate', label: 'التاريخ', binding: 'printSheets.examDateLine', color: '#475569' },
  { key: 'period', label: 'الفترة', binding: 'printSheets.periodLabel', color: '#475569' },
  {
    key: 'studentCount',
    label: 'عدد الطلاب',
    binding: 'committees.studentCountLabel',
    color: '#64748b',
  },
];

const COMMITTEE_LAYOUT = {
  committee: {
    top: 36,
    right: 50,
    fontSize: 1.45,
    color: '#0f172a',
    textAlign: 'center',
    shrinkToFit: true,
    maxWidthPct: 88,
    minFontSize: 0.9,
  },
  grade: { top: 43, right: 50, fontSize: 1.05, color: '#334155', textAlign: 'center', maxWidthPct: 85 },
  subject: { top: 49, right: 50, fontSize: 0.95, color: '#1e293b', textAlign: 'center', maxWidthPct: 85 },
  examDate: { top: 55, right: 50, fontSize: 0.9, color: '#475569', textAlign: 'center' },
  period: { top: 61, right: 50, fontSize: 0.9, color: '#475569', textAlign: 'center' },
  studentCount: { top: 67, right: 50, fontSize: 0.85, color: '#64748b', textAlign: 'center' },
};

export const DEFAULT_COVER_LIBRARY_ITEMS = [
  {
    id: 'cover-envelope-secondary',
    name: 'غلاف مظروف اللجنة',
    description: 'غلاف خارجي للمظروف — المرحلة الثانوية',
    stage: 'secondary',
    template: '/tha.jpeg',
    width: 864,
    height: 1222,
    fields: COMMITTEE_FIELDS,
    createdAt: null,
  },
  {
    id: 'cover-envelope-middle',
    name: 'غلاف مظروف اللجنة',
    description: 'غلاف خارجي للمظروف — المرحلة المتوسطة',
    stage: 'middle',
    template: '/m.jpeg',
    width: 864,
    height: 1222,
    fields: [...COMMITTEE_FIELDS],
    createdAt: null,
  },
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

export function createCoverTemplateId() {
  return `cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function slugifyFieldKey(label, existingKeys = []) {
  const arMap = {
    اللجنة: 'committee',
    الصف: 'grade',
    المادة: 'subject',
    التاريخ: 'examDate',
    الفترة: 'period',
    'عدد الطلاب': 'studentCount',
    عنوان: 'title',
    ملاحظات: 'notes',
  };
  if (arMap[label?.trim()]) {
    let k = arMap[label.trim()];
    let n = 1;
    while (existingKeys.includes(k)) k = `${arMap[label.trim()]}_${++n}`;
    return k;
  }
  let base =
    String(label || 'field')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w\u0600-\u06FF]/g, '') || 'field';
  if (!/^[a-zA-Z_]/.test(base)) base = `f_${base}`;
  let key = base;
  let i = 1;
  while (existingKeys.includes(key)) key = `${base}_${++i}`;
  return key;
}

export function buildDefaultFieldLayout(index, total) {
  const step = total > 1 ? Math.min(10, 55 / (total - 1)) : 0;
  return {
    top: Math.round((28 + index * step) * 10) / 10,
    right: 50,
    fontSize: index === 0 ? 1.35 : 0.95,
    color: '#0f172a',
    textAlign: 'center',
    maxWidthPct: 88,
    shrinkToFit: index === 0,
    minFontSize: 0.85,
  };
}

export function buildDefaultLayoutFromFields(fields = []) {
  const out = {};
  fields.forEach((f, i) => {
    out[f.key] = {
      ...buildDefaultFieldLayout(i, fields.length),
      color: f.color || '#0f172a',
    };
  });
  return out;
}

export function buildSampleDataFromFields(fields = [], previewCtx = null) {
  if (previewCtx) return resolveCoverFieldData(fields, previewCtx);
  const out = {};
  for (const f of fields) {
    out[f.key] = f.label || '—';
  }
  return out;
}

/** دمج المكتبة الافتراضية + ترحيل الإعدادات القديمة */
export function normalizeCoverConfig(config) {
  if (!config) return config;
  const next = { ...config };
  const items = [...(next.coverLibrary?.items || [])];

  if (items.length === 0) {
    next.coverLibrary = {
      items: DEFAULT_COVER_LIBRARY_ITEMS.map((t) => ({
        ...t,
        fields: migrateFieldBindings(t.fields),
      })),
    };
  } else {
    next.coverLibrary = {
      items: items.map((t) => ({
        ...t,
        fields: migrateFieldBindings(t.fields),
      })),
    };
  }

  const covers = { ...(next.covers || {}) };
  const libItems = next.coverLibrary.items;

  if (covers['committee-envelope'] && !covers['cover-envelope-secondary']) {
    covers['cover-envelope-secondary'] = covers['committee-envelope'];
    delete covers['committee-envelope'];
  }

  for (const t of libItems) {
    if (!covers[t.id]) {
      if (t.id === 'cover-envelope-secondary' || t.id === 'cover-envelope-middle') {
        covers[t.id] = { ...COMMITTEE_LAYOUT };
      } else {
        covers[t.id] = buildDefaultLayoutFromFields(t.fields || []);
      }
    }
  }

  next.covers = covers;
  return next;
}

export function getCoverLibrary(config) {
  const normalized = normalizeCoverConfig(config);
  return normalized?.coverLibrary?.items || [];
}

export function getCoverTemplate(config, templateId, previewCtx = null) {
  const items = getCoverLibrary(config);
  const t = items.find((x) => x.id === templateId);
  if (!t) throw new Error(`قالب غير معروف: ${templateId}`);
  const layout = resolveCoverLayout(config, templateId);
  return {
    ...t,
    enabled: true,
    defaultLayout: layout,
    sampleData: buildSampleDataFromFields(t.fields, previewCtx),
  };
}

export { buildDefaultPreviewContext, resolveCoverFieldData };

export function getCoverTemplatesByStage(config, stage) {
  return getCoverLibrary(config).filter((t) => t.stage === stage);
}

export function getCoverPixelSize(template, previewWidth = COVER_PREVIEW_WIDTH) {
  const height = Math.round((previewWidth * template.height) / template.width);
  return { width: previewWidth, height };
}

export function resolveCoverLayout(config, templateId) {
  const items = getCoverLibrary(config);
  const t = items.find((x) => x.id === templateId);
  if (!t) return {};
  const defaults = buildDefaultLayoutFromFields(t.fields || []);
  const raw = config?.covers?.[templateId] || {};
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    out[key] = {
      ...defaults[key],
      ...raw[key],
      ...(raw[key]?.shrinkToFit !== false && defaults[key]?.shrinkToFit
        ? { shrinkToFit: true }
        : {}),
    };
  }
  for (const key of Object.keys(raw)) {
    if (!out[key]) out[key] = raw[key];
  }
  return out;
}

export function cloneCoverLayout(layout, template) {
  const fields = template?.fields || [];
  const defaults = buildDefaultLayoutFromFields(fields);
  const out = {};
  for (const key of Object.keys(defaults)) {
    out[key] = { ...defaults[key], ...layout?.[key] };
  }
  for (const key of Object.keys(layout || {})) {
    if (!out[key]) out[key] = layout[key];
  }
  return out;
}

/** قراءة ملف صورة وضغطها للتخزين في Supabase */
export async function fileToCoverImage(file, maxWidth = 1400) {
  const read = () =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('تعذّر قراءة الملف'));
      r.readAsDataURL(file);
    });

  const dataUrl = await read();
  const img = await loadImageElement(dataUrl);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (!w || !h) throw new Error('أبعاد الصورة غير صالحة');

  if (w > maxWidth) {
    h = Math.round((h * maxWidth) / w);
    w = maxWidth;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر معالجة الصورة');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const isPng = file.type === 'image/png';
  const outUrl = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', isPng ? 1 : 0.88);
  return { dataUrl: outUrl, width: w, height: h };
}

function setCoverFont(ctx, fontPx) {
  ctx.font = `900 ${fontPx}px ${SEAT_CARD_FONT_FAMILY}`;
}

function drawCoverText(ctx, text, x, y) {
  const match = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
  const px = match ? parseFloat(match[1]) : 16;
  const stroke = Math.max(0.5, px * 0.05);
  ctx.lineWidth = stroke;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function truncateLine(ctx, text, maxW) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

function fitCoverLine(ctx, text, maxW, basePx, minPx) {
  const raw = String(text).trim();
  if (!raw) return { fontPx: basePx, text: raw };
  let fontPx = basePx;
  setCoverFont(ctx, fontPx);
  if (ctx.measureText(raw).width <= maxW) return { fontPx, text: raw };
  for (let i = 0; i < 12; i++) {
    fontPx = Math.max(minPx, fontPx * 0.96);
    setCoverFont(ctx, fontPx);
    if (ctx.measureText(raw).width <= maxW) return { fontPx, text: raw };
    if (fontPx <= minPx) break;
  }
  setCoverFont(ctx, minPx);
  return { fontPx: minPx, text: truncateLine(ctx, raw, maxW) };
}

export function coverFieldStyle(fieldCfg, previewWidth, text = '') {
  if (!fieldCfg) return {};
  const t = previewWidth / COVER_PREVIEW_WIDTH;
  let fontPx = Math.round((fieldCfg.fontSize ?? 1) * 16 * t * 10) / 10;
  const maxWidthPct = fieldCfg.maxWidthPct ?? 80;
  const maxWPx = previewWidth * (maxWidthPct / 100);

  if (fieldCfg.shrinkToFit && text) {
    const minPx = Math.round((fieldCfg.minFontSize ?? 0.85) * 16 * t * 10) / 10;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) fontPx = fitCoverLine(ctx, text, maxWPx, fontPx, minPx).fontPx;
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
    transform: align === 'center' ? 'translateX(50%)' : 'none',
  };

  if (align === 'center') {
    style.right = `${fieldCfg.right ?? 50}%`;
  } else if (fieldCfg.left != null) {
    style.left = `${fieldCfg.left}%`;
  } else {
    style.right = `${fieldCfg.right ?? 10}%`;
  }
  return style;
}

function paintCoverField(ctx, canvas, fieldCfg, text, previewWidth) {
  if (!text || !String(text).trim() || !fieldCfg) return;
  const scale = canvas.width / previewWidth;
  const pad = 6 * scale;
  const align = fieldCfg.textAlign || 'right';
  let x;
  if (align === 'center') {
    x = canvas.width * ((fieldCfg.right ?? 50) / 100);
  } else if (fieldCfg.left != null) {
    x = (fieldCfg.left / 100) * canvas.width + pad;
  } else {
    x = canvas.width - ((fieldCfg.right ?? 10) / 100) * canvas.width - pad;
  }
  const y = (fieldCfg.top / 100) * canvas.height;
  const maxWPx = canvas.width * ((fieldCfg.maxWidthPct ?? 80) / 100);
  const baseFontPx = Math.round((fieldCfg.fontSize ?? 1) * 16 * scale * 10) / 10;

  ctx.fillStyle = fieldCfg.color || '#0f172a';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  if (fieldCfg.shrinkToFit) {
    const minPx = Math.round((fieldCfg.minFontSize ?? 0.85) * 16 * scale * 10) / 10;
    const { fontPx, text: display } = fitCoverLine(ctx, text, maxWPx, baseFontPx, minPx);
    setCoverFont(ctx, fontPx);
    drawCoverText(ctx, display, x, y);
    return;
  }

  setCoverFont(ctx, baseFontPx);
  drawCoverText(ctx, truncateLine(ctx, String(text), maxWPx), x, y);
}

export async function renderCoverToCanvas(config, templateId, data, layoutOrConfig, width, height) {
  const t = getCoverTemplate(config, templateId);
  const cfg =
    typeof layoutOrConfig === 'object' && layoutOrConfig?.covers
      ? resolveCoverLayout(layoutOrConfig, templateId)
      : layoutOrConfig;

  await preloadImages([t.template]);
  const img = await loadImageElement(t.template);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء لوحة الرسم');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const previewW = COVER_PREVIEW_WIDTH;
  for (const { key } of t.fields || []) {
    const val = data?.[key];
    if (val != null && String(val).trim()) {
      paintCoverField(ctx, canvas, cfg[key], String(val), previewW);
    }
  }

  return canvas;
}

function addCoverCanvasToPdf(pdf, canvas, isNewPage = false) {
  if (isNewPage) pdf.addPage();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  if (!dataUrl || dataUrl.length < 100) {
    throw new Error('فشل تحويل الغلاف إلى PDF');
  }
  const w = canvas.width;
  const h = canvas.height;
  const imgRatio = w / h;
  const pageRatio = COVER_PDF_W_MM / COVER_PDF_H_MM;
  let drawW;
  let drawH;
  let x;
  let y;
  if (Math.abs(imgRatio - pageRatio) < 0.02) {
    drawW = COVER_PDF_W_MM;
    drawH = COVER_PDF_H_MM;
    x = 0;
    y = 0;
  } else if (imgRatio > pageRatio) {
    drawW = COVER_PDF_W_MM;
    drawH = COVER_PDF_W_MM / imgRatio;
    x = 0;
    y = (COVER_PDF_H_MM - drawH) / 2;
  } else {
    drawH = COVER_PDF_H_MM;
    drawW = COVER_PDF_H_MM * imgRatio;
    x = (COVER_PDF_W_MM - drawW) / 2;
    y = 0;
  }
  pdf.addImage(dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
}

/** تصدير غلاف واحد كملف PDF */
export async function exportCoverToPdf(config, templateId, data, layoutOrConfig, filename) {
  const t = getCoverTemplate(config, templateId);
  const canvas = await renderCoverToCanvas(
    config,
    templateId,
    data,
    layoutOrConfig,
    t.width,
    t.height
  );
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  addCoverCanvasToPdf(pdf, canvas, false);
  pdf.save(filename);
  return pdf;
}

/**
 * تصدير عدة أغلفة في PDF واحد (صفحة لكل لجنة)
 * jobs: { config, templateId, data, layout }[]
 */
export async function exportCoversBatchToPdf(jobs, filename) {
  const list = Array.isArray(jobs) ? jobs : [];
  if (list.length === 0) throw new Error('لا توجد أغلفة للتصدير');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  for (let i = 0; i < list.length; i++) {
    const { config, templateId, data, layout } = list[i];
    const t = getCoverTemplate(config, templateId);
    const canvas = await renderCoverToCanvas(
      config,
      templateId,
      data,
      layout,
      t.width,
      t.height
    );
    addCoverCanvasToPdf(pdf, canvas, i > 0);
    if (i % 2 === 1) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  pdf.save(filename);
  return pdf;
}

export function upsertCoverTemplate(config, templateItem, isNew) {
  const normalized = normalizeCoverConfig(config);
  const items = [...(normalized.coverLibrary?.items || [])];
  const idx = items.findIndex((x) => x.id === templateItem.id);
  const item = {
    ...templateItem,
    createdAt: templateItem.createdAt || new Date().toISOString(),
  };

  if (idx >= 0) items[idx] = item;
  else items.push(item);

  const covers = { ...(normalized.covers || {}) };
  if (isNew || !covers[item.id]) {
    covers[item.id] = buildDefaultLayoutFromFields(item.fields || []);
  } else {
    const prev = covers[item.id] || {};
    const nextLayout = buildDefaultLayoutFromFields(item.fields || []);
    const merged = {};
    for (const f of item.fields || []) {
      merged[f.key] = { ...nextLayout[f.key], ...prev[f.key] };
    }
    covers[item.id] = merged;
  }

  return {
    ...normalized,
    coverLibrary: { items },
    covers,
  };
}

export function removeCoverTemplate(config, templateId) {
  const normalized = normalizeCoverConfig(config);
  const items = (normalized.coverLibrary?.items || []).filter((x) => x.id !== templateId);
  const covers = { ...(normalized.covers || {}) };
  delete covers[templateId];
  return {
    ...normalized,
    coverLibrary: { items },
    covers,
  };
}
