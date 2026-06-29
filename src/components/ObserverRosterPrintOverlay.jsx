import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X, Download, FileText, RotateCcw } from 'lucide-react';
import ObserverRosterSheet from './ObserverRosterSheet';
import {
  buildObserverRosterData,
  buildObserverRosterPdfFilename,
  loadObserverRosterConfig,
  resolveRosterSchoolName,
} from '../utils/observerRosterPrint';
import { buildObserverSheetPages } from '../utils/observerSheetTemplates';
import { getAppSettings } from '../utils/dataService';
import { exportObserverRosterPagesToPdf } from '../utils/observerRosterPdfExport';

/**
 * معاينة وطباعة كشوف الملاحظين — قالب HTML مدمج (مثل كشف اللجان)
 * mode: summary | committee | full
 */
export default function ObserverRosterPrintOverlay({
  mode = 'committee',
  stageId,
  committees,
  observers,
  assignments,
  appConfig,
  filters,
  onClose,
}) {
  const [config] = useState(() => loadObserverRosterConfig());
  const [schoolName, setSchoolName] = useState('المدرسة');
  const [exporting, setExporting] = useState(false);
  const pageRefs = useRef([]);

  useEffect(() => {
    getAppSettings()
      .then((cfg) => setSchoolName(resolveRosterSchoolName(cfg)))
      .catch(() => {});
  }, []);

  const { summaryPages, committeePages } = useMemo(() => {
    const data = buildObserverRosterData({
      committees,
      observers,
      assignments,
      appConfig,
      stageId,
      filters,
      config,
    });
    return {
      summaryPages: data.summaryPages,
      committeePages: data.committeePages,
    };
  }, [committees, observers, assignments, appConfig, stageId, filters, config]);

  const pages = useMemo(() => {
    if (mode === 'summary') return summaryPages;
    if (mode === 'committee') return committeePages;
    return [...summaryPages, ...committeePages];
  }, [mode, summaryPages, committeePages]);

  const title = useMemo(() => {
    if (mode === 'summary') return `الكشف المجمع — ${summaryPages.length} صفحة`;
    if (mode === 'committee') {
      const source = buildObserverSheetPages(committees, observers, assignments, stageId, filters);
      return `كشوف ملاحظي اللجان — ${source.length} لجنة · ${committeePages.length} صفحة`;
    }
    return `كشوف الملاحظين — ${pages.length} صفحة`;
  }, [mode, summaryPages.length, committeePages.length, pages.length, committees, observers, assignments, stageId]);

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
      const base = buildObserverRosterPdfFilename(mode, stageId, filters);
      await exportObserverRosterPagesToPdf(pageRefs.current, base);
    } catch (err) {
      console.error(err);
      alert('تعذّر تصدير PDF: ' + (err?.message || err));
    } finally {
      setExporting(false);
    }
  };

  pageRefs.current = pageRefs.current.slice(0, pages.length);

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-slate-900/90 backdrop-blur-sm animate-in fade-in font-alexandria">
      <div className="print:hidden shrink-0 flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-8 bg-slate-900 text-white border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <FileText size={22} className="text-violet-300 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-black text-lg truncate">{title}</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              قالب مدمج — {schoolName} — بدون صور قوالب
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
            className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-black disabled:opacity-40"
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

      <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-slate-200/40 print:p-0 print:bg-white print:overflow-visible">
        {!pages.length ? (
          <div className="luxury-card max-w-lg mx-auto p-12 text-center text-slate-600 font-black">
            لا توجد بيانات للطباعة. تأكد من توزيع الملاحظين على اللجان.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-12 print:gap-0 print:block">
            {pages.map((page, idx) => (
              <div
                key={page.id}
                ref={(el) => {
                  pageRefs.current[idx] = el;
                }}
              >
                <ObserverRosterSheet page={page} config={config} schoolName={schoolName} />
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          aside, nav, header { display: none !important; }
          .observer-roster-page {
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
