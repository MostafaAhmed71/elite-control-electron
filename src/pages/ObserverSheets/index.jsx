import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ClipboardList,
    Download,
    UserCheck,
    GraduationCap,
    School,
    ExternalLink,
    AlertCircle,
    Table2,
    FileStack,
    Clock,
    Calendar,
    Printer,
} from 'lucide-react';
import {
    getAppSettings,
    getCommittees,
    getObservers,
    getAssignments,
} from '../../utils/dataService';
import { PERIOD_OPTIONS, daysForFilters } from '../../utils/examSchedule';
import {
    OBSERVER_SHEET_STAGES,
    buildObserverSheetPages,
    buildObserverSummaryMeta,
    buildObserverSummaryRows,
    normalizeObserverSheetsConfig,
} from '../../utils/observerSheetTemplates';
import {
    buildObserverCommitteeRosterPages,
    buildObserverSummaryRosterPages,
    loadObserverRosterConfig,
    resolveRosterSchoolName,
} from '../../utils/observerRosterPrint';
import ObserverRosterSheet from '../../components/ObserverRosterSheet';
import ObserverRosterPrintOverlay from '../../components/ObserverRosterPrintOverlay';

const stageTabClass = (active) =>
    `flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm transition-all ${
        active
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
            : 'bg-slate-50 text-slate-600 hover:bg-indigo-50'
    }`;

const PREVIEW_SCALE = { width: 340, height: Math.round(340 * (297 / 210)) };

const ObserverSheets = () => {
    const [appConfig, setAppConfig] = useState(null);
    const [committees, setCommittees] = useState([]);
    const [observers, setObservers] = useState([]);
    const [assignments, setAssignments] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeStage, setActiveStage] = useState('secondary');
    const [period, setPeriod] = useState(1);
    const [day, setDay] = useState('الكل');
    const [printMode, setPrintMode] = useState(null);
    const [rosterConfig] = useState(() => loadObserverRosterConfig());
    const [schoolName, setSchoolName] = useState('المدرسة');

    const load = () =>
        Promise.all([
            getAppSettings(),
            getCommittees(),
            getObservers(),
            getAssignments(),
        ]).then(([cfg, c, o, a]) => {
            setAppConfig(normalizeObserverSheetsConfig(cfg));
            setSchoolName(resolveRosterSchoolName(cfg));
            setCommittees(c);
            setObservers(o);
            setAssignments(a);
        });

    useEffect(() => {
        load().finally(() => setLoading(false));
    }, []);

    const stageDef = OBSERVER_SHEET_STAGES[activeStage];
    const filters = useMemo(() => ({ period, day }), [period, day]);

    const availableDays = useMemo(() => {
        if (!appConfig?.examSchedule) return [];
        return daysForFilters(appConfig.examSchedule, {
            stage: stageDef.studentStage,
            grade: 'الكل',
            period,
        });
    }, [appConfig, period, stageDef.studentStage]);

    const committeeSource = useMemo(() => {
        if (!appConfig) return [];
        return buildObserverSheetPages(committees, observers, assignments, activeStage, filters);
    }, [appConfig, committees, observers, assignments, activeStage, filters]);

    const summaryRows = useMemo(() => {
        if (!appConfig) return [];
        return buildObserverSummaryRows(committees, observers, assignments, activeStage, filters);
    }, [appConfig, committees, observers, assignments, activeStage, filters]);

    const summaryMeta = useMemo(() => {
        if (!appConfig) return null;
        return buildObserverSummaryMeta(appConfig, activeStage, filters);
    }, [appConfig, activeStage, filters]);

    const committeePages = useMemo(
        () => buildObserverCommitteeRosterPages(committeeSource, rosterConfig),
        [committeeSource, rosterConfig]
    );

    const summaryPages = useMemo(
        () => buildObserverSummaryRosterPages(summaryRows, summaryMeta, rosterConfig),
        [summaryRows, summaryMeta, rosterConfig]
    );

    const previewSummaryPage = summaryPages[0] || null;
    const previewCommitteePage = committeePages[0] || null;

    return (
        <div className="p-4 md:p-8 space-y-8 animate-fade-in font-alexandria text-slate-800" dir="rtl">
            <div className="luxury-card p-8 bg-gradient-to-br from-white via-violet-50/30 to-white border-none">
                <div className="flex flex-col gap-6">
                    <div className="flex items-start gap-4">
                        <div className="p-4 rounded-2xl bg-violet-600 text-white shadow-lg">
                            <ClipboardList size={28} />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black text-slate-900 font-header">
                                طباعة كشوف الملاحظين
                            </h1>
                            <p className="text-slate-500 text-sm mt-2 font-medium max-w-2xl leading-relaxed">
                                1) وزّع الملاحظين من{' '}
                                <Link
                                    to="/committee-observers"
                                    className="text-indigo-600 font-black hover:underline inline-flex items-center gap-1"
                                >
                                    توزيع الملاحظين
                                    <ExternalLink size={14} />
                                </Link>
                                <br />
                                2) اختر الفترة واليوم من جدول الاختبارات
                                <br />
                                3) اطبع أو صدّر — <strong>تصميم مدمج</strong> مثل كشف اللجان (بدون قوالب صور)
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to="/committee-observers"
                            className="flex items-center gap-2 px-5 py-3 bg-white border rounded-2xl font-black text-sm"
                        >
                            <UserCheck size={18} className="text-indigo-600" />
                            توزيع الملاحظين
                        </Link>
                        <Link
                            to="/committee-roster-studio"
                            className="flex items-center gap-2 px-5 py-3 bg-slate-100 border border-slate-200 rounded-2xl font-black text-sm text-slate-700 hover:bg-slate-50"
                        >
                            ضبط تذييل المدير (مشترك مع كشف اللجان)
                        </Link>
                    </div>
                </div>
            </div>

            <div className="luxury-card p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="space-y-1">
                    <span className="text-xs font-black text-slate-500 flex items-center gap-2">
                        <Clock size={14} />
                        الفترة
                    </span>
                    <select
                        value={period}
                        onChange={(e) => setPeriod(parseInt(e.target.value, 10))}
                        className="w-full px-4 py-3 rounded-xl border font-bold"
                    >
                        {PERIOD_OPTIONS.map((p) => (
                            <option key={p.value} value={p.value}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1">
                    <span className="text-xs font-black text-slate-500 flex items-center gap-2">
                        <Calendar size={14} />
                        اليوم
                    </span>
                    <select
                        value={day}
                        onChange={(e) => setDay(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border font-bold"
                    >
                        <option value="الكل">الكل</option>
                        {availableDays.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="flex gap-2 p-1 bg-white rounded-[1.25rem] border shadow-sm">
                <button
                    type="button"
                    onClick={() => setActiveStage('secondary')}
                    className={stageTabClass(activeStage === 'secondary')}
                >
                    <GraduationCap size={18} />
                    {OBSERVER_SHEET_STAGES.secondary.label}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveStage('middle')}
                    className={stageTabClass(activeStage === 'middle')}
                >
                    <School size={18} />
                    {OBSERVER_SHEET_STAGES.middle.label}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                    type="button"
                    onClick={() => setPrintMode('summary')}
                    disabled={loading || !summaryPages.length}
                    className="luxury-card p-5 text-right hover:border-violet-300 transition-colors disabled:opacity-50"
                >
                    <div className="flex items-center gap-3 text-violet-700">
                        <Table2 size={24} />
                        <div>
                            <p className="font-black text-lg">الكشف المجمع</p>
                            <p className="text-xs text-slate-500 font-bold mt-1">
                                المادة · اليوم · التاريخ · الفترة + جدول المعلم واللجنة
                            </p>
                            <p className="text-sm font-black text-violet-600 mt-2">
                                {summaryRows.length} صف · {summaryPages.length} صفحة
                            </p>
                        </div>
                    </div>
                    <Printer size={20} className="text-violet-500 mr-auto" />
                </button>

                <button
                    type="button"
                    onClick={() => setPrintMode('committee')}
                    disabled={loading || !committeePages.length}
                    className="luxury-card p-5 text-right hover:border-indigo-300 transition-colors disabled:opacity-50"
                >
                    <div className="flex items-center gap-3 text-indigo-700">
                        <ClipboardList size={24} />
                        <div>
                            <p className="font-black text-lg">كشوف اللجان</p>
                            <p className="text-xs text-slate-500 font-bold mt-1">
                                صفحة لكل لجنة بأسماء ملاحظيها
                            </p>
                            <p className="text-sm font-black text-indigo-600 mt-2">
                                {committeeSource.filter((c) => c.observers?.length).length} لجنة ·{' '}
                                {committeePages.length} صفحة
                            </p>
                        </div>
                    </div>
                    <Printer size={20} className="text-indigo-500 mr-auto" />
                </button>

                <button
                    type="button"
                    onClick={() => setPrintMode('full')}
                    disabled={loading || (!summaryPages.length && !committeePages.length)}
                    className="luxury-card p-5 text-right hover:border-emerald-300 transition-colors disabled:opacity-50 bg-emerald-50/30"
                >
                    <div className="flex items-center gap-3 text-emerald-800">
                        <FileStack size={24} />
                        <div>
                            <p className="font-black text-lg">طباعة / PDF الكل</p>
                            <p className="text-xs text-slate-500 font-bold mt-1">
                                الكشف المجمع ثم كل اللجان
                            </p>
                            <p className="text-sm font-black text-emerald-700 mt-2">
                                {summaryPages.length + committeePages.length} صفحة
                            </p>
                        </div>
                    </div>
                    <Download size={20} className="text-emerald-600 mr-auto" />
                </button>
            </div>

            {summaryRows.length === 0 && !loading && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100">
                    <AlertCircle size={20} className="shrink-0 text-amber-600" />
                    <p className="text-sm font-bold text-amber-900">
                        لا توجد إسنادات ملاحظين —{' '}
                        <Link to="/committee-observers" className="text-indigo-700 underline">
                            وزّع الملاحظين على اللجان
                        </Link>{' '}
                        ثم اطبع الكشف.
                    </p>
                </div>
            )}

            {summaryMeta && (
                <div className="luxury-card p-4 flex flex-wrap gap-4 text-sm font-black text-slate-700">
                    <span>
                        المادة: <span className="text-violet-700">{summaryMeta.subject}</span>
                    </span>
                    <span>
                        اليوم: <span className="text-violet-700">{summaryMeta.day}</span>
                    </span>
                    <span>
                        التاريخ: <span className="text-violet-700">{summaryMeta.date}</span>
                    </span>
                    <span>
                        الفترة: <span className="text-violet-700">{summaryMeta.period}</span>
                    </span>
                </div>
            )}

            {loading ? (
                <p className="text-center text-slate-400 font-bold py-12">جاري التحميل...</p>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <section className="luxury-card p-6">
                            <h2 className="text-sm font-black text-violet-800 mb-4 flex items-center gap-2">
                                <Table2 size={18} />
                                معاينة الكشف المجمع
                            </h2>
                            <div className="flex justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                                {previewSummaryPage ? (
                                    <ObserverRosterSheet
                                        page={previewSummaryPage}
                                        config={rosterConfig}
                                        schoolName={schoolName}
                                        previewPx={PREVIEW_SCALE}
                                        embedded
                                    />
                                ) : (
                                    <p className="text-slate-400 font-bold py-16">لا بيانات</p>
                                )}
                            </div>
                        </section>

                        <section className="luxury-card p-6">
                            <h2 className="text-sm font-black text-indigo-800 mb-4">
                                معاينة كشف لجنة (أول لجنة بملاحظين)
                            </h2>
                            <div className="flex justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                                {previewCommitteePage ? (
                                    <ObserverRosterSheet
                                        page={previewCommitteePage}
                                        config={rosterConfig}
                                        schoolName={schoolName}
                                        previewPx={PREVIEW_SCALE}
                                        embedded
                                    />
                                ) : (
                                    <p className="text-slate-400 font-bold py-16">لا بيانات</p>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <section className="luxury-card p-6">
                            <h2 className="text-sm font-black text-violet-800 mb-4">
                                بيانات الكشف المجمع ({summaryRows.length} صف)
                            </h2>
                            <div className="overflow-x-auto max-h-80">
                                <table className="w-full text-sm font-bold text-right">
                                    <thead>
                                        <tr className="border-b text-slate-400 text-xs">
                                            <th className="py-2 px-3">اسم المعلم</th>
                                            <th className="py-2 px-3">اللجنة</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {summaryRows.map((r, i) => (
                                            <tr key={i} className="border-b border-slate-50">
                                                <td className="py-2 px-3">{r.teacherName}</td>
                                                <td className="py-2 px-3 text-indigo-600">{r.committee}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="luxury-card p-6">
                            <h2 className="text-sm font-black text-indigo-800 mb-4">
                                كشوف اللجان ({committeeSource.length})
                            </h2>
                            <ul className="space-y-2 max-h-80 overflow-y-auto text-sm font-bold">
                                {committeeSource.map((p) => (
                                    <li
                                        key={p.committeeId}
                                        className="flex justify-between py-2 border-b border-slate-50"
                                    >
                                        <span>
                                            {p.committee}
                                            {p.room && p.room !== '—' ? (
                                                <span className="text-slate-400 text-xs mr-2">— {p.room}</span>
                                            ) : null}
                                        </span>
                                        <span className="text-indigo-600 shrink-0">
                                            {p.observers.length
                                                ? p.observers.join('، ')
                                                : 'بدون ملاحظ'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                </div>
            )}

            {printMode && appConfig && (
                <ObserverRosterPrintOverlay
                    mode={printMode}
                    stageId={activeStage}
                    committees={committees}
                    observers={observers}
                    assignments={assignments}
                    appConfig={appConfig}
                    filters={filters}
                    onClose={() => setPrintMode(null)}
                />
            )}
        </div>
    );
};

export default ObserverSheets;
