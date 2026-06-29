/** تخطيط أسفل الكشف — مواضع نسبية داخل منطقة المدير (%) */

export const MANAGER_FOOTER_FIELD_DEFS = [
  { key: 'managerTitle', label: 'نص «مدير المدرسة»', hasWidth: true, hasAlign: true },
  { key: 'managerName', label: 'نص الاسم' },
  { key: 'signatureLine', label: 'نص التوقيع' },
  { key: 'stamp', label: 'نص الختم', useRight: true },
];

export const DEFAULT_MANAGER_FOOTER_LAYOUT = {
  heightMm: 30,
  managerTitle: {
    topPct: 2,
    leftPct: 2,
    widthPct: 44,
    fontSizeRem: 0.68,
    textAlign: 'center',
  },
  managerName: { topPct: 30, leftPct: 2, fontSizeRem: 0.62 },
  signatureLine: { topPct: 68, leftPct: 2, fontSizeRem: 0.62 },
  stamp: { topPct: 30, rightPct: 3, fontSizeRem: 0.62 },
};

export function mergeManagerFooterLayout(raw) {
  const def = DEFAULT_MANAGER_FOOTER_LAYOUT;
  if (!raw || typeof raw !== 'object') {
    return {
      heightMm: def.heightMm,
      managerTitle: { ...def.managerTitle },
      managerName: { ...def.managerName },
      signatureLine: { ...def.signatureLine },
      stamp: { ...def.stamp },
    };
  }
  const out = { heightMm: raw.heightMm ?? def.heightMm };
  for (const { key } of MANAGER_FOOTER_FIELD_DEFS) {
    out[key] = { ...def[key], ...(raw[key] || {}) };
  }
  return out;
}

export function managerFooterHeightPx(layout, scale = 1) {
  const mm = layout?.heightMm ?? DEFAULT_MANAGER_FOOTER_LAYOUT.heightMm;
  return Math.round(mm * (96 / 25.4) * scale);
}

export function managerFooterFieldFontPx(field, pageScale = 1) {
  const rem = field?.fontSizeRem ?? 0.62;
  return Math.round(rem * 16 * pageScale * 10) / 10;
}

/** أنماط حقل واحد داخل حاوية التذييل */
export function managerFooterFieldStyle(field, fieldKey, pageScale = 1) {
  if (!field) return {};
  const fontPx = managerFooterFieldFontPx(field, pageScale);
  const style = {
    position: 'absolute',
    top: `${field.topPct ?? 0}%`,
    margin: 0,
    fontSize: `${fontPx}px`,
    fontWeight: fieldKey === 'managerTitle' ? 900 : 700,
    color:
      fieldKey === 'managerTitle'
        ? '#0f2744'
        : fieldKey === 'stamp'
          ? '#64748b'
          : '#1a3a5c',
    lineHeight: 1.35,
    whiteSpace: 'nowrap',
  };
  if (field.useRight || field.rightPct != null) {
    style.right = `${field.rightPct ?? 0}%`;
    style.left = 'auto';
  } else {
    style.left = `${field.leftPct ?? 0}%`;
  }
  if (field.widthPct != null) {
    style.width = `${field.widthPct}%`;
    style.whiteSpace = 'normal';
  }
  if (field.textAlign) style.textAlign = field.textAlign;
  return style;
}
