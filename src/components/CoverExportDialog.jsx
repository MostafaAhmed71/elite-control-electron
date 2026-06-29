import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, FileText } from 'lucide-react';
import { formatCommitteeDisplay } from '../utils/attendanceLayout';
import { PERIOD_OPTIONS, daysForFilters } from '../utils/examSchedule';
import { coverStageToStudentStage } from '../utils/coverTemplates';
import {
    buildCoverContext,
    committeesFromStudents,
    resolveCoverFieldData,
} from '../utils/coverDataSources';
import { exportCoverToPdf, resolveCoverLayout } from '../utils/coverTemplates';

const CoverExportDialog = ({
    open,
    onClose,
    appConfig,
    template,
    layoutDraft,
    students = [],
    committees = [],
}) => {
    const studentStage = coverStageToStudentStage(template?.stage);
    const stageStudents = useMemo(
        () => (students || []).filter((s) => !studentStage || s.stage === studentStage),
        [students, studentStage]
    );

    const grades = useMemo(
        () => [...new Set(stageStudents.map((s) => s.grade).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b, 'ar', { numeric: true })
        ),
        [stageStudents]
    );

    const [grade, setGrade] = useState('');
    const [committee, setCommittee] = useState('');
    const [period, setPeriod] = useState(1);
    const [day, setDay] = useState('الكل');
    const [exporting, setExporting] = useState(false);
    const [previewData, setPreviewData] = useState(null);

    useEffect(() => {
        if (!open) return;
        const g = grades[0] || '';
        setGrade(g);
        setPeriod(1);
        setDay('الكل');
    }, [open, grades]);

    const committeesForGrade = useMemo(() => {
        if (!grade) return [];
        const list = committeesFromStudents(
            stageStudents.filter((s) => s.grade === grade)
        );
        return list.sort((a, b) =>
            String(a).localeCompare(String(b), 'ar', { numeric: true })
        );
    }, [stageStudents, grade]);

    useEffect(() => {
        if (!open || !grade) return;
        const first = committeesForGrade[0] || '';
        setCommittee(first);
    }, [open, grade, committeesForGrade]);

    const availableDays = useMemo(() => {
        if (!appConfig?.examSchedule || !grade) return [];
        return daysForFilters(appConfig.examSchedule, {
            stage: studentStage,
            grade,
            period,
        });
    }, [appConfig, studentStage, grade, period]);

    const filters = useMemo(
        () => ({
            stage: studentStage || 'الكل',
            grade,
            committee: 'الكل',
            period,
            day,
        }),
        [studentStage, grade, period, day]
    );

    const exportContext = useMemo(() => {
        if (!grade || !committee) return null;
        return buildCoverContext({
            appConfig,
            students: stageStudents,
            committees,
            filters,
            committee,
        });
    }, [appConfig, stageStudents, committees, filters, grade, committee]);

    useEffect(() => {
        if (!exportContext || !template?.fields) {
            setPreviewData(null);
            return;
        }
        setPreviewData(resolveCoverFieldData(template.fields, exportContext));
    }, [exportContext, template?.fields]);

    const handleExport = async () => {
        if (!grade) {
            alert('اختر الصف');
            return;
        }
        if (!committee) {
            alert('اختر رقم اللجنة');
            return;
        }
        if (!exportContext || !previewData) return;

        setExporting(true);
        try {
            const layout = layoutDraft || resolveCoverLayout(appConfig, template.id);
            const safe = (s) => String(s).replace(/[^\w\u0600-\u06FF]+/g, '_');
            await exportCoverToPdf(
                appConfig,
                template.id,
                previewData,
                layout,
                `غلاف-${safe(grade)}-${safe(committee)}.pdf`
            );
            onClose?.();
        } catch (err) {
            console.error(err);
            alert('تعذّر تصدير الغلاف.');
        } finally {
            setExporting(false);
        }
    };

    if (!open) return null;

    const studentCount = exportContext?.studentCount ?? 0;

    return (
        <div
            className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm font-alexandria"
            dir="rtl"
            onClick={(e) => e.target === e.currentTarget && onClose?.()}
        >
            <div
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                            <FileText size={22} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-900">تصدير الغلاف</h3>
                            <p className="text-xs text-slate-500 font-bold">{template?.name}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-rose-500"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-600 font-medium leading-relaxed">
                        اختر الصف ورقم اللجنة لملء الحقول ببيانات حقيقية من النظام ثم تنزيل
                        ملف PDF.
                    </p>

                    <label className="block space-y-1">
                        <span className="text-xs font-black text-slate-500">الصف</span>
                        <select
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                        >
                            <option value="">— اختر الصف —</option>
                            {grades.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block space-y-1">
                        <span className="text-xs font-black text-slate-500">رقم اللجنة</span>
                        <select
                            value={committee}
                            onChange={(e) => setCommittee(e.target.value)}
                            disabled={!grade || committeesForGrade.length === 0}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold disabled:opacity-50"
                        >
                            {!grade ? (
                                <option value="">اختر الصف أولاً</option>
                            ) : committeesForGrade.length === 0 ? (
                                <option value="">لا توجد لجان لهذا الصف</option>
                            ) : (
                                committeesForGrade.map((c) => (
                                    <option key={c} value={c}>
                                        {formatCommitteeDisplay(c)}
                                    </option>
                                ))
                            )}
                        </select>
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                        <label className="block space-y-1">
                            <span className="text-xs font-black text-slate-500">الفترة</span>
                            <select
                                value={period}
                                onChange={(e) => setPeriod(parseInt(e.target.value, 10))}
                                className="w-full px-3 py-2.5 rounded-xl border font-bold text-sm"
                            >
                                {PERIOD_OPTIONS.map((p) => (
                                    <option key={p.value} value={p.value}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {availableDays.length > 0 && (
                            <label className="block space-y-1">
                                <span className="text-xs font-black text-slate-500">اليوم</span>
                                <select
                                    value={day}
                                    onChange={(e) => setDay(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border font-bold text-sm"
                                >
                                    <option value="الكل">الكل</option>
                                    {availableDays.map((d) => (
                                        <option key={d} value={d}>
                                            {d}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                    </div>

                    {previewData && (
                        <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-100 space-y-2">
                            <p className="text-[10px] font-black text-indigo-800 uppercase">
                                معاينة البيانات ({studentCount} طالب)
                            </p>
                            <ul className="text-xs font-bold text-slate-700 space-y-1 max-h-32 overflow-y-auto">
                                {(template?.fields || []).map((f) => (
                                    <li key={f.key} className="flex justify-between gap-2">
                                        <span className="text-slate-500 shrink-0">{f.label}:</span>
                                        <span className="text-left truncate">{previewData[f.key]}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 px-6 py-5 border-t bg-slate-50/80">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-3 rounded-2xl font-black text-sm border border-slate-200 bg-white"
                    >
                        إلغاء
                    </button>
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={exporting || !grade || !committee}
                        className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        <Download size={18} />
                        {exporting ? 'جاري التصدير...' : 'تصدير PDF'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CoverExportDialog;
