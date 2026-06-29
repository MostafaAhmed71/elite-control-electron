import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import jsPDF from 'jspdf';
import { compareStudentsBySeatNumber } from './seatNumberGenerator';
import {
  ATTENDANCE_TEMPLATE,
  EXAM_META_HEADER_KEYS,
  formatCommitteeDisplay,
  getRowShift,
  mergeSheetMeta,
  resolveAttendanceConfig,
  resolvePrintSheetConfig,
} from './attendanceLayout';

/** دقة تصدير الكشوف — ملء صفحة A4 بدون تصغير */
const ATTENDANCE_EXPORT_SCALE = 2;

/** Scale capped to avoid huge canvases that crash jsPDF / the browser. */
export const getPdfExportScale = () => Math.min(window.devicePixelRatio || 1, 1.5);

export const yieldToUI = () => new Promise((resolve) => setTimeout(resolve, 0));

export const waitForDomPaint = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

/** Preload same-origin images used in templates so html2canvas can read them. */
export async function preloadImages(urls = []) {
  const unique = [...new Set(urls.filter(Boolean))];
  await Promise.all(
    unique.map(
      (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = src;
        })
    )
  );
}

const defaultHtml2canvasOptions = {
  useCORS: true,
  allowTaint: false,
  backgroundColor: '#ffffff',
  logging: false,
  foreignObjectRendering: false,
  scrollX: 0,
  scrollY: 0,
};

/** Tailwind v4 uses oklab/oklch — html2canvas 1.x cannot parse them. */
const UNSUPPORTED_COLOR_RE = /oklab|oklch|color-mix\(/i;

const INLINE_PROPS_FOR_CAPTURE = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'flex',
  'flex-direction',
  'flex-wrap',
  'align-items',
  'justify-content',
  'gap',
  'font-size',
  'font-weight',
  'font-family',
  'line-height',
  'text-align',
  'white-space',
  'overflow',
  'opacity',
  'visibility',
  'color',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'box-shadow',
  'transform',
  'object-fit',
];

function sanitizeCSSValue(prop, value) {
  if (!value) return null;
  if (!UNSUPPORTED_COLOR_RE.test(value)) return value;
  if (prop === 'background-image' || prop === 'box-shadow') return null;
  if (prop.includes('color')) return 'rgb(0, 0, 0)';
  return null;
}

/** Strip stylesheets only — use for export DOM built with inline styles (no Tailwind classes). */
function stripStylesheetsOnly(doc) {
  doc.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove());
}

/** Inline resolved styles (rgb) then drop stylesheets so html2canvas never sees oklab rules. */
function prepareCloneForHtml2Canvas(doc, root) {
  const win = doc.defaultView;
  if (!win || !root) return;

  const ancestors = [];
  let parent = root.parentElement;
  while (parent && parent !== doc.documentElement) {
    ancestors.unshift(parent);
    parent = parent.parentElement;
  }

  const nodes = [...ancestors, root, ...root.querySelectorAll('*')];

  for (const el of nodes) {
    if (!(el instanceof win.HTMLElement)) continue;
    const computed = win.getComputedStyle(el);

    for (const prop of INLINE_PROPS_FOR_CAPTURE) {
      const raw = computed.getPropertyValue(prop);
      const val = sanitizeCSSValue(prop, raw);
      if (val && val !== 'none' && val !== 'auto' && val !== 'normal') {
        el.style.setProperty(prop, val);
      }
    }
  }

  stripStylesheetsOnly(doc);
}

const SEATING_CARDS_PER_PAGE = 8;

/** A4 @ 96dpi — html2canvas needs px sizes when the node is off-screen. */
const PX_PER_MM = 96 / 25.4;
const A4_WIDTH_PX = Math.round(210 * PX_PER_MM);
const A4_HEIGHT_PX = Math.round(297 * PX_PER_MM);

/** قالب بطاقة رقم الجلوس — public/school_logo.jpeg */
export const SEAT_CARD_TEMPLATE = '/school_logo.jpeg';

/** أبعاد القالب الأصلية school_logo.jpeg (1376×768) */
export const SEAT_CARD_NATURAL_WIDTH = 1376;
export const SEAT_CARD_NATURAL_HEIGHT = 768;

/** عرض المعاينة في المحرر — الارتفاع يُحسب من نسبة القالب الحقيقية */
export const SEAT_CARD_PREVIEW_WIDTH = 720;

export function getSeatCardPixelSize(previewWidth = SEAT_CARD_PREVIEW_WIDTH) {
  const height = Math.round((previewWidth * SEAT_CARD_NATURAL_HEIGHT) / SEAT_CARD_NATURAL_WIDTH);
  return { width: previewWidth, height };
}

export const SEAT_CARD_EXPORT_HEIGHT = getSeatCardPixelSize().height;
const CARD_WIDTH_PX = SEAT_CARD_PREVIEW_WIDTH;
const CARD_HEIGHT_PX = SEAT_CARD_EXPORT_HEIGHT;

/** قالب مركز الإشعارات — public/w.jpeg (منفصل عن بطاقات الجلوس) */
export const NOTIFY_CARD_TEMPLATE = '/w.jpeg';
export const NOTIFY_CARD_NATURAL_WIDTH = 1391;
export const NOTIFY_CARD_NATURAL_HEIGHT = 768;
export const NOTIFY_CARD_PREVIEW_WIDTH = 720;

export function getNotifyCardPixelSize(previewWidth = NOTIFY_CARD_PREVIEW_WIDTH) {
  const height = Math.round((previewWidth * NOTIFY_CARD_NATURAL_HEIGHT) / NOTIFY_CARD_NATURAL_WIDTH);
  return { width: previewWidth, height };
}

/** مواضع حقول بطاقة الإشعارات (قالب w.jpeg) */
export const DEFAULT_NOTIFY_CARD_LAYOUT = {
  name: {
    top: 22,
    right: 12,
    fontSize: 1.1,
    color: '#111827',
    textAlign: 'right',
    shrinkToFit: true,
    maxWidthPct: 55,
    minFontSize: 0.85,
    bold: false,
  },
  seatNumber: {
    top: 38,
    right: 12,
    fontSize: 1.8,
    color: '#4f46e5',
    textAlign: 'right',
    bold: false,
  },
  grade: {
    top: 52,
    right: 12,
    fontSize: 0.95,
    color: '#1f2937',
    textAlign: 'right',
    bold: false,
  },
  committee: {
    top: 66,
    right: 12,
    fontSize: 1.05,
    color: '#065f46',
    textAlign: 'right',
    bold: false,
  },
};

const EXPORT_HOST_STYLE = [
  'position:fixed',
  'left:-12000px',
  'top:0',
  'visibility:visible',
  'opacity:1',
  'pointer-events:none',
  'z-index:-1',
  'overflow:visible',
    ].join(';');

async function waitForImagesInElement(root) {
  const imgs = [...(root?.querySelectorAll('img') || [])];
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  );
}

async function flushLayout(el) {
  void el?.offsetHeight;
  await yieldToUI();
  await waitForDomPaint(80);
}

/** خط عريض للبطاقة — يظهر أوضح في Canvas والمعاينة */
export const SEAT_CARD_FONT_FAMILY = '"Arial Black", "Segoe UI", Tahoma, Arial, sans-serif';

function setSeatCardCanvasFont(ctx, fontPx) {
  ctx.font = `bold ${fontPx}px ${SEAT_CARD_FONT_FAMILY}`;
}

function drawSeatCardBoldText(ctx, text, x, y) {
  const match = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
  const px = match ? parseFloat(match[1]) : 16;
  const stroke = Math.max(0.4, px * 0.04);
  ctx.lineWidth = stroke;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

const NOTIFY_CARD_REGULAR_FONT = '"Segoe UI", Tahoma, Arial, sans-serif';

function notifyFieldBold(fieldCfg) {
  return fieldCfg?.bold === true;
}

/** خط بطاقة الإشعارات — عادي افتراضياً (bold: true في إعداد الحقل للتفعيل) */
function setNotifyCardCanvasFont(ctx, fontPx, bold = false) {
  if (bold) {
    ctx.font = `900 ${fontPx}px ${SEAT_CARD_FONT_FAMILY}`;
  } else {
    ctx.font = `normal ${fontPx}px ${NOTIFY_CARD_REGULAR_FONT}`;
  }
}

function drawNotifyCardText(ctx, text, x, y, bold = false) {
  if (!bold) {
    ctx.fillText(text, x, y);
    return;
  }
  const match = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
  const px = match ? parseFloat(match[1]) : 16;
  const stroke = Math.max(0.55, px * 0.055);
  ctx.lineWidth = stroke;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function fitNotifyTextOnOneLine(ctx, text, maxWidth, baseFontPx, minFontPx = 14, bold = false) {
  const raw = String(text).trim();
  if (!raw) return { fontPx: baseFontPx, text: raw };
  let fontPx = baseFontPx;
  setNotifyCardCanvasFont(ctx, fontPx, bold);
  if (ctx.measureText(raw).width <= maxWidth) {
    return { fontPx, text: raw };
  }
  for (let i = 0; i < 12; i++) {
    fontPx = Math.max(minFontPx, fontPx * 0.96);
    setNotifyCardCanvasFont(ctx, fontPx, bold);
    if (ctx.measureText(raw).width <= maxWidth) {
      return { fontPx, text: raw };
    }
    if (fontPx <= minFontPx) break;
  }
  setNotifyCardCanvasFont(ctx, minFontPx, bold);
  return { fontPx: minFontPx, text: truncateLineToWidth(ctx, raw, maxWidth) };
}

/** مواضع الحقول داخل المربعات البيضاء على يسار القالب (1376×768) */
export const DEFAULT_SEAT_CARD_LAYOUT = {
  name: {
    top: 42,
    left: 11,
    fontSize: 1.05,
    color: '#0f172a',
    textAlign: 'left',
    shrinkToFit: true,
    maxWidthPct: 46,
    minFontSize: 0.88,
    bold: false,
  },
  grade: { top: 52, left: 14, fontSize: 0.95, color: '#0f172a', textAlign: 'left', bold: false },
  seatNumber: { top: 62, left: 14, fontSize: 2.2, color: '#2563eb', textAlign: 'left', bold: false },
};

function truncateLineToWidth(ctx, text, maxWidth) {
  let t = String(text);
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/** تصغير الخط تدريجياً — بحد أدنى مقروء (لا يصبح صغيراً جداً) */
function fitTextOnOneLine(ctx, text, maxWidth, baseFontPx, minFontPx = 14) {
  const raw = String(text).trim();
  if (!raw) return { fontPx: baseFontPx, text: raw };
  let fontPx = baseFontPx;
  setSeatCardCanvasFont(ctx, fontPx);
  if (ctx.measureText(raw).width <= maxWidth) {
    return { fontPx, text: raw };
  }
  for (let i = 0; i < 12; i++) {
    fontPx = Math.max(minFontPx, fontPx * 0.96);
    setSeatCardCanvasFont(ctx, fontPx);
    if (ctx.measureText(raw).width <= maxWidth) {
      return { fontPx, text: raw };
    }
    if (fontPx <= minFontPx) break;
  }
  setSeatCardCanvasFont(ctx, minFontPx);
  return { fontPx: minFontPx, text: truncateLineToWidth(ctx, raw, maxWidth) };
}

/** أنماط موحّدة للمعاينة والتصدير (بدون translateY الذي يختلف في html2canvas) */
export function seatCardFieldStyle(fieldCfg, cardWidthPx = SEAT_CARD_PREVIEW_WIDTH, text = '') {
  if (!fieldCfg) return {};
  const scale = cardWidthPx / SEAT_CARD_PREVIEW_WIDTH;
  let fontPx = Math.round((fieldCfg.fontSize ?? 1) * 16 * scale * 10) / 10;
  const maxWidthPct = fieldCfg.maxWidthPct ?? 38;
  const maxWPx = cardWidthPx * (maxWidthPct / 100);

  if (fieldCfg.shrinkToFit && text) {
    const minPx = Math.round((fieldCfg.minFontSize ?? 0.88) * 16 * scale * 10) / 10;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      fontPx = fitTextOnOneLine(ctx, text, maxWPx, fontPx, minPx).fontPx;
    }
  }
  const fieldBold = fieldCfg.bold === true;
  const style = {
    position: 'absolute',
    top: `${fieldCfg.top}%`,
    fontSize: `${fontPx}px`,
    color: fieldCfg.color || '#0f172a',
    fontWeight: fieldBold ? 'bold' : 'normal',
    fontFamily: fieldBold ? SEAT_CARD_FONT_FAMILY : NOTIFY_CARD_REGULAR_FONT,
    lineHeight: '1.15',
    textAlign: fieldCfg.textAlign || 'left',
    whiteSpace: 'nowrap',
    maxWidth: `${maxWidthPct}%`,
    overflow: fieldCfg.shrinkToFit ? 'visible' : 'hidden',
    textOverflow: fieldCfg.shrinkToFit ? 'clip' : 'ellipsis',
    zIndex: 2,
    margin: 0,
    padding: 0,
    transform: 'none',
    boxSizing: 'border-box',
  };
  if (fieldCfg.left != null) {
    style.left = `${fieldCfg.left}%`;
  } else {
    style.right = `${fieldCfg.right ?? 10}%`;
  }
  return style;
}

/** معاينة بطاقة الإشعارات */
export function notifyCardFieldStyle(fieldCfg, cardWidthPx = NOTIFY_CARD_PREVIEW_WIDTH, text = '') {
  const scale = cardWidthPx / NOTIFY_CARD_PREVIEW_WIDTH;
  let fontPx = Math.round((fieldCfg.fontSize ?? 1) * 16 * scale * 10) / 10;
  const maxWidthPct = fieldCfg.maxWidthPct ?? 38;
  const maxWPx = cardWidthPx * (maxWidthPct / 100);
  const bold = notifyFieldBold(fieldCfg);

  if (fieldCfg.shrinkToFit && text) {
    const minPx = Math.round((fieldCfg.minFontSize ?? 0.88) * 16 * scale * 10) / 10;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      fontPx = fitNotifyTextOnOneLine(ctx, text, maxWPx, fontPx, minPx, bold).fontPx;
    }
  }

  return {
    ...seatCardFieldStyle(fieldCfg, cardWidthPx, text),
    fontSize: `${fontPx}px`,
    fontWeight: bold ? 900 : 'normal',
    fontFamily: bold ? SEAT_CARD_FONT_FAMILY : NOTIFY_CARD_REGULAR_FONT,
  };
}

/** يقرأ seatCard فقط — لا يخلط مع إعدادات seating (قالب لجان مختلف). */
export function resolveSeatCardLayout(config) {
  let raw = config?.seatCard;
  if (!raw && config?.name && config?.seatNumber && !config?.platformName) {
    raw = config;
  }
  raw = raw || {};
  return {
    ...DEFAULT_SEAT_CARD_LAYOUT,
    ...raw,
    name: { ...DEFAULT_SEAT_CARD_LAYOUT.name, ...raw.name, wrap: false, shrinkToFit: true },
    grade: { ...DEFAULT_SEAT_CARD_LAYOUT.grade, ...raw.grade },
    seatNumber: { ...DEFAULT_SEAT_CARD_LAYOUT.seatNumber, ...raw.seatNumber },
  };
}

/**
 * رسم القالب + البيانات على Canvas (موثوق — لا يعتمد على html2canvas).
 */
export async function renderSeatCardToCanvas(student, layoutOrConfig, width, height) {
  const cfg = resolveSeatCardLayout(layoutOrConfig);
  await preloadImages([SEAT_CARD_TEMPLATE]);
  const img = await loadImageElement(SEAT_CARD_TEMPLATE);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء لوحة الرسم');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const scale = canvas.width / SEAT_CARD_PREVIEW_WIDTH;

  const paintField = (fieldCfg, text) => {
    if (text == null || !String(text).trim() || !fieldCfg) return;
    const bold = fieldCfg.bold === true;
    const pad = 6 * scale;
    let x;
    let align;
    if (fieldCfg.left != null) {
      x = (fieldCfg.left / 100) * canvas.width + pad;
      align = 'left';
    } else {
      x = canvas.width - ((fieldCfg.right ?? 10) / 100) * canvas.width - pad;
      align = 'right';
    }
    const y = (fieldCfg.top / 100) * canvas.height;
    const maxWPx = canvas.width * ((fieldCfg.maxWidthPct ?? 38) / 100);
    const baseFontPx = Math.round((fieldCfg.fontSize ?? 1) * 16 * scale * 10) / 10;

    ctx.fillStyle = fieldCfg.color || '#0f172a';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    if (!bold) {
      ctx.font = `normal ${baseFontPx}px ${NOTIFY_CARD_REGULAR_FONT}`;
      if (fieldCfg.shrinkToFit) {
        const minPx = Math.round((fieldCfg.minFontSize ?? 0.88) * 16 * scale * 10) / 10;
        let fontPx = baseFontPx;
        let display = String(text).trim();
        ctx.font = `normal ${fontPx}px ${NOTIFY_CARD_REGULAR_FONT}`;
        while (display.length > 1 && ctx.measureText(display).width > maxWPx && fontPx > minPx) {
          fontPx = Math.max(minPx, fontPx * 0.96);
          ctx.font = `normal ${fontPx}px ${NOTIFY_CARD_REGULAR_FONT}`;
        }
        if (ctx.measureText(display).width > maxWPx) {
          display = truncateLineToWidth(ctx, display, maxWPx);
        }
        ctx.fillText(display, x, y);
        return;
      }
      let display = String(text);
      while (display.length > 1 && ctx.measureText(display).width > maxWPx) {
        display = display.slice(0, -2) + '…';
      }
      ctx.fillText(display, x, y);
      return;
    }

    if (fieldCfg.shrinkToFit) {
      const minPx = Math.round((fieldCfg.minFontSize ?? 0.88) * 16 * scale * 10) / 10;
      const { fontPx, text: display } = fitTextOnOneLine(ctx, text, maxWPx, baseFontPx, minPx);
      setSeatCardCanvasFont(ctx, fontPx);
      drawSeatCardBoldText(ctx, display, x, y);
      return;
    }

    setSeatCardCanvasFont(ctx, baseFontPx);
    let display = String(text);
    while (display.length > 1 && ctx.measureText(display).width > maxWPx) {
      display = display.slice(0, -2) + '…';
    }
    drawSeatCardBoldText(ctx, display, x, y);
  };

  paintField(cfg.name, student.name);
  paintField(cfg.grade, student.grade || '');
  paintField(cfg.seatNumber, student.seatNumber);

  return canvas;
}

/** يقرأ notifyCard فقط — لا يخلط مع seatCard */
export function resolveNotifyCardLayout(config) {
  const raw = config?.notifyCard || {};
  return {
    ...DEFAULT_NOTIFY_CARD_LAYOUT,
    ...raw,
    name: { ...DEFAULT_NOTIFY_CARD_LAYOUT.name, ...raw.name, wrap: false, shrinkToFit: true },
    grade: { ...DEFAULT_NOTIFY_CARD_LAYOUT.grade, ...raw.grade },
    seatNumber: { ...DEFAULT_NOTIFY_CARD_LAYOUT.seatNumber, ...raw.seatNumber },
    committee: { ...DEFAULT_NOTIFY_CARD_LAYOUT.committee, ...raw.committee },
  };
}

function paintCardFieldOnCanvas(ctx, canvas, fieldCfg, text, previewWidth) {
  if (text == null || !String(text).trim() || !fieldCfg) return;
  const bold = notifyFieldBold(fieldCfg);
  const scale = canvas.width / previewWidth;
  const pad = 6 * scale;
  let x;
  let align;
  if (fieldCfg.left != null) {
    x = (fieldCfg.left / 100) * canvas.width + pad;
    align = 'left';
  } else {
    x = canvas.width - ((fieldCfg.right ?? 10) / 100) * canvas.width - pad;
    align = 'right';
  }
  const y = (fieldCfg.top / 100) * canvas.height;
  const maxWPx = canvas.width * ((fieldCfg.maxWidthPct ?? 38) / 100);
  const baseFontPx = Math.round((fieldCfg.fontSize ?? 1) * 16 * scale * 10) / 10;

  ctx.fillStyle = fieldCfg.color || '#0f172a';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  if (fieldCfg.shrinkToFit) {
    const minPx = Math.round((fieldCfg.minFontSize ?? 0.88) * 16 * scale * 10) / 10;
    const { fontPx, text: display } = fitNotifyTextOnOneLine(ctx, text, maxWPx, baseFontPx, minPx, bold);
    setNotifyCardCanvasFont(ctx, fontPx, bold);
    drawNotifyCardText(ctx, display, x, y, bold);
    return;
  }

  setNotifyCardCanvasFont(ctx, baseFontPx, bold);
  let display = String(text);
  while (display.length > 1 && ctx.measureText(display).width > maxWPx) {
    display = display.slice(0, -2) + '…';
  }
  drawNotifyCardText(ctx, display, x, y, bold);
}

/** رسم بطاقة مركز الإشعارات (قالب w.jpeg) */
export async function renderNotifyCardToCanvas(student, layoutOrConfig, width, height) {
  const cfg = resolveNotifyCardLayout(layoutOrConfig);
  await preloadImages([NOTIFY_CARD_TEMPLATE]);
  const img = await loadImageElement(NOTIFY_CARD_TEMPLATE);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء لوحة الرسم');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  paintCardFieldOnCanvas(ctx, canvas, cfg.name, student.name, NOTIFY_CARD_PREVIEW_WIDTH);
  paintCardFieldOnCanvas(ctx, canvas, cfg.seatNumber, student.seatNumber, NOTIFY_CARD_PREVIEW_WIDTH);
  paintCardFieldOnCanvas(ctx, canvas, cfg.grade, student.grade || '', NOTIFY_CARD_PREVIEW_WIDTH);
  if (student.committee) {
    paintCardFieldOnCanvas(
      ctx,
      canvas,
      cfg.committee,
      formatCommitteeDisplay(student.committee),
      NOTIFY_CARD_PREVIEW_WIDTH
    );
  }

  return canvas;
}

/** تحميل بطاقة مركز الإشعارات (w.jpeg) كملف JPEG */
export async function downloadNotifyCardJpeg(student, layoutOrConfig, filename) {
  const { width, height } = getNotifyCardPixelSize();
  const scale = 2;
  const canvas = await renderNotifyCardToCanvas(
    student,
    layoutOrConfig,
    width * scale,
    height * scale
  );
  const blob = await canvasToJpegBlob(canvas, 0.92);
  const name =
    filename ||
    `بطاقة_جلوس_${String(student?.name || 'طالب')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 36)}.jpg`;
  downloadBlob(blob, name);
  return blob;
}

function uniqueZipEntryName(baseName, used) {
  let name = baseName;
  let n = 1;
  while (used.has(name)) {
    const stem = baseName.replace(/\.jpe?g$/i, '');
    name = `${stem}_${n}.jpg`;
    n += 1;
  }
  used.add(name);
  return name;
}

/**
 * تحميل كل بطاقات الإشعارات في ملف ZIP واحد
 * @param {object[]} students
 * @param {object} layoutOrConfig
 * @param {string} zipFilename
 * @param {{ onProgress?: (p: { current: number, total: number }) => void, filenameFor?: (s: object) => string }} [options]
 */
export async function downloadNotifyCardsAsZip(students, layoutOrConfig, zipFilename, options = {}) {
  const list = groupStudentsByCommittee(students).flatMap((g) => g.students);
  if (!list.length) throw new Error('لا توجد بطاقات للتصدير');

  const { width, height } = getNotifyCardPixelSize();
  const scale = 2;
  const zip = new JSZip();
  const used = new Set();
  const filenameFor =
    options.filenameFor ||
    ((s) =>
      `بطاقة_${String(s?.name || 'طالب')
        .trim()
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 36)}${s?.seatNumber ? `_جلوس${String(s.seatNumber).replace(/[\\/:*?"<>|]/g, '_')}` : ''}.jpg`);

  let ok = 0;
  const errors = [];

  for (let i = 0; i < list.length; i++) {
    const student = list[i];
    options.onProgress?.({ current: i + 1, total: list.length });
    try {
      const canvas = await renderNotifyCardToCanvas(
        student,
        layoutOrConfig,
        width * scale,
        height * scale
      );
      const blob = await canvasToJpegBlob(canvas, 0.92);
      const entry = uniqueZipEntryName(filenameFor(student), used);
      zip.file(entry, blob);
      ok++;
    } catch (err) {
      errors.push({ student, message: err?.message || String(err) });
    }
    await yieldToUI();
  }

  if (ok === 0) {
    throw new Error('فشل إنشاء جميع البطاقات');
  }

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  downloadBlob(zipBlob, zipFilename.endsWith('.zip') ? zipFilename : `${zipFilename}.zip`);

  return { ok, fail: errors.length, errors };
}

export const NOTIFY_CARDS_PER_PAGE = 8;

/** تجميع 8 بطاقات إشعارات في صفحة A4 (شبكة 2×4) */
async function composeNotifyCardsPage(studentsSlice, layoutOrConfig, options = {}) {
  const previewW = options.cardWidth ?? NOTIFY_CARD_PREVIEW_WIDTH;
  const { width: cardW, height: cardH } = getNotifyCardPixelSize(previewW);
  const scale = options.scale ?? 2;
  const cardsPerPage = options.cardsPerPage ?? NOTIFY_CARDS_PER_PAGE;

  const pageW = Math.round(A4_WIDTH_PX * scale);
  const pageH = Math.round(A4_HEIGHT_PX * scale);
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = pageW;
  pageCanvas.height = pageH;
  const ctx = pageCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageW, pageH);

  if (cardsPerPage === 1 && studentsSlice[0]) {
    const cardCanvas = await renderNotifyCardToCanvas(
      studentsSlice[0],
      layoutOrConfig,
      Math.round(cardW * scale),
      Math.round(cardH * scale)
    );
    const x = Math.round((pageW - cardCanvas.width) / 2);
    const y = Math.round((pageH - cardCanvas.height) / 2);
    ctx.drawImage(cardCanvas, x, y);
    return pageCanvas;
  }

  const pad = Math.round(10 * PX_PER_MM * scale);
  const gap = Math.round(8 * PX_PER_MM * scale);
  const innerW = pageW - pad * 2;
  const innerH = pageH - pad * 2;
  const cellW = Math.floor((innerW - gap) / 2);
  const cellH = Math.floor((innerH - gap * 3) / 4);
  const scaleCell = Math.min(cellW / cardW, cellH / cardH);
  const scaledW = Math.max(1, Math.floor(cardW * scaleCell));
  const scaledH = Math.max(1, Math.floor(cardH * scaleCell));

  for (let j = 0; j < cardsPerPage; j++) {
    const student = studentsSlice[j];
    if (!student) continue;
    const col = j % 2;
    const row = Math.floor(j / 2);
    const cellX = pad + col * (cellW + gap);
    const cellY = pad + row * (cellH + gap);
    const cardCanvas = await renderNotifyCardToCanvas(student, layoutOrConfig, scaledW, scaledH);
    const offsetX = cellX + Math.floor((cellW - scaledW) / 2);
    const offsetY = cellY + Math.floor((cellH - scaledH) / 2);
    ctx.drawImage(cardCanvas, offsetX, offsetY);
  }

  return pageCanvas;
}

/**
 * تصدير بطاقات مركز الإشعارات PDF — 8 بطاقات في كل صفحة A4
 */
export async function exportNotifyCardsToPdf(students, layoutOrConfig, options = {}) {
  const list = sortStudentsBySeatForExport(students);
  if (!list.length) throw new Error('لا توجد بطاقات للتصدير');

  const filename = options.filename ?? 'بطاقات_الجلوس.pdf';
  const onProgress = options.onProgress;
  const cardsPerPage = options.cardsPerPage ?? NOTIFY_CARDS_PER_PAGE;
  const totalPages = Math.ceil(list.length / cardsPerPage);
  const captureScale = options.scale ?? 2;
  const captureQuality = options.quality ?? 0.96;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let p = 0; p < totalPages; p++) {
    await yieldToUI();
    onProgress?.({
      page: p + 1,
      totalPages,
      current: Math.min((p + 1) * cardsPerPage, list.length),
      total: list.length,
      percent: Math.round(((p + 1) / totalPages) * 100),
    });

    const slice = list.slice(p * cardsPerPage, p * cardsPerPage + cardsPerPage);
    const pageCanvas = await composeNotifyCardsPage(slice, layoutOrConfig, {
      cardWidth: options.cardWidth ?? NOTIFY_CARD_PREVIEW_WIDTH,
      cardsPerPage,
      scale: captureScale,
    });

    const dataUrl = pageCanvas.toDataURL('image/jpeg', captureQuality);
    if (p > 0) pdf.addPage();
    pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297);
  }

  pdf.save(filename);
  return pdf;
}

function safeExportFilePart(s) {
  return String(s ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 40) || 'بدون_تسمية';
}

function sortStudentsBySeatForExport(students) {
  return [...(students || [])].sort(compareStudentsBySeatNumber);
}

/** تجميع الطلاب حسب اللجنة */
export function groupStudentsByCommittee(students) {
  const map = new Map();
  for (const s of students || []) {
    const key = String(s?.committee || '').trim() || '__none__';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return a.localeCompare(b, 'ar', { numeric: true });
    })
    .map(([key, list]) => ({
      committeeKey: key,
      committeeLabel: key === '__none__' ? 'بدون_لجنة' : key,
      students: sortStudentsBySeatForExport(list),
    }));
}

/**
 * تصدير PDF منفصل لكل لجنة (8 بطاقات/صفحة A4)
 */
export async function exportNotifyCardsPdfPerCommittee(students, layoutOrConfig, options = {}) {
  let groups = groupStudentsByCommittee(students).filter((g) => g.students.length > 0);
  const keys = options.committeeKeys;
  if (keys && keys.size > 0) {
    groups = groups.filter((g) => keys.has(g.committeeKey));
  }
  if (!groups.length) throw new Error('لا توجد لجان للتصدير');

  const date = options.dateSuffix ?? new Date().toISOString().slice(0, 10);
  const cardsPerPage = options.cardsPerPage ?? NOTIFY_CARDS_PER_PAGE;
  let exported = 0;

  for (let i = 0; i < groups.length; i++) {
    const { committeeLabel, students: list } = groups[i];
    await yieldToUI();
    options.onCommitteeStart?.({
      committee: committeeLabel,
      committeeIndex: i + 1,
      totalCommittees: groups.length,
      studentCount: list.length,
    });

    const stagePart = options.stageSuffix ? `${safeExportFilePart(options.stageSuffix)}_` : '';
    const filename = `بطاقات_${stagePart}لجنة_${safeExportFilePart(committeeLabel)}_${date}.pdf`;
    await exportNotifyCardsToPdf(list, layoutOrConfig, {
      filename,
      cardsPerPage,
      onProgress: (p) =>
        options.onProgress?.({
          ...p,
          committee: committeeLabel,
          committeeIndex: i + 1,
          totalCommittees: groups.length,
        }),
    });
    exported++;
    await yieldToUI();
  }

  return { fileCount: exported, groups };
}

/** Build one seating card: template image + sharp text overlay. */
export function buildSeatingCardElement(student, layout, size = null) {
  const cfg = resolveSeatCardLayout(layout);
  const w = size?.width ?? CARD_WIDTH_PX;
  const h = size?.height ?? CARD_HEIGHT_PX;

  const card = document.createElement('div');
  card.dataset.pdfExport = 'minimal';
  card.style.cssText = [
    'position:relative',
    `width:${w}px`,
    `height:${h}px`,
    'overflow:visible',
    'background:#ffffff',
    'box-sizing:border-box',
    `font-family:${SEAT_CARD_FONT_FAMILY}`,
    'direction:rtl',
  ].join(';');

  const template = document.createElement('img');
  template.src = SEAT_CARD_TEMPLATE;
  template.crossOrigin = 'anonymous';
  template.alt = '';
  template.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block;';
  card.appendChild(template);

  const addField = (fieldCfg, text) => {
    if (text == null || String(text).trim() === '' || !fieldCfg) return;
    const el = document.createElement('div');
    el.textContent = String(text);
    Object.assign(el.style, seatCardFieldStyle(fieldCfg, w));
    card.appendChild(el);
  };

  addField(cfg.name, student.name);
  addField(cfg.grade, student.grade || '');
  addField(cfg.seatNumber, student.seatNumber);

  return card;
}

export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** تحميل Blob — أنسب لملفات JPEG (تجنّب data URL التالف). */
export function downloadBlob(blob, filename) {
  if (!blob || blob.size < 500) {
    throw new Error('ملف الصورة فارغ أو تالف');
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 500);
}

export function canvasToJpegBlob(canvas, quality = 0.95) {
  return new Promise((resolve, reject) => {
    if (!canvas?.width || !canvas?.height) {
      reject(new Error('فشل التقاط الصورة'));
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size < 500) {
          reject(new Error('فشل إنشاء ملف JPEG'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`تعذّر تحميل القالب: ${src}`));
    img.src = src;
  });
}

/**
 * نسخة البطاقة خارج الشاشة — يتجنّب قصّ الزاوية عندما تكون المعاينة داخل modal/transform.
 */
function mountLivePreviewForCapture(element) {
  const w = element.offsetWidth || CARD_WIDTH_PX;
  const h = element.offsetHeight || CARD_HEIGHT_PX;
  const host = document.createElement('div');
  host.style.cssText = EXPORT_HOST_STYLE;
  document.body.appendChild(host);

  const frame = document.createElement('div');
  frame.dataset.pdfExport = 'minimal';
  frame.style.cssText = [
    'position:relative',
    `width:${w}px`,
    `height:${h}px`,
    'overflow:hidden',
    'background:#ffffff',
    'box-sizing:border-box',
  ].join(';');

  const clone = element.cloneNode(true);
  clone.removeAttribute('class');
  clone.style.cssText = [
    'position:relative',
    'width:100%',
    'height:100%',
    'max-width:none',
    'margin:0',
    'transform:none',
    'box-sizing:border-box',
    'overflow:hidden',
    'border:none',
    'border-radius:0',
    'box-shadow:none',
  ].join(';');
  clone.querySelectorAll('[data-export-hide]').forEach((n) => n.remove());
  clone.querySelectorAll('[data-seat-card-field]').forEach((el) => {
    el.style.border = 'none';
    el.style.background = 'transparent';
    el.style.padding = '0';
    el.style.boxShadow = 'none';
    el.style.cursor = 'default';
  });

  frame.appendChild(clone);
  host.appendChild(frame);
  return { host, frame };
}

/** إزالة عناصر واجهة المحرر قبل الالتقاط (المعاينة = التصدير). */
function stripEditorChromeInClone(doc, root) {
  if (!root) return;
  root.querySelectorAll('[data-export-hide]').forEach((n) => n.remove());
  root.querySelectorAll('[data-seat-card-field]').forEach((el) => {
    el.style.border = 'none';
    el.style.background = 'transparent';
    el.style.padding = '0';
    el.style.boxShadow = 'none';
    el.style.cursor = 'default';
  });
}

/**
 * تصدير العنصر الظاهر في المعاينة كما هو (WYSIWYG).
 */
export async function exportElementAsJpegFile(element, filename, options = {}) {
  if (!element) throw new Error('عنصر المعاينة غير موجود');

  await preloadImages([SEAT_CARD_TEMPLATE]);
  const { host, frame } = mountLivePreviewForCapture(element);

  try {
    await waitForImagesInElement(frame);
    await flushLayout(frame);
    await waitForDomPaint(300);

    const { canvas } = await captureElementAsJpeg(frame, {
      scale: options.scale ?? 2,
      quality: options.quality ?? 0.95,
      minimalClone: true,
      format: 'jpeg',
      stripEditorChrome: true,
    });

    const blob = await canvasToJpegBlob(canvas, options.quality ?? 0.95);
    downloadBlob(blob, filename);
    return blob;
  } finally {
    host.remove();
  }
}

/** PDF صفحة واحدة من عنصر المعاينة مباشرة */
export async function exportElementToPdfFile(element, filename, options = {}) {
  if (!element) throw new Error('عنصر المعاينة غير موجود');

  await preloadImages([SEAT_CARD_TEMPLATE]);
  const w = element.offsetWidth || CARD_WIDTH_PX;
  const h = element.offsetHeight || CARD_HEIGHT_PX;
  const { host, frame } = mountLivePreviewForCapture(element);

  try {
    await waitForImagesInElement(frame);
    await flushLayout(frame);
    await waitForDomPaint(300);

    const { dataUrl } = await captureElementAsJpeg(frame, {
      scale: options.scale ?? 2,
      quality: options.quality ?? 0.96,
      minimalClone: true,
      format: 'jpeg',
      stripEditorChrome: true,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const pxToMm = 25.4 / 96;
    const imgWmm = w * pxToMm;
    const imgHmm = h * pxToMm;
    const margin = 12;
    const fit = Math.min((pageW - margin * 2) / imgWmm, (pageH - margin * 2) / imgHmm, 1);
    const drawWmm = imgWmm * fit;
    const drawHmm = imgHmm * fit;
    const x = (pageW - drawWmm) / 2;
    const y = (pageH - drawHmm) / 2;
    pdf.addImage(dataUrl, 'JPEG', x, y, drawWmm, drawHmm);
    pdf.save(filename);
    return pdf;
  } finally {
    host.remove();
  }
}

/**
 * تصدير من المعاينة: قالب كامل + بيانات (Canvas) باستخدام seatCard المحفوظ.
 */
export async function exportFromLivePreview(_previewEl, job, config, exportOptions = {}) {
  const students = job.students ?? [];
  if (students.length === 0) {
    throw new Error('لا يوجد طالب للتصدير');
  }

  const layout = config;

  if (job.type === 'jpeg') {
    return exportSeatingCardAsJpeg(students[0], layout, {
      filename: job.filename,
      scale: 2,
      width: CARD_WIDTH_PX,
      height: CARD_HEIGHT_PX,
    });
  }

  const count = job.count ?? students.length;
  if (job.type === 'pdf' && count <= 1) {
    return exportSeatingCardAsPdf(students[0], layout, {
      filename: job.filename,
      scale: 2,
      width: CARD_WIDTH_PX,
      height: CARD_HEIGHT_PX,
    });
  }

  return exportSeatingCardsToPdf(students, layout, {
    filename: job.filename,
    cardsPerPage: job.cardsPerPage ?? 8,
    cardWidth: CARD_WIDTH_PX,
    cardHeight: CARD_HEIGHT_PX,
    onProgress: exportOptions.onProgress,
  });
}

/** تصدير بطاقة واحدة JPG — قالب + بيانات عبر Canvas. */
export async function exportSeatingCardAsJpeg(student, layout, options = {}) {
  const w = options.width ?? CARD_WIDTH_PX;
  const h = options.height ?? CARD_HEIGHT_PX;
  const jpegQuality = options.quality ?? 0.95;
  const scale = options.scale ?? 2;
  const seat = String(student.seatNumber || 'student').replace(/\D/g, '') || 'student';
  const filename = options.filename ?? `seat_card_${seat}.jpg`;

  const canvas = await renderSeatCardToCanvas(student, layout, w * scale, h * scale);
  const blob = await canvasToJpegBlob(canvas, jpegQuality);
  downloadBlob(blob, filename);
  return blob;
}

/** تصدير بطاقة واحدة PDF — قالب + بيانات عبر Canvas. */
export async function exportSeatingCardAsPdf(student, layout, options = {}) {
  const w = options.width ?? CARD_WIDTH_PX;
  const h = options.height ?? CARD_HEIGHT_PX;
  const scale = options.scale ?? 2;
  const filename = options.filename ?? 'seat_card.pdf';
  const quality = options.quality ?? 0.96;

  const canvas = await renderSeatCardToCanvas(student, layout, w * scale, h * scale);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const pxToMm = 25.4 / 96;
  const imgWmm = canvas.width * pxToMm;
  const imgHmm = canvas.height * pxToMm;
  const margin = 12;
  const fit = Math.min((pageW - margin * 2) / imgWmm, (pageH - margin * 2) / imgHmm, 1);
  const drawWmm = imgWmm * fit;
  const drawHmm = imgHmm * fit;
  const x = (pageW - drawWmm) / 2;
  const y = (pageH - drawHmm) / 2;
  pdf.addImage(dataUrl, 'JPEG', x, y, drawWmm, drawHmm);
  pdf.save(filename);
  return pdf;
}

/** @deprecated استخدم exportSeatingCardAsJpeg */
export const exportSeatingCardAsPng = exportSeatingCardAsJpeg;

/** تجميع عدة بطاقات في صفحة A4 واحدة (Canvas). */
async function composeSeatCardsPage(studentsSlice, config, options = {}) {
  const cardW = options.cardWidth ?? CARD_WIDTH_PX;
  const cardH = options.cardHeight ?? CARD_HEIGHT_PX;
  const scale = options.scale ?? 2;
  const cardsPerPage = options.cardsPerPage ?? SEATING_CARDS_PER_PAGE;

  const pageW = Math.round(A4_WIDTH_PX * scale);
  const pageH = Math.round(A4_HEIGHT_PX * scale);
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = pageW;
  pageCanvas.height = pageH;
  const ctx = pageCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageW, pageH);

  if (cardsPerPage === 1 && studentsSlice[0]) {
    const cardCanvas = await renderSeatCardToCanvas(
      studentsSlice[0],
      config,
      Math.round(cardW * scale),
      Math.round(cardH * scale)
    );
    const x = Math.round((pageW - cardCanvas.width) / 2);
    const y = Math.round((pageH - cardCanvas.height) / 2);
    ctx.drawImage(cardCanvas, x, y);
    return pageCanvas;
  }

  const pad = Math.round(10 * PX_PER_MM * scale);
  const gap = Math.round(8 * PX_PER_MM * scale);
  const innerW = pageW - pad * 2;
  const innerH = pageH - pad * 2;
  const cellW = Math.floor((innerW - gap) / 2);
  const cellH = Math.floor((innerH - gap * 3) / 4);
  const scaleCell = Math.min(cellW / cardW, cellH / cardH);
  const scaledW = Math.max(1, Math.floor(cardW * scaleCell));
  const scaledH = Math.max(1, Math.floor(cardH * scaleCell));

  for (let j = 0; j < cardsPerPage; j++) {
    const student = studentsSlice[j];
    if (!student) continue;
    const col = j % 2;
    const row = Math.floor(j / 2);
    const cellX = pad + col * (cellW + gap);
    const cellY = pad + row * (cellH + gap);
    const cardCanvas = await renderSeatCardToCanvas(student, config, scaledW, scaledH);
    const offsetX = cellX + Math.floor((cellW - scaledW) / 2);
    const offsetY = cellY + Math.floor((cellH - scaledH) / 2);
    ctx.drawImage(cardCanvas, offsetX, offsetY);
  }

  return pageCanvas;
}

/**
 * Export seating cards in batches (8 per A4 page) — Canvas لكل بطاقة.
 */
export async function exportSeatingCardsToPdf(students, config, options = {}) {
  const list = students?.length ? [...students] : [];
  if (list.length === 0) {
    throw new Error('لا توجد بطاقات للتصدير');
  }

  const filename = options.filename ?? 'بطاقات_الجلوس.pdf';
  const onProgress = options.onProgress;
  const cardsPerPage = options.cardsPerPage ?? SEATING_CARDS_PER_PAGE;
  const totalPages = Math.ceil(list.length / cardsPerPage);
  const captureScale = options.scale ?? 2;
  const captureQuality = options.quality ?? 0.96;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    for (let p = 0; p < totalPages; p++) {
      await yieldToUI();
      onProgress?.({
        page: p + 1,
        totalPages,
        percent: Math.round(((p + 1) / totalPages) * 100),
      });

    const slice = list.slice(p * cardsPerPage, p * cardsPerPage + cardsPerPage);
    const pageCanvas = await composeSeatCardsPage(slice, config, {
      cardWidth: options.cardWidth ?? CARD_WIDTH_PX,
      cardHeight: options.cardHeight ?? CARD_HEIGHT_PX,
      cardsPerPage,
        scale: captureScale,
      });

    const dataUrl = pageCanvas.toDataURL('image/jpeg', captureQuality);
      if (p > 0) pdf.addPage();
      pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297);
    }

    pdf.save(filename);
    return pdf;
}

/**
 * Capture a DOM node as a JPEG data URL (html2canvas).
 * @throws {Error} when capture fails or canvas has zero size
 */
export async function captureElementAsJpeg(element, options = {}) {
  if (!element) {
    throw new Error('عنصر التصدير غير موجود');
  }

  const scale = options.scale ?? getPdfExportScale();
  const quality = options.quality ?? 0.92;
  const format = options.format ?? 'jpeg';
  const userOnClone = options.onclone;

  const canvas = await html2canvas(element, {
    ...defaultHtml2canvasOptions,
    scale,
    onclone: (doc, clonedElement) => {
      const root = clonedElement || element;
      if (options.minimalClone || root?.dataset?.pdfExport === 'minimal') {
        stripStylesheetsOnly(doc);
      } else {
        prepareCloneForHtml2Canvas(doc, root);
      }

      if (root?.style) {
        root.setAttribute('dir', 'rtl');
        root.style.direction = 'rtl';
        root.style.unicodeBidi = 'plaintext';
      }
      doc.querySelectorAll('[dir]').forEach((el) => {
        el.style.direction = 'rtl';
        el.style.unicodeBidi = 'plaintext';
      });
      if (options.stripEditorChrome) {
        stripEditorChromeInClone(doc, root);
      }
      if (typeof userOnClone === 'function') {
        userOnClone(doc, clonedElement);
      }
    },
  });

  if (!canvas?.width || !canvas?.height) {
    throw new Error('فشل التقاط الصورة (أبعاد الصفحة صفر)');
  }

  const dataUrl =
    format === 'png'
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', quality);
  if (!dataUrl || dataUrl.length < 100) {
    throw new Error('فشل تحويل الصورة');
  }

  return { dataUrl, canvas };
}

const A4_REF_WIDTH_PX = Math.round(210 * PX_PER_MM);

function attendanceRemPx(canvasWidth) {
  return 16 * (canvasWidth / A4_REF_WIDTH_PX);
}

function drawAttendanceText(ctx, text, x, y, align, maxWidthPx) {
  const raw = String(text ?? '').trim() || '—';
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  let t = raw;
  if (maxWidthPx && align === 'right') {
    while (t.length > 1 && ctx.measureText(t).width > maxWidthPx) {
      t = t.slice(0, -1);
    }
  } else if (maxWidthPx && align === 'center') {
    while (t.length > 1 && ctx.measureText(t).width > maxWidthPx) {
      t = t.slice(0, -1);
    }
  }
  ctx.fillText(t, x, y);
}

function resolveAttendanceExportConfig(layoutOrConfig, usePrintSheetConfig) {
  return usePrintSheetConfig
    ? resolvePrintSheetConfig(layoutOrConfig)
    : resolveAttendanceConfig(layoutOrConfig);
}

/**
 * رسم كشف التوقيع على Canvas — نفس منطق المعاينة (موضع % + translate -50%).
 */
export async function renderAttendancePageToCanvas(page, layoutOrConfig, options = {}) {
  const usePrintSheetConfig = options.usePrintSheetConfig !== false;
  const config = resolveAttendanceExportConfig(layoutOrConfig, usePrintSheetConfig);
  await preloadImages([ATTENDANCE_TEMPLATE]);
  const img = await loadImageElement(ATTENDANCE_TEMPLATE);

  const W = A4_WIDTH_PX;
  const H = A4_HEIGHT_PX;
  const scale = ATTENDANCE_EXPORT_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر إنشاء لوحة الرسم');

  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);

  const rem = attendanceRemPx(W);
  const table = config.table;

  const paintHeader = (key, value) => {
    const f = config[key];
    if (!f?.show) return;
    const isExamMeta = EXAM_META_HEADER_KEYS.includes(key);
    const fontPx = (f.fontSize ?? 0.9) * rem * (isExamMeta ? 1.05 : 1);
    ctx.font = `900 ${fontPx}px Tahoma, Arial, "Segoe UI", sans-serif`;
    ctx.fillStyle = '#0f172a';
    const x = W * (1 - (f.right ?? 0) / 100);
    const y = H * ((f.top ?? 0) / 100);
    const align = key === 'headerCommittee' ? 'right' : 'center';
    drawAttendanceText(ctx, value, x, y, align);
  };

  const meta = mergeSheetMeta(config?.sheetMetaPreview, page?.sheetMeta) || {};
  paintHeader('headerSubject', meta.subject ?? '—');
  paintHeader('headerDay', meta.day ?? '—');
  paintHeader('headerDate', meta.date ?? '—');
  paintHeader('headerPeriod', meta.periodLabel ?? '—');
  paintHeader('headerCommittee', formatCommitteeDisplay(page.committee));
  paintHeader('headerGrade', page.grade);
  paintHeader('headerCount', String(page.totalCount ?? ''));

  const baseFontPx = (table.fontSize ?? 0.62) * rem;
  const nameMaxW = W * ((table.nameWidthPct ?? 38) / 100);

  /** مطابق لـ AttendanceSheetPage: top = rowBase + colTop مع توسيط رأسي */
  const cellY = (rowBasePct, colTopPct) => H * ((rowBasePct + (colTopPct || 0)) / 100);

  page.students.forEach((student, idx) => {
    const shift = getRowShift(config, idx);
    const rowBasePct =
      table.startTop + idx * table.rowHeight + (shift.top || 0);
    const fontPx = baseFontPx + (shift.fontSize || 0) * rem;

    ctx.font = `900 ${fontPx}px Arial, Tahoma, sans-serif`;
    ctx.fillStyle = '#0f172a';

    if (table.indexShow) {
      const x = W * (1 - table.indexRight / 100);
      drawAttendanceText(
        ctx,
        String(page.globalStartIndex + idx + 1),
        x,
        cellY(rowBasePct, table.indexTop),
        'center'
      );
    }
    if (table.nameShow) {
      const x = W * (1 - table.nameRight / 100);
      drawAttendanceText(
        ctx,
        String(student.name ?? '—'),
        x,
        cellY(rowBasePct, table.nameTop),
        'right',
        nameMaxW
      );
    }
    if (table.seatShow) {
      const x = W * (1 - table.seatRight / 100);
      drawAttendanceText(
        ctx,
        String(student.seatNumber ?? '—'),
        x,
        cellY(rowBasePct, table.seatTop),
        'center'
      );
    }
    if (table.gradeShow) {
      const x = W * (1 - table.gradeRight / 100);
      drawAttendanceText(
        ctx,
        String(student.grade ?? '—'),
        x,
        cellY(rowBasePct, table.gradeTop),
        'center'
      );
    }
  });

  return canvas;
}

/**
 * تصدير كشوف التوقيع/اللجان — Canvas بدقة A4 كاملة.
 * @param {{ usePrintSheetConfig?: boolean }} [options] — true = نفس إعدادات معاينة طباعة الكشوف
 */
export async function exportAttendanceSheetsToPdf(pages, layoutOrConfig, filename, options = {}) {
  const list = Array.isArray(pages) ? pages : [];
  if (list.length === 0) {
    throw new Error('لا توجد صفحات للتصدير');
  }

  const usePrintSheetConfig = options.usePrintSheetConfig !== false;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  for (let i = 0; i < list.length; i++) {
    await yieldToUI();
    const canvas = await renderAttendancePageToCanvas(list[i], layoutOrConfig, {
      usePrintSheetConfig,
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    if (!dataUrl || dataUrl.length < 100) {
      throw new Error('فشل تحويل صفحة الكشف');
    }
    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }

  pdf.save(filename);
  return pdf;
}

/**
 * One full A4 page per element (committee lists, attendance sheets, etc.).
 */
export async function exportFullPagesToPdf(elements, filename, options = {}) {
  const list = elements?.length ? [...elements] : [];
  if (list.length === 0) {
    throw new Error('لا توجد صفحات للتصدير');
  }

  const pageWidth = options.pageWidth ?? 210;
  const pageHeight = options.pageHeight ?? 297;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < list.length; i++) {
    await yieldToUI();
    const { dataUrl } = await captureElementAsJpeg(list[i], options.capture);
    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, 'JPEG', 0, 0, pageWidth, pageHeight);
  }

  pdf.save(filename);
  return pdf;
}
