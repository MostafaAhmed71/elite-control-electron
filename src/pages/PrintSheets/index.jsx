import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    Printer,
    Search,
    Users,
    SlidersHorizontal,
    Layout,
    CheckCircle2,
    Eye,
    Clock,
    Calendar,
} from 'lucide-react';
import { getStudents, getAppSettings } from '../../utils/dataService';
import {
    PERIOD_OPTIONS,
    resolveExamSchedule,
    buildSheetMetaForStudents,
    daysForFilters,
    findScheduleEntry,
} from '../../utils/examSchedule';

const PrintSheets = () => {
    const navigate = useNavigate();
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedStage, setSelectedStage] = useState('الكل');
    const [selectedGrade, setSelectedGrade] = useState('الكل');
    const [selectedCommittee, setSelectedCommittee] = useState('الكل');
    const [selectedPeriod, setSelectedPeriod] = useState(1);
    const [selectedDay, setSelectedDay] = useState('الكل');
    const [examSchedule, setExamSchedule] = useState(null);

    useEffect(() => {
        Promise.all([getStudents(), getAppSettings()]).then(([data, settings]) => {
            setStudents(data);
            setExamSchedule(resolveExamSchedule(settings?.examSchedule));
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        setSelectedGrade('الكل');
        setSelectedCommittee('الكل');
    }, [selectedStage]);

    useEffect(() => {
        setSelectedCommittee('الكل');
    }, [selectedGrade]);

    useEffect(() => {
        setSelectedDay('الكل');
    }, [selectedStage, selectedGrade, selectedPeriod]);

    const availableDays = useMemo(() => {
        if (!examSchedule) return [];
        return daysForFilters(examSchedule, {
            stage: selectedStage,
            grade: selectedGrade,
            period: selectedPeriod,
        });
    }, [examSchedule, selectedStage, selectedGrade, selectedPeriod]);

    useEffect(() => {
        if (availableDays.length === 1) {
            setSelectedDay(availableDays[0]);
        }
    }, [availableDays]);

    const stages = ['الكل', ...new Set(students.map((s) => s.stage).filter(Boolean))];

    const availableGrades = [
        ...new Set(
            students
                .filter((s) => selectedStage === 'الكل' || s.stage === selectedStage)
                .map((s) => s.grade)
                .filter(Boolean)
        ),
    ];
    const grades = ['الكل', ...availableGrades];

    const availableCommittees = [
        ...new Set(
            students
                .filter((s) => selectedStage === 'الكل' || s.stage === selectedStage)
                .filter((s) => selectedGrade === 'الكل' || s.grade === selectedGrade)
                .map((s) => s.committee)
                .filter(Boolean)
        ),
    ];
    const committees = ['الكل', ...availableCommittees];

    const filteredStudents = students.filter((s) => {
        const matchStage = selectedStage === 'الكل' || s.stage === selectedStage;
        const matchGrade = selectedGrade === 'الكل' || s.grade === selectedGrade;
        const matchCommittee = selectedCommittee === 'الكل' || s.committee === selectedCommittee;
        return matchStage && matchGrade && matchCommittee;
    });

    const scheduleEntry = examSchedule
        ? findScheduleEntry(examSchedule, {
              stage: selectedStage,
              grade: selectedGrade,
              period: selectedPeriod,
              day: selectedDay,
          })
        : null;

    const sheetMetaPreview = examSchedule
        ? buildSheetMetaForStudents(
              examSchedule,
              {
                  stage: selectedStage,
                  grade: selectedGrade,
                  period: selectedPeriod,
                  day: selectedDay,
              },
              filteredStudents
          )
        : null;

    const openPreviewStudio = () => {
        if (filteredStudents.length === 0) {
            alert('اختر فلاتراً تعرض طلاباً أولاً، ثم افتح المعاينة.');
            return;
        }
        if (
            selectedStage !== 'الكل' &&
            selectedGrade !== 'الكل' &&
            !scheduleEntry
        ) {
            const go = window.confirm(
                'لا يوجد سجل في جدول الفترات لهذا الصف والفترة. هل تريد المتابعة بدون بيانات المادة والتاريخ؟'
            );
            if (!go) return;
        }
        navigate('/print-sheets/preview', {
            state: {
                filters: {
                    stage: selectedStage,
                    grade: selectedGrade,
                    committee: selectedCommittee,
                    period: selectedPeriod,
                    day: selectedDay,
                },
            },
        });
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-alexandria pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2.5xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                            <Printer size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">
                            كشوف طباعة اللجان
                        </h1>
                    </div>
                    <p className="text-slate-400 font-medium text-sm flex items-center gap-2">
                        <Users size={16} className="text-indigo-400" />
                        اختر الفلاتر ثم انتقل لشاشة المعاينة والضبط والطباعة
                    </p>
                </div>

                <button
                    type="button"
                    onClick={openPreviewStudio}
                    disabled={loading || filteredStudents.length === 0}
                    className="px-8 py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 flex items-center gap-3 disabled:opacity-50"
                >
                    <Eye size={20} />
                    معاينة وضبط قبل الطباعة
                </button>
            </div>

            <div className="luxury-card p-2 bg-white/60 backdrop-blur-xl border-white">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2 items-center">
                    <div className="flex items-center gap-4 px-6 py-4 bg-slate-50/50 rounded-2.5xl">
                        <Layout size={20} className="text-indigo-400" />
                        <div className="flex-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                المرحلة الدراسية
                            </span>
                            <select
                                className="w-full bg-transparent font-black text-sm text-slate-800 outline-none border-none p-0 cursor-pointer"
                                value={selectedStage}
                                onChange={(e) => setSelectedStage(e.target.value)}
                            >
                                {stages.map((s) => (
                                    <option key={s} value={s}>
                                        {s === 'الكل' ? 'جميع المراحل المتاحة' : s}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 px-6 py-4 bg-slate-50/50 rounded-2.5xl">
                        <SlidersHorizontal size={20} className="text-violet-400" />
                        <div className="flex-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                الصف الدراسي
                            </span>
                            <select
                                className="w-full bg-transparent font-black text-sm text-slate-800 outline-none border-none p-0 cursor-pointer"
                                value={selectedGrade}
                                onChange={(e) => setSelectedGrade(e.target.value)}
                            >
                                {grades.map((g) => (
                                    <option key={g} value={g}>
                                        {g === 'الكل' ? 'جميع الصفوف المختارة' : g}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 px-6 py-4 bg-slate-50/50 rounded-2.5xl">
                        <CheckCircle2 size={20} className="text-emerald-400" />
                        <div className="flex-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                اللجنة المختارة
                            </span>
                            <select
                                className="w-full bg-transparent font-black text-sm text-slate-800 outline-none border-none p-0 cursor-pointer"
                                value={selectedCommittee}
                                onChange={(e) => setSelectedCommittee(e.target.value)}
                            >
                                {committees.map((c) => (
                                    <option key={c} value={c}>
                                        {c === 'الكل' ? 'توزيع اللجان بالكامل' : `اللجنة: ${c}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 px-6 py-4 bg-violet-50/50 rounded-2.5xl">
                        <Clock size={20} className="text-violet-500" />
                        <div className="flex-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                فترة الاختبار
                            </span>
                            <select
                                className="w-full bg-transparent font-black text-sm text-slate-800 outline-none border-none p-0 cursor-pointer"
                                value={selectedPeriod}
                                onChange={(e) =>
                                    setSelectedPeriod(parseInt(e.target.value, 10))
                                }
                            >
                                {PERIOD_OPTIONS.map((p) => (
                                    <option key={p.value} value={p.value}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {availableDays.length > 1 && (
                        <div className="flex items-center gap-4 px-6 py-4 bg-amber-50/50 rounded-2.5xl">
                            <Calendar size={20} className="text-amber-500" />
                            <div className="flex-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                    يوم الاختبار
                                </span>
                                <select
                                    className="w-full bg-transparent font-black text-sm text-slate-800 outline-none border-none p-0 cursor-pointer"
                                    value={selectedDay}
                                    onChange={(e) => setSelectedDay(e.target.value)}
                                >
                                    <option value="الكل">أي يوم مسجّل</option>
                                    {availableDays.map((d) => (
                                        <option key={d} value={d}>
                                            {d}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    <div className="px-6 py-4 bg-indigo-600/5 rounded-2.5xl border border-indigo-100 flex flex-col justify-center md:col-span-2 xl:col-span-1">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">
                            إجمالي الطلاب
                        </span>
                        <span className="text-2xl font-black text-indigo-700 font-header">
                            {loading ? '—' : filteredStudents.length}
                        </span>
                    </div>
                </div>

                {sheetMetaPreview && selectedStage !== 'الكل' && selectedGrade !== 'الكل' && (
                    <div className="mt-4 px-6 py-4 bg-violet-50 border border-violet-100 rounded-2xl flex flex-wrap gap-4 text-xs font-black text-violet-900">
                        <span>المادة: {sheetMetaPreview.subject}</span>
                        <span>اليوم: {sheetMetaPreview.day}</span>
                        <span>التاريخ: {sheetMetaPreview.date}</span>
                        <span>{sheetMetaPreview.periodLabel}</span>
                        {!scheduleEntry && (
                            <span className="text-rose-600">
                                ⚠ لا يوجد سجل مطابق —{' '}
                                <Link to="/exam-periods" className="underline">
                                    أضف من جدول الفترات
                                </Link>
                            </span>
                        )}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-40 opacity-20">
                    <Printer size={64} className="animate-pulse mb-4" />
                    <p className="font-black text-xl">جاري التحميل...</p>
                </div>
            ) : filteredStudents.length === 0 ? (
                <div className="luxury-card py-24 text-center w-full max-w-lg mx-auto">
                    <Search size={48} className="mx-auto mb-4 text-slate-200" />
                    <p className="text-slate-500 font-black text-lg">
                        لم يتم العثور على طلاب تطابق الفلترة
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedStage('الكل');
                            setSelectedGrade('الكل');
                            setSelectedCommittee('الكل');
                        }}
                        className="mt-4 text-indigo-600 font-bold hover:underline"
                    >
                        إعادة ضبط الفلاتر
                    </button>
                </div>
            ) : (
                <div className="luxury-card p-8 bg-indigo-50/50 border-indigo-100 text-center">
                    <Eye size={40} className="mx-auto mb-4 text-indigo-500" />
                    <p className="font-black text-slate-800 text-lg mb-2">
                        {filteredStudents.length} طالب جاهز للطباعة
                    </p>
                    <p className="text-slate-500 text-sm font-bold mb-6">
                        اضغط «معاينة وضبط قبل الطباعة» لضبط مواضع القالب ومعاينة كل الصفحات ثم الطباعة أو
                        PDF
                    </p>
                    <button
                        type="button"
                        onClick={openPreviewStudio}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm hover:bg-indigo-700 inline-flex items-center gap-3"
                    >
                        <Eye size={20} />
                        فتح شاشة المعاينة
                    </button>
                </div>
            )}
        </div>
    );
};

export default PrintSheets;
