import jsPDF from 'jspdf';
import { captureElementAsJpeg, yieldToUI } from './pdfExport';

export async function exportObserverRosterPagesToPdf(pageElements, filename = 'كشوف_الملاحظين.pdf') {
  const nodes = (pageElements || []).filter(Boolean);
  if (!nodes.length) throw new Error('لا توجد صفحات للتصدير');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  for (let i = 0; i < nodes.length; i++) {
    const { dataUrl } = await captureElementAsJpeg(nodes[i], {
      scale: 2,
      minimalClone: true,
    });
    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    if (i % 2 === 1) await yieldToUI();
  }

  pdf.save(filename.replace(/[\\/:*?"<>|]/g, '_'));
  return pdf;
}
