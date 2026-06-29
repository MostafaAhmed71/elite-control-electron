import jsPDF from 'jspdf';
import { yieldToUI } from './pdfExport';
import {
  buildCommitteeRosterPages,
  committeeHeaderNumber,
} from './committeeRosterPrint';
import {
  mergeManagerFooterLayout,
  managerFooterHeightPx,
  managerFooterFieldFontPx,
} from './committeeRosterManagerFooter';
import {
  getRosterStudentField,
  getVisibleRosterColumns,
  layoutRtlColumnRects,
  ROSTER_META_RTL,
} from './committeeRosterColumns';

const PX_PER_MM = 96 / 25.4;
const W = Math.round(210 * PX_PER_MM);
const H = Math.round(297 * PX_PER_MM);

const BRAND = {
  navy: '#0f2744',
  navyMid: '#1a3a5c',
  indigo: '#3730a3',
  gold: '#b8860b',
  slate: '#64748b',
  rowAlt: '#f8fafc',
  headerBg: '#f1f5f9',
};

const META_ACCENTS = {
  committee: BRAND.indigo,
  grade: BRAND.navyMid,
  count: BRAND.gold,
};

function setFont(ctx, sizePx, weight = 'bold') {
  ctx.font = `${weight} ${sizePx}px Tahoma, Arial, sans-serif`;
}

function drawText(ctx, text, x, y, { align = 'center', color = BRAND.navy, size = 14, weight = 'bold' } = {}) {
  setFont(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(String(text ?? '').trim() || '—', x, y);
}

function truncateRtl(ctx, text, maxW) {
  let t = String(text ?? '').trim() || '—';
  setFont(ctx, 14, 'bold');
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
  return t;
}

/**
 * رسم صفحة كشف اللجنة — تخطيط RTL (الأعمدة من اليمين)
 */
export async function renderCommitteeRosterPageToCanvas(page, config, schoolName = 'المدرسة') {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.direction = 'rtl';

  const table = config.table || {};
  const margin = Math.round(10 * PX_PER_MM);
  const innerW = W - margin * 2;
  const innerLeft = margin;
  let y = margin;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = BRAND.gold;
  ctx.fillRect(innerLeft, y, innerW, 5);
  y += 5;

  const frameTop = y;
  const frameH = H - margin - y - 5;
  ctx.strokeStyle = BRAND.navy;
  ctx.lineWidth = 2;
  ctx.strokeRect(innerLeft, frameTop, innerW, frameH);

  y = frameTop + 2;
  const contentW = innerW - 4;
  const contentX = innerLeft + 2;
  const contentRight = contentX + contentW;

  const headerH = 118;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(contentX, y, contentW, headerH);
  ctx.strokeStyle = BRAND.navy;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(contentX, y + headerH);
  ctx.lineTo(contentRight, y + headerH);
  ctx.stroke();

  const textCenterX = contentX + contentW / 2;

  let hy = y + 18;
  if (config.showMinistryLine !== false) {
    drawText(ctx, 'وزارة التعليم · إدارة التعليم', textCenterX, hy, {
      size: 11,
      color: BRAND.slate,
    });
    hy += 22;
  }
  if (config.showSchoolName !== false) {
    drawText(ctx, schoolName, textCenterX, hy, { size: 20, weight: '900' });
    hy += 28;
  }

  const title = config.title || 'كشف توزيع الطلاب على لجان الاختبار';
  setFont(ctx, 13, '900');
  const titleBoxW = Math.min(contentW - 40, Math.max(ctx.measureText(title).width + 48, 280));
  const titleX = contentRight - titleBoxW;
  const titleBoxH = 28;
  ctx.fillStyle = BRAND.indigo;
  ctx.fillRect(titleX, hy, titleBoxW, titleBoxH);
  drawText(ctx, title, titleX + titleBoxW / 2, hy + titleBoxH / 2, {
    size: 13,
    color: '#ffffff',
    weight: '900',
  });
  hy += titleBoxH + 8;
  if (config.subtitle) {
    drawText(ctx, config.subtitle, textCenterX, hy, { size: 11, color: BRAND.slate });
  }

  y += headerH + 4;

  if (config.showMetaBox !== false) {
    const metaH = 52;
    const colW = contentW / 3;
    let metaRight = contentRight;
    ROSTER_META_RTL.forEach((m) => {
      metaRight -= colW;
      const accent = META_ACCENTS[m.key];
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(metaRight + 4, y + 4, colW - 8, metaH - 8);
      ctx.fillStyle = accent;
      ctx.fillRect(metaRight + 4, y + 4, colW - 8, 4);
      drawText(ctx, m.label, metaRight + colW / 2, y + 20, { size: 10, color: BRAND.slate });
      drawText(ctx, m.getValue(page), metaRight + colW / 2, y + 38, { size: 13, weight: '900' });
    });
    y += metaH + 6;
  }

  const columns = getVisibleRosterColumns(table);
  const tableLeft = contentX + 6;
  const tableW = contentW - 12;
  const tableRight = tableLeft + tableW;
  const rowH = Math.round((table.rowHeightMm ?? 7.2) * PX_PER_MM);
  const headerRowH = 32;
  const fontBody = Math.round((table.fontSizeRem ?? 0.82) * 16);

  const colRects = layoutRtlColumnRects(tableLeft, tableW, columns);

  ctx.fillStyle = BRAND.navy;
  ctx.fillRect(tableLeft, y, tableW, headerRowH);
  colRects.forEach((col, i) => {
    if (i < colRects.length - 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.moveTo(col.x, y);
      ctx.lineTo(col.x, y + headerRowH);
      ctx.stroke();
    }
    drawText(ctx, col.label, col.x + col.w / 2, y + headerRowH / 2, {
      size: 12,
      color: '#ffffff',
      weight: '900',
    });
  });
  y += headerRowH;

  const students = page.students || [];
  const maxRows = config.maxRows || 25;

  const drawRow = (rowData, rowIndex, isEmpty) => {
    const bg = rowIndex % 2 === 0 ? '#ffffff' : BRAND.rowAlt;
    ctx.fillStyle = bg;
    ctx.fillRect(tableLeft, y, tableW, rowH);

    colRects.forEach((col, i) => {
      if (i < colRects.length - 1) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(col.x, y);
        ctx.lineTo(col.x, y + rowH);
        ctx.stroke();
      }
      if (!isEmpty) {
        setFont(ctx, fontBody, 'bold');
        ctx.fillStyle = BRAND.navy;
        ctx.direction = 'rtl';
        if (col.key === 'index') {
          drawText(ctx, String(rowData.serial), col.x + col.w / 2, y + rowH / 2, { size: fontBody });
        } else if (col.key === 'seat') {
          drawText(ctx, rowData.seat, col.x + col.w / 2, y + rowH / 2, {
            size: fontBody,
            color: BRAND.indigo,
          });
        } else if (col.key === 'name') {
          ctx.textAlign = 'right';
          ctx.fillText(truncateRtl(ctx, rowData.name, col.w - 14), col.x + col.w - 8, y + rowH / 2);
        } else if (col.key === 'grade') {
          drawText(ctx, rowData.grade, col.x + col.w / 2, y + rowH / 2, { size: fontBody - 1 });
        } else if (col.key === 'notes') {
          ctx.textAlign = 'right';
          ctx.fillStyle = BRAND.slate;
          setFont(ctx, fontBody - 1, 'bold');
          const notesText = rowData.notes ? truncateRtl(ctx, rowData.notes, col.w - 14) : '';
          if (notesText) {
            ctx.fillText(notesText, col.x + col.w - 8, y + rowH / 2);
          }
        }
      }
    });
    y += rowH;
  };

  students.forEach((student, idx) => {
    drawRow(
      {
        serial: page.globalStartIndex + idx + 1,
        seat: getRosterStudentField(student, 'seat'),
        name: getRosterStudentField(student, 'name'),
        grade: getRosterStudentField(student, 'grade'),
        notes: getRosterStudentField(student, 'notes'),
      },
      idx,
      false
    );
  });

  const footerLayout = mergeManagerFooterLayout(config.managerFooter);
  const signatureReserve = config.showManagerSignature !== false
    ? managerFooterHeightPx(footerLayout, 1) + 12
    : 40;

  for (let i = students.length; i < maxRows && y < H - margin - signatureReserve; i++) {
    drawRow(null, i, true);
  }

  if (config.showManagerSignature !== false) {
    const sigTop = H - margin - signatureReserve;
    const footerH = managerFooterHeightPx(footerLayout, 1);
    const stampLabel = config.stampLabel || 'الختم';
    const managerTitle = config.managerTitle || 'مدير المدرسة';
    const managerName = config.managerName || 'محمد نصر الدين مصطفي';
    const signatureLineLabel = config.signatureLineLabel || 'التوقيع :';
    const pad = 8;
    const boxW = contentW - pad * 2;
    const boxX = contentX + pad;

    const placeFooterField = (field, fieldKey, text, extra = {}) => {
      const topPx = sigTop + ((field.topPct ?? 0) / 100) * footerH;
      const fontPx = managerFooterFieldFontPx(field, 1);
      const weight = fieldKey === 'managerTitle' ? '900' : 'bold';
      const color =
        fieldKey === 'managerTitle' ? BRAND.navy : fieldKey === 'stamp' ? BRAND.slate : BRAND.navyMid;

      if (field.rightPct != null) {
        const x = boxX + boxW - (field.rightPct / 100) * boxW;
        drawText(ctx, text, x, topPx + fontPx * 0.35, {
          align: 'right',
          size: fontPx,
          color,
          weight,
          ...extra,
        });
        return;
      }

      const leftPx = boxX + ((field.leftPct ?? 0) / 100) * boxW;
      if (field.widthPct != null && field.textAlign === 'center') {
        const w = (field.widthPct / 100) * boxW;
        drawText(ctx, text, leftPx + w / 2, topPx + fontPx * 0.35, {
          align: 'center',
          size: fontPx,
          color,
          weight,
          ...extra,
        });
        return;
      }

      drawText(ctx, text, leftPx, topPx + fontPx * 0.35, {
        align: 'left',
        size: fontPx,
        color,
        weight,
        ...extra,
      });
    };

    ctx.strokeStyle = BRAND.navyMid;
    ctx.beginPath();
    ctx.moveTo(contentX, sigTop);
    ctx.lineTo(contentRight, sigTop);
    ctx.stroke();

    placeFooterField(footerLayout.managerTitle, 'managerTitle', managerTitle);
    placeFooterField(footerLayout.managerName, 'managerName', `الاسم : ${managerName}`);
    placeFooterField(footerLayout.signatureLine, 'signatureLine', signatureLineLabel);
    placeFooterField(footerLayout.stamp, 'stamp', stampLabel);
  }

  if (page.totalPages > 1) {
    const footY = H - margin - 22;
    ctx.strokeStyle = BRAND.navyMid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(contentX, footY);
    ctx.lineTo(contentRight, footY);
    ctx.stroke();

    drawText(ctx, `صفحة ${page.pageIndex} من ${page.totalPages}`, contentX + contentW / 2, footY + 14, {
      align: 'center',
      size: 9,
      color: BRAND.navy,
    });
  }

  ctx.fillStyle = BRAND.indigo;
  ctx.fillRect(innerLeft, H - margin - 4, innerW, 4);

  return canvas;
}

function safeRosterFilePart(s) {
  return String(s ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 50) || 'لجنة';
}

/**
 * تصدير PDF منفصل لكل لجنة (كل صفحات اللجنة في ملف واحد)
 */
export async function exportCommitteeRostersPdfPerCommittee(
  committees,
  students,
  config,
  schoolName,
  options = {}
) {
  const list = [...(committees || [])].sort((a, b) =>
    committeeHeaderNumber(a).localeCompare(committeeHeaderNumber(b), 'ar', { numeric: true })
  );
  if (!list.length) throw new Error('لا توجد لجان للتصدير');

  const date = options.dateSuffix ?? new Date().toISOString().slice(0, 10);
  const stagePart = options.stageSuffix ? `${safeRosterFilePart(options.stageSuffix)}_` : '';
  let fileCount = 0;

  for (let i = 0; i < list.length; i++) {
    const committee = list[i];
    const pages = buildCommitteeRosterPages(committee, students, config);
    if (!pages.length) continue;

    await yieldToUI();
    options.onCommitteeStart?.({
      committee: committee.name,
      committeeIndex: i + 1,
      totalCommittees: list.length,
      pageCount: pages.length,
      studentCount: pages[0]?.totalCount ?? 0,
    });

    const label = safeRosterFilePart(committee.name || committeeHeaderNumber(committee));
    const filename = `كشف_${stagePart}لجنة_${label}_${date}.pdf`;
    await exportCommitteeRosterPagesToPdf(pages, config, schoolName, filename);
    fileCount += 1;
  }

  if (!fileCount) throw new Error('لا يوجد طلاب في اللجان المحددة للتصدير');
  return { fileCount };
}

export async function exportCommitteeRosterPagesToPdf(pages, config, schoolName, filename) {
  const list = pages?.length ? [...pages] : [];
  if (!list.length) throw new Error('لا توجد صفحات للتصدير');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let i = 0; i < list.length; i++) {
    await yieldToUI();
    const canvas = await renderCommitteeRosterPageToCanvas(list[i], config, schoolName);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297);
  }

  pdf.save(filename);
  return pdf;
}
