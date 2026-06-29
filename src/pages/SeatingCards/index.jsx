import React, { useState, useEffect, useMemo } from 'react';
import {
    CreditCard,
    Download,
    FileDown,
    GraduationCap,
    Hash,
    ImageDown,
    Layers,
    Move,
    Printer,
    RefreshCw,
    Search,
    Trash2,
    UserCircle2,
} from 'lucide-react';
import SeatCardLayoutEditor from '../../components/SeatCardLayoutEditor';
import { getStudents, getAppSettings, saveStudentsBulk } from '../../utils/dataService';
import { exportFromLivePreview } from '../../utils/pdfExport';
import {
    assignSeatsToGrade,
    clearSeatsForGrade,
    compareStudentNames,
    getStudentSortName,
    getSuggestedSeatStart,
    matchesStageGrade,
    saveStageSeatCursor,
} from '../../utils/seatNumberGenerator';

const safeFilePart = (s) =>
    String(s ?? '')
        .trim()
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 40) || 'بدون_تسمية';

const SeatingCards = () => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [appConfig, setAppConfig] = useState(null);
    const [selectedStage, setSelectedStage] = useState('');
    const [selectedGrade, setSelectedGrade] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [startNumber, setStartNumber] = useState('');
    const [generatingSeats, setGeneratingSeats] = useState(false);
    const [clearingSeats, setClearingSeats] = useState(false);
    const [exportProgress, setExportProgress] = useState(null);
    /** @type {null | { mode: 'settings' } | { mode: 'export', type, students, filename, cardsPerPage?, singleId? }} */
    const [previewModal, setPreviewModal] = useState(null);

    useEffect(() => {
        const init = async () => {
            const [settings, list] = await Promise.all([getAppSettings(), getStudents()]);
            setAppConfig(settings);
            setStudents(list);
            setLoading(false);
        };
        init();
    }, []);

    useEffect(() => {
        setSelectedGrade('');
    }, [selectedStage]);

    /** عند تغيير المرحلة/الصف: اقتراح الرقم التالي في نفس المرحلة */
    useEffect(() => {
        if (!selectedStage) {
            setStartNumber('');
            return;
        }
        setStartNumber(String(getSuggestedSeatStart(students, selectedStage)));
    }, [selectedStage, selectedGrade, students]);

    const schoolName = appConfig?.platformName || 'نخبة الشمال';

    const openExportPreview = (job) => {
        if (!appConfig) return;
        const missing = job.students.filter((s) => !s.seatNumber);
        if (missing.length > 0 && !window.confirm(
            `يوجد ${missing.length} طالب بدون رقم جلوس. هل تريد المتابعة؟`
        )) {
            return;
        }
        setPreviewModal({ mode: 'export', ...job });
    };

    const stages = useMemo(
        () => [...new Set(students.map((s) => s.stage).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')),
        [students]
    );

    const grades = useMemo(() => {
        if (!selectedStage) return [];
        return [
            ...new Set(
                students
                    .filter((s) => s.stage === selectedStage)
                    .map((s) => s.grade)
                    .filter(Boolean)
            ),
        ].sort((a, b) => a.localeCompare(b, 'ar'));
    }, [students, selectedStage]);

    const filtersReady = Boolean(selectedStage && selectedGrade);

    const filteredStudents = useMemo(() => {
        if (!filtersReady) return [];
        const q = searchTerm.trim().toLowerCase();
        return students
            .filter((s) => matchesStageGrade(s, selectedStage, selectedGrade))
            .filter((s) => {
                if (!q) return true;
                const name = getStudentSortName(s).toLowerCase();
                const seat = String(s.seatNumber ?? '');
                return name.includes(q) || seat.includes(q);
            })
            .sort(compareStudentNames);
    }, [students, selectedStage, selectedGrade, searchTerm, filtersReady]);

    const withSeatCount = filteredStudents.filter((s) => s.seatNumber).length;
    const withoutSeat = filteredStudents.length - withSeatCount;

    const suggestedNextAfterBatch = useMemo(() => {
        const n = parseInt(startNumber, 10);
        if (Number.isNaN(n) || !filteredStudents.length) return null;
        return n + filteredStudents.length;
    }, [startNumber, filteredStudents.length]);

    const handleGenerateSeats = async () => {
        if (!filtersReady) {
            alert('اختر المرحلة والصف أولاً.');
            return;
        }
        const startNum = parseInt(startNumber, 10);
        if (Number.isNaN(startNum) || startNum < 0) {
            alert('أدخل رقم بداية صحيحاً.');
            return;
        }
        if (filteredStudents.length === 0) {
            alert('لا يوجد طلاب في هذا الصف.');
            return;
        }

        const missingNames = filteredStudents.filter((s) => !getStudentSortName(s));
        if (missingNames.length > 0) {
            alert(
                `يوجد ${missingNames.length} طالب بدون اسم في هذا الصف.\n` +
                    'أكمل الأسماء من قائمة الطلاب ثم أعد التوليد لترتيب أبجدي صحيح.'
            );
            return;
        }

        const withSeat = filteredStudents.filter((s) => s.seatNumber);
        if (
            withSeat.length > 0 &&
            !window.confirm(
                `يوجد ${withSeat.length} طالب لديهم رقم جلوس مسبقاً في هذا الصف.\nهل تريد استبدال الأرقام وتوليد تسلسل جديد من ${startNum}؟`
            )
        ) {
            return;
        }

        const endPreview =
            suggestedNextAfterBatch != null ? suggestedNextAfterBatch - 1 : startNum + filteredStudents.length - 1;

        if (
            !window.confirm(
                `توليد ${filteredStudents.length} رقم جلوس للصف «${selectedGrade}»\nمن ${startNum} إلى ${endPreview}\n\nالصف التالي في نفس المرحلة سيبدأ من ${endPreview + 1}.`
            )
        ) {
            return;
        }

        setGeneratingSeats(true);
        try {
            const { updated, count, nextStart, sortedTargets } = assignSeatsToGrade(
                students,
                selectedStage,
                selectedGrade,
                startNum
            );
            await saveStudentsBulk(updated);
            setStudents(updated);
            const first = sortedTargets[0] ? getStudentSortName(sortedTargets[0]) : '—';
            const last = sortedTargets.length
                ? getStudentSortName(sortedTargets[sortedTargets.length - 1])
                : '—';
            saveStageSeatCursor(selectedStage, nextStart);
            setStartNumber(String(nextStart));
            alert(
                `تم توليد ${count} رقم جلوس (ترتيب أبجدي).\n` +
                    `من: ${first}\nإلى: ${last}\n\n` +
                    `الرقم التالي للصف القادم في «${selectedStage}»: ${nextStart}`
            );
        } catch (err) {
            console.error(err);
            alert('فشل حفظ أرقام الجلوس. تحقق من الاتصال.');
        } finally {
            setGeneratingSeats(false);
        }
    };

    const handleRefreshSuggestedStart = () => {
        if (!selectedStage) return;
        setStartNumber(String(getSuggestedSeatStart(students, selectedStage)));
    };

    const handleClearSeats = async () => {
        if (!filtersReady) {
            alert('اختر المرحلة والصف أولاً.');
            return;
        }
        if (withSeatCount === 0) {
            alert('لا توجد أرقام جلوس في هذا الصف لحذفها.');
            return;
        }
        if (
            !window.confirm(
                `حذف أرقام الجلوس لـ ${withSeatCount} طالب في الصف «${selectedGrade}» (${selectedStage})؟\n\nلن يُحذف الطلاب من النظام — فقط رقم الجلوس.`
            )
        ) {
            return;
        }

        setClearingSeats(true);
        try {
            const { updated, count } = clearSeatsForGrade(students, selectedStage, selectedGrade);
            await saveStudentsBulk(updated);
            setStudents(updated);
            const next = getSuggestedSeatStart(updated, selectedStage);
            setStartNumber(String(next));
            alert(`تم حذف ${count} رقم جلوس من الصف «${selectedGrade}».`);
        } catch (err) {
            console.error(err);
            alert('فشل حذف أرقام الجلوس. تحقق من الاتصال.');
        } finally {
            setClearingSeats(false);
        }
    };

    const handleExportAll = () => {
        if (!filteredStudents.length) return;
        openExportPreview({
            type: 'pdf',
            students: filteredStudents,
            filename: `بطاقات_جلوس_${safeFilePart(selectedStage)}_${safeFilePart(selectedGrade)}.pdf`,
            cardsPerPage: 8,
            count: filteredStudents.length,
        });
    };

    const handleExportOnePdf = (student) => {
        if (!student.seatNumber) {
            alert('لا يوجد رقم جلوس لهذا الطالب.');
            return;
        }
        openExportPreview({
            type: 'pdf',
            students: [student],
            filename: `بطاقة_جلوس_${safeFilePart(student.seatNumber)}.pdf`,
            cardsPerPage: 1,
            singleId: student.id,
            count: 1,
        });
    };

    const handleExportOneJpeg = (student) => {
        if (!student.seatNumber) {
            alert('لا يوجد رقم جلوس لهذا الطالب.');
            return;
        }
        openExportPreview({
            type: 'jpeg',
            students: [student],
            filename: `seat_card_${safeFilePart(student.seatNumber)}.jpg`,
            count: 1,
        });
    };

    const handleConfirmExportFromPreview = async (config, previewEl) => {
        const job = previewModal;
        if (!job || job.mode !== 'export') return;

        setExportProgress(
            job.type === 'pdf' && (job.count ?? 1) > 1
                ? { page: 0, totalPages: Math.ceil(job.students.length / 8), percent: 0 }
                : null
        );

        try {
            await exportFromLivePreview(
                previewEl,
                {
                    type: job.type,
                    filename: job.filename,
                    students: job.students,
                    cardsPerPage: job.cardsPerPage ?? 8,
                    count: job.count ?? job.students?.length ?? 1,
                },
                config,
                { onProgress: setExportProgress }
            );
        } finally {
            setExportProgress(null);
        }
    };

    const handlePrint = () => {
        if (!filtersReady || filteredStudents.length === 0) {
            alert('اختر المرحلة والصف أولاً، وتأكد من وجود طلاب.');
            return;
        }
        window.print();
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700 font-alexandria pb-20" dir="rtl">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2.5xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                            <CreditCard size={24} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">
                                أرقام الجلوس
                            </h1>
                            <p className="text-slate-400 font-medium text-sm mt-1">
                                القالب: <span className="text-indigo-600 font-bold">school_logo.jpeg</span>
                                — اختر المرحلة والصف ثم صدّر JPG أو PDF
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setPreviewModal({ mode: 'settings' })}
                        className="px-6 py-4 bg-amber-50 text-amber-800 rounded-3xl font-black text-sm hover:bg-amber-100 transition-all border border-amber-100 flex items-center gap-3"
                    >
                        <Move size={20} />
                        ضبط مواضع القالب
                    </button>
                    <button
                        type="button"
                        onClick={handleExportAll}
                        disabled={!filtersReady || filteredStudents.length === 0}
                        className="px-6 py-4 bg-white text-indigo-600 rounded-3xl font-black text-sm hover:bg-indigo-50 transition-all shadow-sm border border-indigo-100 flex items-center gap-3 disabled:opacity-50"
                    >
                        <Download size={20} />
                        <span>تصدير كل البطاقات PDF</span>
                    </button>
                    <button
                        type="button"
                        onClick={handlePrint}
                        disabled={!filtersReady || filteredStudents.length === 0}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center gap-3 disabled:opacity-50"
                    >
                        <Printer size={20} />
                        طباعة القائمة
                    </button>
                </div>
            </div>

            {/* ── Filters ── */}
            <div className="luxury-card p-6 md:p-8 bg-white border-none print:hidden">
                <div className="flex items-center gap-2 mb-6">
                    <Layers size={18} className="text-indigo-500" />
                    <h2 className="font-black text-slate-800 font-header">اختيار المرحلة والصف</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <label className="space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            المرحلة
                        </span>
                        <select
                            value={selectedStage}
                            onChange={(e) => setSelectedStage(e.target.value)}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                        >
                            <option value="">— اختر المرحلة —</option>
                            {stages.map((st) => (
                                <option key={st} value={st}>
                                    {st}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            الصف
                        </span>
                        <select
                            value={selectedGrade}
                            onChange={(e) => setSelectedGrade(e.target.value)}
                            disabled={!selectedStage}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
                        >
                            <option value="">— اختر الصف —</option>
                            {grades.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            بحث بالاسم أو رقم الجلوس
                        </span>
                        <div className="relative">
                            <Search
                                size={18}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                disabled={!filtersReady}
                                placeholder="ابحث..."
                                className="w-full pr-12 pl-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
                            />
                        </div>
                    </label>
                </div>

                {filtersReady && (
                    <>
                        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-bold text-slate-600">
                            <span className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl">
                                {selectedStage} — {selectedGrade}
                            </span>
                            <span>{filteredStudents.length} طالب</span>
                            {withoutSeat > 0 && (
                                <span className="text-amber-700 bg-amber-50 px-3 py-1 rounded-lg">
                                    {withoutSeat} بدون رقم جلوس
                                </span>
                            )}
                        </div>

                        <div className="mt-6 p-5 md:p-6 bg-emerald-50/80 border border-emerald-100 rounded-2xl space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                    <Hash size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-emerald-900 font-header">
                                        توليد أرقام الجلوس تلقائياً
                                    </h3>
                                    <p className="text-xs font-bold text-emerald-800/80 mt-1 leading-relaxed">
                                        يُرتَّب الطلاب <strong>أبجدياً بالاسم</strong> ثم يُعطى أول طالب أول رقم
                                        (مثلاً 1001، 1002…). القائمة والطباعة بنفس الترتيب. عند صف آخر في{' '}
                                        <strong>نفس المرحلة</strong> يُقترح الرقم التالي تلقائياً.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                                <label className="space-y-2">
                                    <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">
                                        رقم بداية الجلوس
                                    </span>
                                    <div className="flex gap-2">
                                        <input
                                            type="number"
                                            min={0}
                                            value={startNumber}
                                            onChange={(e) => setStartNumber(e.target.value)}
                                            className="flex-1 px-5 py-3.5 bg-white border border-emerald-100 rounded-xl font-black font-mono text-lg text-slate-800 outline-none focus:ring-2 focus:ring-emerald-300"
                                            placeholder="1001"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleRefreshSuggestedStart}
                                            title="تحديث من آخر رقم في المرحلة"
                                            className="px-4 py-3.5 bg-white border border-emerald-100 rounded-xl text-emerald-700 hover:bg-emerald-100 transition-all"
                                        >
                                            <RefreshCw size={18} />
                                        </button>
                                    </div>
                                </label>

                                <div className="text-sm font-bold text-emerald-900/90 pb-1">
                                    {suggestedNextAfterBatch != null && filteredStudents.length > 0 ? (
                                        <p>
                                            نطاق هذا الصف:{' '}
                                            <span className="font-mono text-emerald-700">
                                                {startNumber} — {suggestedNextAfterBatch - 1}
                                            </span>
                                            <br />
                                            <span className="text-xs text-emerald-700/80">
                                                الصف التالي في «{selectedStage}» يبدأ من{' '}
                                                <span className="font-mono font-black">{suggestedNextAfterBatch}</span>
                                            </span>
                                        </p>
                                    ) : (
                                        <p className="text-emerald-700/70 text-xs">أدخل رقم البداية ثم اضغط التوليد</p>
                                    )}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto sm:col-span-2 lg:col-span-1 lg:justify-end">
                                    <button
                                        type="button"
                                        onClick={handleGenerateSeats}
                                        disabled={
                                            generatingSeats ||
                                            clearingSeats ||
                                            filteredStudents.length === 0
                                        }
                                        className="w-full px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        <Hash size={18} />
                                        {generatingSeats
                                            ? 'جاري الحفظ...'
                                            : `توليد ${filteredStudents.length} رقم`}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleClearSeats}
                                        disabled={
                                            clearingSeats ||
                                            generatingSeats ||
                                            withSeatCount === 0
                                        }
                                        title="حذف أرقام الجلوس المولَّدة لهذا الصف فقط"
                                        className="w-full px-6 py-4 bg-white border-2 border-rose-200 text-rose-700 rounded-2xl font-black text-sm hover:bg-rose-50 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={18} />
                                        {clearingSeats
                                            ? 'جاري الحذف...'
                                            : `حذف الأرقام (${withSeatCount})`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Content ── */}
            {loading ? (
                <div className="luxury-card py-24 text-center text-slate-400 font-black">
                    جاري تحميل بيانات الطلاب...
                </div>
            ) : students.length === 0 ? (
                <div className="luxury-card py-24 text-center">
                    <UserCircle2 size={48} className="mx-auto mb-4 text-slate-200" />
                    <p className="text-slate-600 font-black text-lg">لا يوجد طلاب مسجّلون</p>
                    <p className="text-slate-400 text-sm mt-2">
                        استورد الطلاب من الإعدادات أو من نظام الرصد أولاً
                    </p>
                </div>
            ) : !filtersReady ? (
                <div className="luxury-card py-20 text-center border-2 border-dashed border-slate-100">
                    <GraduationCap size={40} className="mx-auto mb-4 text-indigo-300" />
                    <p className="font-black text-slate-700 text-lg">اختر المرحلة والصف لعرض الطلاب</p>
                    <p className="text-slate-400 text-sm mt-2 font-medium">
                        ستظهر قائمة بأسماء الطلاب وأرقام جلوسهم بعد الاختيار
                    </p>
                </div>
            ) : filteredStudents.length === 0 ? (
                <div className="luxury-card py-20 text-center">
                    <p className="font-black text-slate-600">لا يوجد طلاب في هذا الصف</p>
                    {searchTerm && (
                        <p className="text-slate-400 text-sm mt-2">جرّب تغيير كلمة البحث</p>
                    )}
                </div>
            ) : (
                <>
                    {/* Print-only header */}
                    <div className="hidden print:block text-center mb-6">
                        <h2 className="text-2xl font-black">{schoolName}</h2>
                        <p className="font-bold text-slate-600 mt-1">
                            كشف أرقام الجلوس — {selectedStage} / {selectedGrade}
                        </p>
                    </div>

                    <div className="luxury-card overflow-hidden bg-white border-none print:shadow-none print:border print:border-slate-200">
                        <p className="px-6 py-2 text-[10px] font-bold text-slate-400 print:hidden border-b border-slate-50">
                            الترتيب: أبجدي حسب اسم الطالب (يُطابق تسلسل توليد أرقام الجلوس)
                        </p>
                        <table className="w-full text-right">
                            <thead className="bg-slate-50 print:bg-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16">
                                        م
                                    </th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        اسم الطالب
                                    </th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        رقم الجلوس
                                    </th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest print:hidden w-56">
                                        تصدير
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredStudents.map((student, index) => (
                                    <tr
                                        key={student.id}
                                        className="hover:bg-indigo-50/30 transition-colors print:hover:bg-transparent"
                                    >
                                        <td className="px-6 py-4 text-slate-400 font-black text-sm">
                                            {index + 1}
                                        </td>
                                        <td className="px-6 py-4 font-black text-slate-900">
                                            {getStudentSortName(student) || '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex min-w-[3rem] justify-center px-4 py-2 rounded-xl font-black font-header text-lg tracking-widest ${
                                                    student.seatNumber
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                                                }`}
                                            >
                                                {student.seatNumber || '—'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 print:hidden">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleExportOneJpeg(student)}
                                                    disabled={!student.seatNumber}
                                                    title="تصدير صورة JPEG للمشاركة"
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-black text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-40"
                                                >
                                                    <ImageDown size={14} />
                                                    JPG
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleExportOnePdf(student)}
                                                    disabled={!student.seatNumber}
                                                    title="تصدير PDF"
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-100 rounded-xl text-xs font-black text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-40"
                                                >
                                                    <FileDown size={14} />
                                                    PDF
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Hidden print area: cards for optional print layout — kept minimal; main print is table */}
                </>
            )}

            {previewModal && appConfig && (
                <SeatCardLayoutEditor
                    appConfig={appConfig}
                    mode={previewModal.mode}
                    previewStudent={
                        previewModal.mode === 'export'
                            ? previewModal.students?.[0]
                            : null
                    }
                    exportJob={
                        previewModal.mode === 'export'
                            ? {
                                  type: previewModal.type,
                                  count: previewModal.count ?? previewModal.students?.length,
                              }
                            : null
                    }
                    onClose={() => setPreviewModal(null)}
                    onSaved={(next) => setAppConfig(next)}
                    onConfirmExport={
                        previewModal.mode === 'export'
                            ? handleConfirmExportFromPreview
                            : undefined
                    }
                />
            )}

            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 12mm; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    aside, nav, header, .print\\:hidden { display: none !important; }
                    main { margin: 0 !important; padding: 0 !important; }
                }
            `}</style>
        </div>
    );
};

export default SeatingCards;
