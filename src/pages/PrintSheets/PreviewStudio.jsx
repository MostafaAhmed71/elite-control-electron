import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    ArrowRight,
    Download,
    Eye,
    Printer,
    Save,
    SlidersHorizontal,
} from 'lucide-react';
import { getStudents, getAppSettings, saveAppSettings } from '../../utils/dataService';
import {
    ATTENDANCE_PAGE_ROWS,
    resolvePrintSheetConfig,
    buildAttendancePages,
} from '../../utils/attendanceLayout';
import { resolveExamSchedule } from '../../utils/examSchedule';
import { exportAttendanceSheetsToPdf } from '../../utils/pdfExport';
import AttendanceSheetPage from '../../components/AttendanceSheetPage';
import AttendanceLayoutStudio, {
    SAMPLE_ATTENDANCE_PAGE,
} from '../../components/AttendanceLayoutStudio';

const defaultFilters = {
    stage: 'الكل',
    grade: 'الكل',
    committee: 'الكل',
    period: 1,
    day: 'الكل',
};

const PrintSheetsPreviewStudio = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const initialFilters = { ...defaultFilters, ...location.state?.filters };

    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [appConfig, setAppConfig] = useState(null);
    const [draft, setDraft] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const init = async () => {
            const [settings, list] = await Promise.all([getAppSettings(), getStudents()]);
            setAppConfig(settings);
            setDraft(resolvePrintSheetConfig(settings?.attendance));
            setStudents(list);
            setLoading(false);
        };
        init();
    }, []);

    const filteredStudents = useMemo(() => {
        return students.filter((s) => {
            const matchStage =
                initialFilters.stage === 'الكل' || s.stage === initialFilters.stage;
            const matchGrade =
                initialFilters.grade === 'الكل' || s.grade === initialFilters.grade;
            const matchCommittee =
                initialFilters.committee === 'الكل' || s.committee === initialFilters.committee;
            return matchStage && matchGrade && matchCommittee;
        });
    }, [students, initialFilters]);

    const examSchedule = useMemo(
        () => resolveExamSchedule(appConfig?.examSchedule),
        [appConfig?.examSchedule]
    );

    const metaSource = useMemo(
        () => ({ schedule: examSchedule, filters: initialFilters }),
        [examSchedule, initialFilters]
    );

    const pages = useMemo(
        () => (draft ? buildAttendancePages(filteredStudents, draft, metaSource) : []),
        [filteredStudents, draft, metaSource]
    );

    const studioPreviewSource = useMemo(() => {
        if (!pages[0]) {
            return {
                ...SAMPLE_ATTENDANCE_PAGE,
                students: Array.from({ length: ATTENDANCE_PAGE_ROWS }, (_, i) => ({
                    id: `s${i}`,
                    name: `طالب ${i + 1}`,
                    seatNumber: String(100 + i),
                    grade: 'الأول الثانوي',
                })),
            };
        }
        const src = pages[0];
        const students = [...(src.students || [])];
        const gradeLabel = String(src.grade || '—').split(' و ')[0];
        while (students.length < ATTENDANCE_PAGE_ROWS) {
            const i = students.length;
            students.push({
                id: `pad-${i}`,
                name: `طالب ${i + 1}`,
                seatNumber: String(100 + i),
                grade: gradeLabel,
            });
        }
        return { ...src, students: students.slice(0, ATTENDANCE_PAGE_ROWS) };
    }, [pages]);

    const handleSaveLayout = async () => {
        if (!appConfig || !draft) return;
        setSaving(true);
        try {
            const next = {
                ...appConfig,
                attendance: resolvePrintSheetConfig({
                    ...resolvePrintSheetConfig(appConfig?.attendance),
                    ...draft,
                    sheetMetaPreview: draft.sheetMetaPreview || {},
                }),
            };
            await saveAppSettings(next);
            setAppConfig(next);
            alert('تم حفظ مواضع القالب');
        } catch (e) {
            console.error(e);
            alert('فشل الحفظ');
        } finally {
            setSaving(false);
        }
    };

    const handleExportPdf = async () => {
        if (pages.length === 0) {
            alert('لا توجد صفحات للتصدير');
            return;
        }
        setIsExporting(true);
        try {
            await exportAttendanceSheetsToPdf(pages, draft, 'كشوف-اللجان.pdf', {
                usePrintSheetConfig: true,
            });
        } catch (e) {
            console.error(e);
            alert(e?.message || 'فشل التصدير');
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrint = () => {
        if (pages.length === 0) {
            alert('لا توجد كشوف للطباعة');
            return;
        }
        window.print();
    };

    if (loading || !draft) {
        return (
            <div className="flex items-center justify-center py-40 font-alexandria">
                <p className="font-black text-slate-400">جاري تحميل الاستوديو...</p>
            </div>
        );
    }

    return (
        <div className="font-alexandria pb-16 print-sheets-studio" dir="rtl">
            <div className="print:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-100 px-4 md:px-8 py-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 max-w-[1600px] mx-auto">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => navigate('/print-sheets')}
                            className="p-3 rounded-2xl bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                            title="العودة"
                        >
                            <ArrowRight size={22} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 font-header flex items-center gap-2">
                                <Eye size={24} className="text-indigo-600" />
                                معاينة وضبط الكشوف
                            </h1>
                            <p className="text-slate-400 text-xs font-bold mt-1">
                                {pages.length} صفحة · {filteredStudents.length} طالب
                                {pages[0]?.sheetMeta?.subject && pages[0].sheetMeta.subject !== '—' && (
                                    <span className="text-violet-600 block mt-1">
                                        {pages[0].sheetMeta.periodLabel} · {pages[0].sheetMeta.subject} ·{' '}
                                        {pages[0].sheetMeta.day}{' '}
                                        {pages[0].sheetMeta.date !== '—'
                                            ? `(${pages[0].sheetMeta.date})`
                                            : ''}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleSaveLayout}
                            disabled={saving}
                            className="px-5 py-3 bg-amber-50 text-amber-900 rounded-2xl font-black text-sm border border-amber-100 flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save size={18} />
                            {saving ? 'جاري الحفظ...' : 'حفظ المواضع'}
                        </button>
                        <button
                            type="button"
                            onClick={handleExportPdf}
                            disabled={isExporting || pages.length === 0}
                            className="px-5 py-3 bg-white text-slate-700 rounded-2xl font-black text-sm border border-slate-100 flex items-center gap-2 disabled:opacity-50"
                        >
                            <Download size={18} className="text-indigo-500" />
                            {isExporting ? 'جاري التصدير...' : 'تصدير PDF'}
                        </button>
                        <button
                            type="button"
                            onClick={handlePrint}
                            disabled={pages.length === 0}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            <Printer size={18} />
                            طباعة
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto px-4 md:px-8 pt-8">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,400px)_1fr] gap-8 items-start">
                    <aside className="print:hidden xl:sticky xl:top-28 luxury-card p-6 bg-white border-slate-100 max-h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">
                        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
                            <SlidersHorizontal size={20} className="text-indigo-600" />
                            <h2 className="font-black text-slate-900 font-header">ضبط المعايير</h2>
                        </div>
                        <AttendanceLayoutStudio
                            draft={draft}
                            setDraft={setDraft}
                            sheetMeta={pages[0]?.sheetMeta}
                            previewPage={studioPreviewSource}
                        />
                    </aside>

                    <main className="min-w-0">
                        <div className="print:hidden mb-6 flex items-center gap-3">
                            <span className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full text-xs font-black">
                                معاينة ما سيُطبع — يتحدث فوراً عند الضبط
                            </span>
                        </div>

                        <div id="print-sheets-output" className="flex flex-col items-center gap-12">
                            {pages.length === 0 ? (
                                <div className="luxury-card py-24 text-center w-full max-w-md print:hidden">
                                    <p className="font-black text-slate-500">
                                        لا يوجد طلاب للمعاينة. ارجع وعدّل الفلاتر.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/print-sheets')}
                                        className="mt-4 text-indigo-600 font-bold"
                                    >
                                        العودة للفلاتر
                                    </button>
                                </div>
                            ) : (
                                pages.map((page) => (
                                    <AttendanceSheetPage
                                        key={page.id}
                                        page={page}
                                        config={draft}
                                    />
                                ))
                            )}
                        </div>
                    </main>
                </div>
            </div>

            <style>{`
                @media print {
                  @page { size: A4 portrait; margin: 0; }
                  body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                  aside, .print\\:hidden, nav, header { display: none !important; }
                  main { padding: 0 !important; margin: 0 !important; }
                  .print-sheets-studio { padding: 0 !important; }
                  .page-to-print {
                    box-shadow: none !important;
                    border: none !important;
                    margin: 0 !important;
                    page-break-after: always;
                  }
                  .page-to-print:last-child { page-break-after: auto; }
                }
            `}</style>
        </div>
    );
};

export default PrintSheetsPreviewStudio;
