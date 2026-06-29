import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X, Download, FileText, RotateCcw } from 'lucide-react';
import CommitteeRosterSheet from './CommitteeRosterSheet';
import {
  buildAllCommitteeRosterPages,
  buildCommitteeRosterPages,
  loadCommitteeRosterConfig,
  resolveRosterSchoolName,
} from '../utils/committeeRosterPrint';
import { getAppSettings } from '../utils/dataService';
import { exportCommitteeRosterPagesToPdf } from '../utils/committeeRosterPdfExport';

/**
 * معاينة وطباعة كشوف اللجان — قالب HTML مدمج
 */
export default function CommitteeRosterPrintOverlay({ committees, students, onClose }) {
  const [config, setConfigState] = useState(() => loadCommitteeRosterConfig());
  const [schoolName, setSchoolName] = useState('المدرسة');

  useEffect(() => {
    setConfigState(loadCommitteeRosterConfig());
    getAppSettings()
      .then((cfg) => setSchoolName(resolveRosterSchoolName(cfg)))
      .catch(() => {});
  }, [committees]);

  const pages = useMemo(() => {
    const list = committees?.length ? committees : [];
    if (!list.length) return [];
    if (list.length === 1) return buildCommitteeRosterPages(list[0], students, config);
    return buildAllCommitteeRosterPages(list, students, config);
  }, [committees, students, config]);

  const containerRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const handlePrint = () => {
    if (!pages.length) {
      alert('لا توجد صفحات للطباعة.');
      return;
    }
    window.print();
  };

  const handleExportPdf = async () => {
    if (!pages.length) {
      alert('لا توجد صفحات للتصدير.');
      return;
    }
    setExporting(true);
    try {
      const label =
        committees.length === 1
          ? `كشف_لجنة_${committees[0].name || 'لجنة'}.pdf`
          : 'كشوف_اللجان.pdf';
      await exportCommitteeRosterPagesToPdf(
        pages,
        config,
        schoolName,
        label.replace(/[\\/:*?"<>|]/g, '_')
      );
    } catch (err) {
      console.error(err);
      alert('تعذّر تصدير PDF: ' + (err?.message || err));
    } finally {
      setExporting(false);
    }
  };

  const title =
    committees.length === 1
      ? `كشف اللجنة — ${committees[0].name || ''}`
      : `كشوف اللجان (${committees.length} لجنة — ${pages.length} صفحة)`;

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-slate-900/90 backdrop-blur-sm animate-in fade-in font-alexandria">
      <div className="print:hidden shrink-0 flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8 bg-slate-900 text-white border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <FileText size={22} className="text-indigo-300 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-black text-lg truncate">{title}</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              قالب مدمج — {schoolName} — جدول (م، اسم، صف، جلوس، ملاحظات)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exporting || !pages.length}
            className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-black disabled:opacity-40"
          >
            {exporting ? <RotateCcw size={16} className="animate-spin" /> : <Download size={16} />}
            {exporting ? 'جاري PDF...' : 'تحميل PDF'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!pages.length}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-black disabled:opacity-40"
          >
            <Printer size={16} />
            طباعة
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 hover:bg-rose-500/20 text-slate-300 hover:text-white rounded-xl"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-6 md:p-10 bg-slate-200/40 print:p-0 print:bg-white print:overflow-visible"
      >
        {!pages.length ? (
          <div className="luxury-card max-w-lg mx-auto p-12 text-center text-slate-600 font-black">
            لا يوجد طلاب في اللجان المحددة للطباعة.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-12 print:gap-0 print:block">
            {pages.map((page) => (
              <CommitteeRosterSheet
                key={page.id}
                page={page}
                config={config}
                schoolName={schoolName}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          aside, nav, header { display: none !important; }
          .committee-roster-page {
            width: 210mm !important;
            height: 297mm !important;
            page-break-after: always;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
