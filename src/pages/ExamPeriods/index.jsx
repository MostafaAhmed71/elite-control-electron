import React, { useState, useEffect, useMemo } from 'react';
import {
    Calendar,
    Plus,
    Save,
    Trash2,
    Edit2,
    X,
    Clock,
    BookOpen,
    GraduationCap,
} from 'lucide-react';
import { getAppSettings, saveAppSettings, getStudents, getOmrSubjects } from '../../utils/dataService';
import {
    EXAM_WEEKDAYS,
    PERIOD_OPTIONS,
    resolveExamSchedule,
    dateForDay,
    periodLabel,
    subjectNamesFromOmr,
} from '../../utils/examSchedule';

const emptyForm = () => ({
    stage: '',
    grade: '',
    day: EXAM_WEEKDAYS[0],
    subject: '',
    period: 1,
});

const ExamPeriods = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [students, setStudents] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [schedule, setSchedule] = useState(resolveExamSchedule(null));
    const [form, setForm] = useState(emptyForm());
    const [editingId, setEditingId] = useState(null);
    const [filterStage, setFilterStage] = useState('الكل');

    useEffect(() => {
        const load = async () => {
            const [settings, list, omrSubs] = await Promise.all([
                getAppSettings(),
                getStudents(),
                getOmrSubjects(),
            ]);
            setSchedule(resolveExamSchedule(settings?.examSchedule));
            setStudents(list);
            setSubjects(subjectNamesFromOmr(omrSubs));
            setLoading(false);
        };
        load();
    }, []);

    const stages = useMemo(
        () => [...new Set(students.map((s) => s.stage).filter(Boolean))].sort(),
        [students]
    );

    const gradesForForm = useMemo(() => {
        if (!form.stage) return [];
        return [
            ...new Set(
                students.filter((s) => s.stage === form.stage).map((s) => s.grade).filter(Boolean)
            ),
        ].sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
    }, [students, form.stage]);

    const filteredEntries = useMemo(() => {
        const list = schedule.entries || [];
        if (filterStage === 'الكل') return list;
        return list.filter((e) => e.stage === filterStage);
    }, [schedule.entries, filterStage]);

    const groupedEntries = useMemo(() => {
        const map = {};
        filteredEntries.forEach((e) => {
            const key = `${e.stage}|||${e.grade}`;
            if (!map[key]) map[key] = { stage: e.stage, grade: e.grade, rows: [] };
            map[key].rows.push(e);
        });
        return Object.values(map).sort((a, b) =>
            `${a.stage}${a.grade}`.localeCompare(`${b.stage}${b.grade}`, 'ar', { numeric: true })
        );
    }, [filteredEntries]);

    const updateDayDate = (day, value) => {
        setSchedule((prev) => ({
            ...prev,
            dayDates: { ...prev.dayDates, [day]: value },
        }));
    };

    const resetForm = () => {
        setForm(emptyForm());
        setEditingId(null);
    };

    const handleEdit = (entry) => {
        setEditingId(entry.id);
        setForm({
            stage: entry.stage,
            grade: entry.grade,
            day: entry.day,
            subject: entry.subject,
            period: entry.period,
        });
    };

    const handleDelete = (id) => {
        if (!window.confirm('حذف هذا السجل من الجدول؟')) return;
        setSchedule((prev) => ({
            ...prev,
            entries: prev.entries.filter((e) => e.id !== id),
        }));
        if (editingId === id) resetForm();
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.stage || !form.grade || !form.subject) {
            alert('أكمل المرحلة والصف والمادة');
            return;
        }
        const period = parseInt(form.period, 10) === 2 ? 2 : 1;
        const duplicate = schedule.entries.some(
            (x) =>
                x.id !== editingId &&
                x.stage === form.stage &&
                x.grade === form.grade &&
                x.day === form.day &&
                x.period === period
        );
        if (duplicate) {
            alert('يوجد سجل لهذا الصف في نفس اليوم والفترة. عدّل السجل الحالي أو احذفه.');
            return;
        }

        const row = {
            id: editingId || `es-${Date.now()}`,
            stage: form.stage,
            grade: form.grade,
            day: form.day,
            subject: form.subject,
            period,
        };

        setSchedule((prev) => {
            const entries = editingId
                ? prev.entries.map((x) => (x.id === editingId ? row : x))
                : [...prev.entries, row];
            return { ...prev, entries };
        });
        resetForm();
    };

    const handleSaveAll = async () => {
        setSaving(true);
        try {
            const settings = await getAppSettings();
            await saveAppSettings({
                ...settings,
                examSchedule: schedule,
            });
            alert('تم حفظ جدول الفترات');
        } catch (err) {
            console.error(err);
            alert('فشل الحفظ');
        } finally {
            setSaving(false);
        }
    };

    const previewDate = dateForDay(schedule, form.day);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-40 font-alexandria">
                <Calendar size={48} className="text-indigo-200 animate-pulse mb-4" />
                <p className="font-black text-slate-500">جاري التحميل...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-alexandria pb-20" dir="rtl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-violet-100">
                            <Clock size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">
                            جدول فترات الاختبار
                        </h1>
                    </div>
                    <p className="text-slate-400 font-medium text-sm max-w-xl">
                        عرّف المادة لكل مرحلة وصف وفترة (أولى / ثانية). عند طباعة الكشوف تُملأ المادة
                        واليوم والتاريخ والفترة تلقائياً.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleSaveAll}
                    disabled={saving}
                    className="px-8 py-4 bg-violet-600 text-white rounded-3xl font-black text-sm hover:bg-violet-700 flex items-center gap-3 disabled:opacity-50 shadow-lg shadow-violet-100"
                >
                    <Save size={20} />
                    {saving ? 'جاري الحفظ...' : 'حفظ الجدول'}
                </button>
            </div>

            <div className="luxury-card p-8 bg-violet-50/40 border-violet-100">
                <h2 className="font-black text-slate-900 font-header mb-4 flex items-center gap-2">
                    <Calendar size={20} className="text-violet-600" />
                    تواريخ أيام الاختبار
                </h2>
                <p className="text-xs font-bold text-slate-500 mb-6">
                    عند اختيار اليوم في الجدول يظهر التاريخ تلقائياً من هنا
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {EXAM_WEEKDAYS.map((day) => (
                        <label key={day} className="block space-y-2">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {day}
                            </span>
                            <input
                                type="date"
                                value={schedule.dayDates[day] || ''}
                                onChange={(e) => updateDayDate(day, e.target.value)}
                                className="w-full px-4 py-3 rounded-2xl border border-violet-100 font-bold text-sm bg-white"
                            />
                        </label>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-8 items-start">
                <form
                    onSubmit={handleSubmit}
                    className="luxury-card p-6 bg-white border-slate-100 space-y-5 xl:sticky xl:top-28"
                >
                    <h2 className="font-black text-slate-900 font-header flex items-center gap-2">
                        <Plus size={20} className="text-emerald-500" />
                        {editingId ? 'تعديل سجل' : 'إضافة للجدول'}
                    </h2>

                    <label className="block space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">المرحلة</span>
                        <select
                            required
                            value={form.stage}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    stage: e.target.value,
                                    grade: '',
                                }))
                            }
                            className="w-full px-4 py-3 rounded-2xl border border-slate-100 font-black text-sm"
                        >
                            <option value="">اختر المرحلة</option>
                            {stages.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">الصف</span>
                        <select
                            required
                            value={form.grade}
                            onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                            disabled={!form.stage}
                            className="w-full px-4 py-3 rounded-2xl border border-slate-100 font-black text-sm disabled:opacity-40"
                        >
                            <option value="">اختر الصف</option>
                            {gradesForForm.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">اليوم</span>
                        <select
                            value={form.day}
                            onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
                            className="w-full px-4 py-3 rounded-2xl border border-slate-100 font-black text-sm"
                        >
                            {EXAM_WEEKDAYS.map((d) => (
                                <option key={d} value={d}>
                                    {d}
                                </option>
                            ))}
                        </select>
                        {previewDate && (
                            <span className="text-xs font-black text-violet-600 block">
                                التاريخ: {previewDate}
                            </span>
                        )}
                    </label>

                    <label className="block space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">المادة</span>
                        <select
                            required
                            value={form.subject}
                            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                            className="w-full px-4 py-3 rounded-2xl border border-slate-100 font-black text-sm"
                        >
                            <option value="">اختر المادة</option>
                            {subjects.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                        {subjects.length === 0 && (
                            <p className="text-[10px] text-amber-600 font-bold">
                                أضف مواداً من نظام الرصد → إدارة الاختبارات → المواد
                            </p>
                        )}
                    </label>

                    <label className="block space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">الفترة</span>
                        <select
                            value={form.period}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, period: parseInt(e.target.value, 10) }))
                            }
                            className="w-full px-4 py-3 rounded-2xl border border-slate-100 font-black text-sm"
                        >
                            {PERIOD_OPTIONS.map((p) => (
                                <option key={p.value} value={p.value}>
                                    {p.label}
                                </option>
                            ))}
                        </select>
                    </label>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="submit"
                            className="flex-1 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm hover:bg-emerald-700"
                        >
                            {editingId ? 'تحديث' : 'إضافة'}
                        </button>
                        {editingId && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="px-4 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>
                </form>

                <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase">عرض حسب المرحلة:</span>
                        <select
                            value={filterStage}
                            onChange={(e) => setFilterStage(e.target.value)}
                            className="px-4 py-2 rounded-xl border border-slate-100 font-black text-sm"
                        >
                            <option value="الكل">الكل</option>
                            {stages.map((s) => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                        <span className="text-xs font-bold text-slate-400">
                            {schedule.entries.length} سجل
                        </span>
                    </div>

                    {groupedEntries.length === 0 ? (
                        <div className="luxury-card py-20 text-center">
                            <BookOpen size={40} className="mx-auto mb-3 text-slate-200" />
                            <p className="font-black text-slate-500">لا توجد سجلات بعد. أضف من النموذج.</p>
                        </div>
                    ) : (
                        groupedEntries.map((group) => (
                            <div
                                key={`${group.stage}-${group.grade}`}
                                className="luxury-card overflow-hidden border-slate-100"
                            >
                                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                                    <GraduationCap size={18} className="text-indigo-500" />
                                    <span className="font-black text-slate-800">
                                        {group.stage} — {group.grade}
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50">
                                                <th className="px-4 py-3 text-right">اليوم</th>
                                                <th className="px-4 py-3 text-right">التاريخ</th>
                                                <th className="px-4 py-3 text-right">المادة</th>
                                                <th className="px-4 py-3 text-right">الفترة</th>
                                                <th className="px-4 py-3 text-center">إجراء</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.rows
                                                .sort((a, b) => a.period - b.period)
                                                .map((row) => (
                                                    <tr
                                                        key={row.id}
                                                        className="border-b border-slate-50 hover:bg-indigo-50/30"
                                                    >
                                                        <td className="px-4 py-3 font-bold">{row.day}</td>
                                                        <td className="px-4 py-3 font-bold text-violet-700">
                                                            {dateForDay(schedule, row.day) || '—'}
                                                        </td>
                                                        <td className="px-4 py-3 font-black">{row.subject}</td>
                                                        <td className="px-4 py-3">
                                                            <span className="px-3 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-black">
                                                                {periodLabel(row.period)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleEdit(row)}
                                                                    className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-indigo-600"
                                                                >
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDelete(row.id)}
                                                                    className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-rose-600"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExamPeriods;
