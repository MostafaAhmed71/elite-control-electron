import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    UserCheck,
    UsersRound,
    X,
    UserPlus,
    LayoutGrid,
    CheckCircle2,
    RotateCcw,
    AlertCircle,
    ClipboardList,
    Save,
    Plus,
    Calendar,
    Clock,
    AlertTriangle,
} from 'lucide-react';
import {
    getCommittees,
    getObservers,
    getAssignments,
    saveAssignments,
    getAppSettings,
} from '../../utils/dataService';
import { COMMITTEE_STAGES } from '../../utils/committeeUtils';
import { EXAM_WEEKDAYS, PERIOD_OPTIONS, periodLabel } from '../../utils/examSchedule';
import {
    getCommitteeObserverIds,
    getSlotAssignments,
    checkObserverAssignmentWarnings,
    addObserverToCommittee as addObserverToStore,
    removeObserverFromCommittee as removeObserverFromStore,
    findSameSlotDuplicates,
    normalizeAssignments,
} from '../../utils/observerAssignments';

const CommitteeObservers = () => {
    const [committees, setCommittees] = useState([]);
    const [observers, setObservers] = useState([]);
    const [assignments, setAssignments] = useState({ version: 2, slots: {} });
    const [appConfig, setAppConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [filterStage, setFilterStage] = useState('الكل');
    const [selectedDay, setSelectedDay] = useState(EXAM_WEEKDAYS[0]);
    const [selectedPeriod, setSelectedPeriod] = useState(1);
    const [pendingAdd, setPendingAdd] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [cData, oData, aData, cfg] = await Promise.all([
            getCommittees(),
            getObservers(),
            getAssignments(),
            getAppSettings().catch(() => null),
        ]);
        setCommittees(cData);
        setObservers(oData);
        setAssignments(normalizeAssignments(aData));
        setAppConfig(cfg);
        setDirty(false);
        setPendingAdd(null);
        setLoading(false);
    };

    const dayDate = appConfig?.examSchedule?.dayDates?.[selectedDay] || '';

    const stages = useMemo(
        () => [...new Set(committees.map((c) => c.stage).filter(Boolean))],
        [committees]
    );

    const filteredCommittees = useMemo(() => {
        if (filterStage === 'الكل') return committees;
        return committees.filter((c) => c.stage === filterStage);
    }, [committees, filterStage]);

    const currentSlot = useMemo(
        () => getSlotAssignments(assignments, selectedDay, selectedPeriod),
        [assignments, selectedDay, selectedPeriod]
    );

    const assignedObserverIds = useMemo(() => {
        const set = new Set();
        Object.values(currentSlot).forEach((ids) => {
            (ids || []).forEach((id) => set.add(id));
        });
        return set;
    }, [currentSlot]);

    const unassignedObservers = useMemo(
        () => observers.filter((o) => !assignedObserverIds.has(o.id)),
        [observers, assignedObserverIds]
    );

    const slotDuplicates = useMemo(
        () => findSameSlotDuplicates(assignments, selectedDay, selectedPeriod, observers),
        [assignments, selectedDay, selectedPeriod, observers]
    );

    const committeesWithObservers = useMemo(
        () =>
            committees.filter(
                (c) => getCommitteeObserverIds(assignments, selectedDay, selectedPeriod, c.id).length > 0
            ).length,
        [committees, assignments, selectedDay, selectedPeriod]
    );

    const tryAddObserver = (committeeId, observerId) => {
        if (!committeeId || !observerId) return;
        const current = getCommitteeObserverIds(assignments, selectedDay, selectedPeriod, committeeId);
        if (current.includes(observerId)) return;

        const warnings = checkObserverAssignmentWarnings(assignments, {
            day: selectedDay,
            period: selectedPeriod,
            committeeId,
            observerId,
            committees,
            observers,
        });

        if (warnings.length) {
            setPendingAdd({ committeeId, observerId, warnings });
            return;
        }

        applyAddObserver(committeeId, observerId);
    };

    const applyAddObserver = (committeeId, observerId) => {
        setAssignments((prev) =>
            addObserverToStore(prev, selectedDay, selectedPeriod, committeeId, observerId)
        );
        setDirty(true);
        setPendingAdd(null);
    };

    const removeObserverFromCommittee = (committeeId, observerId) => {
        setAssignments((prev) =>
            removeObserverFromStore(prev, selectedDay, selectedPeriod, committeeId, observerId)
        );
        setDirty(true);
    };

    const handleSaveAssignments = async () => {
        setSaving(true);
        try {
            await saveAssignments(assignments);
            setDirty(false);
        } catch (err) {
            console.error(err);
            alert('فشل حفظ التوزيع');
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        if (dirty && !window.confirm('إلغاء التعديلات غير المحفوظة؟')) return;
        fetchData();
    };

    const pendingObserverName = pendingAdd
        ? observers.find((o) => o.id === pendingAdd.observerId)?.name || 'الملاحظ'
        : '';

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-40 opacity-20 font-alexandria">
                <UsersRound size={64} className="animate-pulse mb-4 text-slate-400" />
                <p className="font-black text-xl text-slate-600 tracking-tighter">جاري التحميل...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-alexandria pb-20" dir="rtl">
            {pendingAdd && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div
                        className="luxury-card max-w-lg w-full p-8 space-y-6 shadow-2xl border-amber-100"
                        role="dialog"
                        aria-labelledby="duplicate-dialog-title"
                    >
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 shrink-0 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="space-y-2 min-w-0">
                                <h3
                                    id="duplicate-dialog-title"
                                    className="text-lg font-black text-slate-900 font-header"
                                >
                                    تنبيه تكرار الملاحظ
                                </h3>
                                <p className="text-sm font-bold text-slate-600">
                                    إسناد «{pendingObserverName}» — {selectedDay}
                                    {dayDate ? ` (${dayDate})` : ''} · {periodLabel(selectedPeriod)}
                                </p>
                            </div>
                        </div>
                        <ul className="space-y-2 text-sm font-bold text-amber-900 bg-amber-50 rounded-2xl p-4 border border-amber-100">
                            {pendingAdd.warnings.map((w, i) => (
                                <li key={i} className="flex gap-2">
                                    <span className="text-amber-500 shrink-0">{i + 1}.</span>
                                    <span>{w.message}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-sm font-bold text-slate-500">
                            هل تريد إسناده رغم التكرار؟
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setPendingAdd(null)}
                                className="flex-1 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 font-black text-sm hover:bg-slate-50"
                            >
                                رفض
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    applyAddObserver(pendingAdd.committeeId, pendingAdd.observerId)
                                }
                                className="flex-1 py-3 rounded-2xl bg-amber-600 text-white font-black text-sm hover:bg-amber-700 shadow-lg shadow-amber-100"
                            >
                                موافق — إسناد رغم التكرار
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2.5xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                            <UserCheck size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">
                            توزيع الملاحظين يدوياً
                        </h1>
                    </div>
                    <p className="text-slate-400 font-medium text-sm max-w-xl leading-relaxed">
                        التوزيع حسب اليوم والفترة — كل يوم له ملاحظون مستقلون. عند تكرار ملاحظ في
                        نفس اليوم أو يوم آخر يظهر تنبيه للموافقة أو الرفض.
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <Link
                        to="/observer-sheets"
                        className="px-6 py-4 bg-emerald-600 text-white rounded-3xl font-black text-sm hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-3"
                    >
                        <ClipboardList size={20} /> طباعة كشوف الملاحظين
                    </Link>
                    <Link
                        to="/observers"
                        className="px-6 py-4 bg-white text-slate-600 rounded-3xl font-black text-sm hover:bg-slate-50 transition-all shadow-sm border border-slate-100 flex items-center gap-3"
                    >
                        <UserPlus size={20} className="text-indigo-500" /> إدارة الأسماء
                    </Link>
                    {dirty && (
                        <button
                            type="button"
                            onClick={handleDiscard}
                            className="px-5 py-4 bg-white text-slate-500 rounded-3xl font-black text-sm border border-slate-200 hover:bg-slate-50 flex items-center gap-2"
                        >
                            <RotateCcw size={18} /> تراجع
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleSaveAssignments}
                        disabled={!dirty || saving}
                        className="px-8 py-4 rounded-3xl font-black text-sm transition-all shadow-xl active:scale-95 flex items-center gap-3 disabled:opacity-40 bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700"
                    >
                        {saving ? <RotateCcw size={20} className="animate-spin" /> : <Save size={20} />}
                        {saving ? 'جاري الحفظ...' : 'حفظ التوزيع'}
                    </button>
                </div>
            </div>

            <div className="luxury-card p-6 mx-2 bg-indigo-50/40 border-indigo-100 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 font-black text-slate-700 text-sm">
                    <Calendar size={18} className="text-indigo-500" />
                    اليوم
                </div>
                <select
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(e.target.value)}
                    className="px-4 py-3 rounded-xl border border-indigo-100 font-black text-sm bg-white min-w-[140px]"
                >
                    {EXAM_WEEKDAYS.map((d) => (
                        <option key={d} value={d}>
                            {d}
                            {appConfig?.examSchedule?.dayDates?.[d]
                                ? ` — ${appConfig.examSchedule.dayDates[d]}`
                                : ''}
                        </option>
                    ))}
                </select>
                <div className="flex items-center gap-2 font-black text-slate-700 text-sm mr-4">
                    <Clock size={18} className="text-indigo-500" />
                    الفترة
                </div>
                <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(parseInt(e.target.value, 10))}
                    className="px-4 py-3 rounded-xl border border-indigo-100 font-black text-sm bg-white min-w-[160px]"
                >
                    {PERIOD_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                            {p.label}
                        </option>
                    ))}
                </select>
                <span className="text-xs font-bold text-indigo-700 bg-white px-3 py-2 rounded-xl border border-indigo-100 mr-auto">
                    التعديلات تُحفظ لهذا اليوم والفترة فقط
                </span>
            </div>

            {dirty && (
                <div className="bg-amber-50 border border-amber-100 text-amber-900 px-6 py-4 rounded-2xl flex items-center gap-3 font-bold text-sm mx-2">
                    <AlertCircle size={18} className="shrink-0" />
                    لديك تعديلات غير محفوظة — اضغط «حفظ التوزيع» لحفظها.
                </div>
            )}

            {slotDuplicates.length > 0 && (
                <div className="bg-rose-50 border border-rose-100 text-rose-900 px-6 py-4 rounded-2xl mx-2 space-y-2">
                    <p className="font-black text-sm flex items-center gap-2">
                        <AlertTriangle size={16} />
                        ملاحظون مُسنَدون لأكثر من لجنة في {selectedDay} — {periodLabel(selectedPeriod)}
                    </p>
                    <ul className="text-xs font-bold space-y-1 mr-6">
                        {slotDuplicates.map((d) => (
                            <li key={d.observerId}>
                                {d.name} — {d.count} لجان
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {observers.length === 0 && (
                <div className="luxury-card p-8 bg-indigo-50/50 border-indigo-100 flex items-start gap-3 mx-2">
                    <AlertCircle size={22} className="text-indigo-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-indigo-900">
                        لا يوجد معلمون في السجل.{' '}
                        <Link to="/observers" className="underline">
                            أضف أسماء الملاحظين
                        </Link>{' '}
                        ثم عُد للتوزيع اليدوي.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-8 px-2">
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <LayoutGrid size={20} className="text-indigo-500" />
                        <h2 className="text-xl font-black text-slate-800 font-header">اللجان</h2>
                        <select
                            value={filterStage}
                            onChange={(e) => setFilterStage(e.target.value)}
                            className="mr-auto px-4 py-2 rounded-xl border border-slate-100 font-black text-sm bg-white"
                        >
                            <option value="الكل">كل المراحل</option>
                            {stages.map((s) => (
                                <option key={s} value={s}>
                                    {COMMITTEE_STAGES.find((x) => x.id === s)?.label || s}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-4">
                        {filteredCommittees.length === 0 ? (
                            <div className="luxury-card py-16 text-center text-slate-400 font-black">
                                لا توجد لجان
                            </div>
                        ) : (
                            filteredCommittees.map((committee) => {
                                const assignedIds = getCommitteeObserverIds(
                                    assignments,
                                    selectedDay,
                                    selectedPeriod,
                                    committee.id
                                );
                                const available = observers.filter(
                                    (o) => !assignedIds.includes(o.id)
                                );

                                return (
                                    <div
                                        key={committee.id}
                                        className="luxury-card p-0 overflow-hidden bg-white border-none shadow-premium"
                                    >
                                        <div className="p-6 pb-4 flex justify-between items-start gap-4">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div
                                                    className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center ${
                                                        assignedIds.length > 0
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'bg-slate-50 text-slate-400'
                                                    }`}
                                                >
                                                    <UsersRound size={22} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-lg font-black text-slate-800 font-header">
                                                        {committee.name}
                                                    </h3>
                                                    <p className="text-slate-400 font-bold text-xs mt-0.5 flex flex-wrap items-center gap-2">
                                                        {committee.stage && (
                                                            <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 text-[10px] font-black">
                                                                {
                                                                    COMMITTEE_STAGES.find(
                                                                        (s) => s.id === committee.stage
                                                                    )?.label
                                                                }
                                                            </span>
                                                        )}
                                                        {committee.room && <span>{committee.room}</span>}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-2xl font-black text-slate-800 shrink-0">
                                                {assignedIds.length}
                                            </span>
                                        </div>

                                        <div className="px-6 pb-6 space-y-4">
                                            <div className="flex flex-wrap gap-2 min-h-[44px]">
                                                {assignedIds.map((obsId) => {
                                                    const observer = observers.find((o) => o.id === obsId);
                                                    return (
                                                        <div
                                                            key={obsId}
                                                            className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-2xl px-3 py-2"
                                                        >
                                                            <UserCheck size={14} className="text-indigo-500" />
                                                            <span className="text-sm font-black text-slate-800">
                                                                {observer?.name || '—'}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    removeObserverFromCommittee(
                                                                        committee.id,
                                                                        obsId
                                                                    )
                                                                }
                                                                className="w-6 h-6 bg-white text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg flex items-center justify-center transition-all"
                                                                title="إزالة"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                                {assignedIds.length === 0 && (
                                                    <span className="text-xs font-bold text-slate-400 py-2 flex items-center gap-2">
                                                        <CheckCircle2 size={14} />
                                                        لم يُضف ملاحظون بعد
                                                    </span>
                                                )}
                                            </div>

                                            <label className="flex items-center gap-2">
                                                <Plus size={16} className="text-indigo-500 shrink-0" />
                                                <select
                                                    value=""
                                                    disabled={!observers.length || !available.length}
                                                    onChange={(e) => {
                                                        tryAddObserver(committee.id, e.target.value);
                                                    }}
                                                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 font-black text-sm bg-white disabled:opacity-40"
                                                >
                                                    <option value="">
                                                        {!observers.length
                                                            ? 'أضف معلمين من إدارة الأسماء'
                                                            : !available.length
                                                              ? 'كل المعلمين مضافون لهذه اللجنة'
                                                              : 'اختر معلمًا لإضافته لهذه اللجنة...'}
                                                    </option>
                                                    {available.map((o) => (
                                                        <option key={o.id} value={o.id}>
                                                            {o.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-6 h-fit">
                    <div className="luxury-card p-6 bg-white border-slate-100 space-y-4">
                        <h3 className="font-black text-slate-800 flex items-center gap-2">
                            <UserCheck size={18} className="text-indigo-500" />
                            ملخص — {selectedDay} · {periodLabel(selectedPeriod)}
                        </h3>
                        <ul className="space-y-2 text-sm font-bold text-slate-600">
                            <li className="flex justify-between">
                                <span>عدد اللجان</span>
                                <span className="text-indigo-600">{committees.length}</span>
                            </li>
                            <li className="flex justify-between">
                                <span>عدد المعلمين</span>
                                <span className="text-indigo-600">{observers.length}</span>
                            </li>
                            <li className="flex justify-between">
                                <span>لجان بملاحظين</span>
                                <span className="text-emerald-600">{committeesWithObservers}</span>
                            </li>
                            <li className="flex justify-between">
                                <span>غير موزّعين (هذا اليوم)</span>
                                <span className="text-amber-600">{unassignedObservers.length}</span>
                            </li>
                        </ul>
                    </div>

                    {unassignedObservers.length > 0 && (
                        <div className="luxury-card p-6 bg-slate-50/80 border-slate-100">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                                معلمون لم يُوزَّعوا في {selectedDay} — {periodLabel(selectedPeriod)}
                            </h4>
                            <ul className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                                {unassignedObservers.map((o) => (
                                    <li
                                        key={o.id}
                                        className="text-sm font-bold text-slate-700 bg-white px-3 py-2 rounded-xl border border-slate-100"
                                    >
                                        {o.name}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-[10px] font-bold text-slate-400 mt-3 leading-relaxed">
                                غيّر اليوم أو الفترة لتوزيع ملاحظين مختلفين.
                            </p>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={fetchData}
                        className="w-full py-3 rounded-2xl border border-slate-200 bg-white text-slate-500 font-black text-sm hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                        <RotateCcw size={16} /> تحديث من السيرفر
                    </button>
                </aside>
            </div>
        </div>
    );
};

export default CommitteeObservers;
