import React, { useState, useEffect, useMemo } from 'react';
import {
    LayoutGrid,
    Plus,
    Wand2,
    X,
    Edit2,
    Trash2,
    Home,
    Landmark,
    AlertCircle,
    Users,
    Eye,
    Printer,
    FileDown,
    CheckSquare,
    Square,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import {
    getStudents,
    saveStudent,
    getCommittees,
    saveCommittee,
    deleteCommittee,
    getAppSettings,
    saveStudentsBulk,
} from '../../utils/dataService';
import {
    planSequentialCommitteeDistribution,
    applyDistributionPlan,
    getSeatRangeForGrade,
    studentsForDistributionPool,
} from '../../utils/committeeDistribution';
import CommitteeRosterPrintOverlay from '../../components/CommitteeRosterPrintOverlay';
import {
    loadCommitteeRosterConfig,
    resolveRosterSchoolName,
} from '../../utils/committeeRosterPrint';
import { exportCommitteeRostersPdfPerCommittee } from '../../utils/committeeRosterPdfExport';
import {
    COMMITTEE_STAGES,
    committeesForGrade,
    committeeLabelWithStage,
    getStudentsInCommittee,
    getOrphanCommitteeStudents,
    gradesForStage,
    studentHasActiveCommittee,
} from '../../utils/committeeUtils';

const Committees = () => {
    const [committees, setCommittees] = useState([]);
    const [students, setStudents] = useState([]);
    const [isDistributeOpen, setIsDistributeOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCommittee, setEditingCommittee] = useState(null);
    const [selectedStage, setSelectedStage] = useState('');
    const [selectedGrade, setSelectedGrade] = useState('');
    const [selectedCommittee, setSelectedCommittee] = useState('');
    const [formStage, setFormStage] = useState('ثانوي');
    const [formGrade, setFormGrade] = useState('');
    const [viewingCommittee, setViewingCommittee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [clearingOrphans, setClearingOrphans] = useState(false);
    /** @type {null | object[]} لجان للطباعة على القالب */
    const [rosterPrintCommittees, setRosterPrintCommittees] = useState(null);
    const [rosterExportStage, setRosterExportStage] = useState('');
    const [rosterSelectedIds, setRosterSelectedIds] = useState(() => new Set());
    const [rosterBulkExporting, setRosterBulkExporting] = useState(false);
    const [rosterExportProgress, setRosterExportProgress] = useState(null);
    const [distributeMode, setDistributeMode] = useState('single');
    const [distributing, setDistributing] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [cData, sData] = await Promise.all([getCommittees(), getStudents()]);
        setCommittees(cData);
        setStudents(sData);
        setLoading(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            id: editingCommittee?.id,
            name: formData.get('name'),
            room: formData.get('room'),
            capacity: parseInt(formData.get('capacity')),
            stage: formData.get('stage'),
            grade: formData.get('grade') || '',
        };
        const saved = await saveCommittee(data);
        setIsModalOpen(false);
        setEditingCommittee(null);
        const [cData, sData] = await Promise.all([getCommittees(), getStudents()]);
        setCommittees(cData);
        setStudents(sData);
        setLoading(false);
        const opened =
            cData.find((c) => c.id === saved?.id) ||
            cData.find(
                (c) =>
                    c.name === data.name &&
                    c.stage === data.stage &&
                    (c.grade || '') === (data.grade || '')
            );
        if (opened) setViewingCommittee(opened);
    };

    const handleDelete = async (id, e) => {
        e?.stopPropagation?.();
        const committee = committees.find((c) => c.id === id);
        const affected = committee ? getStudentsInCommittee(committee, students) : [];
        const confirmMsg =
            affected.length > 0
                ? `حذف اللجنة «${committee.name}» وإلغاء توزيع ${affected.length} طالب عليها؟`
                : 'هل أنت متأكد من حذف هذه اللجنة بشكل دائم؟';
        if (!window.confirm(confirmMsg)) return;

        setLoading(true);
        await deleteCommittee(id);
        for (const student of affected) {
            await saveStudent({ ...student, committee: '' });
        }
        if (viewingCommittee?.id === id) setViewingCommittee(null);
        await fetchData();
    };

    const handleClearOrphanAssignments = async () => {
        const orphans = getOrphanCommitteeStudents(students, committees);
        if (!orphans.length) return;
        if (
            !window.confirm(
                `يوجد ${orphans.length} طالباً ما زالوا مسجّلين على لجان محذوفة.\nهل تريد إلغاء توزيعهم الآن؟`
            )
        ) {
            return;
        }
        setClearingOrphans(true);
        try {
            for (const student of orphans) {
                await saveStudent({ ...student, committee: '' });
            }
            alert(`تم إلغاء توزيع ${orphans.length} طالب بنجاح.`);
            await fetchData();
        } finally {
            setClearingOrphans(false);
        }
    };

    const runDistributionPlan = async (plan, confirmTitle) => {
        if (!plan.assignments?.length) {
            alert(plan.message || 'لا يوجد طلاب للتوزيع. تأكد من توليد أرقام الجلوس لهذا الصف أولاً (بطاقات الجلوس).');
            return;
        }
        const range =
            plan.firstSeat && plan.lastSeat
                ? `\nمن رقم جلوس ${plan.firstSeat} إلى ${plan.lastSeat}`
                : '';
        const skipNote =
            plan.skippedNoSeat > 0
                ? `\n(${plan.skippedNoSeat} طالب بدون رقم جلوس — لم يُوزَّعوا)`
                : '';
        if (
            !window.confirm(
                `${confirmTitle}\n${plan.assignments.length} طالب — ${plan.committees?.length || 0} لجنة${range}${skipNote}`
            )
        ) {
            return;
        }
        setDistributing(true);
        try {
            const updated = applyDistributionPlan(students, plan);
            await saveStudentsBulk(updated);
            setStudents(updated);
            let msg = `تم التوزيع: ${plan.assignments.length} طالباً بترتيب رقم الجلوس.`;
            if (plan.remainingInQueue > 0) {
                msg += `\nبقي ${plan.remainingInQueue} طالباً بدون لجنة (سعة اللجان اكتملت).`;
            }
            alert(msg);
            setIsDistributeOpen(false);
        } catch (err) {
            alert(err?.message || 'فشل حفظ التوزيع');
        } finally {
            setDistributing(false);
        }
    };

    const handleAutoDistribute = async () => {
        if (!selectedStage || !selectedGrade) {
            alert('يرجى اختيار المرحلة والصف');
            return;
        }
        if (distributeMode === 'single') {
            if (!selectedCommittee) {
                alert('يرجى اختيار اللجنة المستهدفة');
                return;
            }
            const committeeObj = committees.find((c) => c.id === selectedCommittee);
            if (!committeeObj) return;
            const plan = planSequentialCommitteeDistribution({
                committees,
                students,
                stage: selectedStage,
                grade: selectedGrade,
                mode: 'unassigned',
                targetCommittee: committeeObj,
            });
            await runDistributionPlan(plan, `توزيع على ${committeeObj.name}؟`);
            return;
        }
        const plan = planSequentialCommitteeDistribution({
            committees,
            students,
            stage: selectedStage,
            grade: selectedGrade,
            mode: 'unassigned',
        });
        await runDistributionPlan(
            plan,
            'توزيع متسلسل على كل لجان هذا الصف (حسب رقم الجلوس)؟'
        );
    };

    const handleRedistribute = async () => {
        if (!selectedStage || !selectedGrade) {
            alert('يرجى اختيار المرحلة والصف');
            return;
        }
        const plan = planSequentialCommitteeDistribution({
            committees,
            students,
            stage: selectedStage,
            grade: selectedGrade,
            mode: 'redistribute',
        });
        if (plan.message) {
            alert(plan.message);
            return;
        }
        await runDistributionPlan(
            plan,
            'إعادة توزيع اللجان التي بها طلاب (بترتيب أرقام الجلوس)؟\nسيتم إفراغها ثم تعبئتها من الأصغر للأكبر.'
        );
    };

    const committeesWithStudentsInGrade = useMemo(() => {
        if (!selectedStage || !selectedGrade) return 0;
        return committeesForGrade(committees, students, selectedGrade, selectedStage).filter(
            (c) => getStudentsInCommittee(c, students).length > 0
        ).length;
    }, [committees, students, selectedStage, selectedGrade]);

    const distributeSeatPreview = useMemo(() => {
        if (!selectedStage || !selectedGrade) return null;
        const range = getSeatRangeForGrade(students, selectedStage, selectedGrade);
        const unassigned = studentsForDistributionPool(students, selectedStage, selectedGrade).filter(
            (s) => !String(s.committee || '').trim()
        );
        return {
            range,
            unassignedCount: unassigned.length,
            nextSeat: unassigned[0]?.seatNumber ?? null,
        };
    }, [students, selectedStage, selectedGrade]);

    const distributeStages = useMemo(() => {
        const inData = new Set(students.map((s) => s.stage).filter(Boolean));
        const matched = COMMITTEE_STAGES.filter((s) => inData.has(s.id));
        return matched.length ? matched : COMMITTEE_STAGES;
    }, [students]);

    const distributeGrades = useMemo(
        () => gradesForStage(students, selectedStage),
        [students, selectedStage]
    );

    const formGrades = useMemo(() => gradesForStage(students, formStage), [students, formStage]);

    const distributeCommittees = useMemo(
        () => committeesForGrade(committees, students, selectedGrade, selectedStage),
        [committees, students, selectedGrade, selectedStage]
    );

    useEffect(() => {
        if (isModalOpen) {
            setFormStage(editingCommittee?.stage || 'ثانوي');
            setFormGrade(editingCommittee?.grade || '');
        }
    }, [isModalOpen, editingCommittee]);

    const viewingStudents = useMemo(
        () => (viewingCommittee ? getStudentsInCommittee(viewingCommittee, students) : []),
        [viewingCommittee, students]
    );

    const distributionStats = useMemo(() => {
        const distributed = students.filter((s) => studentHasActiveCommittee(s, committees)).length;
        const orphans = getOrphanCommitteeStudents(students, committees);
        const pending = students.filter((s) => !String(s.committee || '').trim()).length;
        return { distributed, orphanCount: orphans.length, pending, orphans };
    }, [students, committees]);

    const rosterStageOptions = useMemo(() => {
        const fromData = [...new Set(committees.map((c) => c.stage).filter(Boolean))];
        const ids = [...new Set([...COMMITTEE_STAGES.map((s) => s.id), ...fromData])];
        return ids.map((id) => {
            const preset = COMMITTEE_STAGES.find((s) => s.id === id);
            return { value: id, label: preset?.label || id };
        });
    }, [committees]);

    const committeesInRosterStage = useMemo(() => {
        if (!rosterExportStage) return [];
        return committees
            .filter((c) => c.stage === rosterExportStage)
            .sort((a, b) =>
                String(a.name || '').localeCompare(String(b.name || ''), 'ar', { numeric: true })
            );
    }, [committees, rosterExportStage]);

    const rosterStageCommitteeKey = committeesInRosterStage.map((c) => c.id).join('|');

    useEffect(() => {
        if (!rosterStageOptions.length) return;
        if (!rosterExportStage || !rosterStageOptions.some((o) => o.value === rosterExportStage)) {
            setRosterExportStage(rosterStageOptions[0].value);
        }
    }, [rosterStageOptions, rosterExportStage]);

    useEffect(() => {
        setRosterSelectedIds(new Set(committeesInRosterStage.map((c) => c.id)));
    }, [rosterExportStage, rosterStageCommitteeKey]);

    const selectedRosterCommittees = useMemo(
        () => committees.filter((c) => rosterSelectedIds.has(c.id)),
        [committees, rosterSelectedIds]
    );

    const toggleRosterCommittee = (id) => {
        setRosterSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllRosterCommittees = () => {
        setRosterSelectedIds(new Set(committeesInRosterStage.map((c) => c.id)));
    };

    const clearRosterCommitteeSelection = () => setRosterSelectedIds(new Set());

    const openRosterPreview = (list) => {
        if (!list.length) {
            alert('حدّد لجنة واحدة على الأقل.');
            return;
        }
        setRosterPrintCommittees([...list]);
    };

    const handleExportRosterPdfsByStage = async () => {
        if (!rosterSelectedIds.size) {
            alert('حدّد لجنة واحدة على الأقل للتصدير.');
            return;
        }
        const selected = selectedRosterCommittees;
        const stageLabel =
            rosterStageOptions.find((o) => o.value === rosterExportStage)?.label || rosterExportStage;
        if (
            !window.confirm(
                `تصدير ${selected.length} ملف PDF (ملف منفصل لكل لجنة) — المرحلة: ${stageLabel}؟`
            )
        ) {
            return;
        }
        setRosterBulkExporting(true);
        setRosterExportProgress(null);
        try {
            const cfg = loadCommitteeRosterConfig();
            const appCfg = await getAppSettings();
            const school = resolveRosterSchoolName(appCfg);
            const { fileCount } = await exportCommitteeRostersPdfPerCommittee(
                selected,
                students,
                cfg,
                school,
                {
                    stageSuffix: rosterExportStage,
                    onCommitteeStart: (info) => setRosterExportProgress(info),
                }
            );
            alert(`تم تنزيل ${fileCount} ملف PDF — ملف لكل لجنة.`);
        } catch (err) {
            alert(err?.message || 'فشل تصدير PDF');
        } finally {
            setRosterBulkExporting(false);
            setRosterExportProgress(null);
        }
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-alexandria pb-20">
            {/* ── Page Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2.5xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                            <Landmark size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">إدارة اللجان المركزية</h1>
                    </div>
                    <p className="text-slate-400 font-medium text-sm flex items-center gap-2">
                        <LayoutGrid size={16} className="text-indigo-400" />
                        تجهيز القاعات الامتحانية، توزيع الكتل الطلابية، وإسناد المهمام الإشرافية
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            if (!committees.length) {
                                alert('لا توجد لجان للطباعة.');
                                return;
                            }
                            setRosterPrintCommittees([...committees]);
                        }}
                        disabled={loading || committees.length === 0}
                        className="px-6 py-4 bg-white text-slate-700 rounded-3xl font-black text-sm hover:bg-slate-50 transition-all shadow-sm border border-slate-200 flex items-center gap-3 disabled:opacity-40"
                    >
                        <Printer size={20} className="text-indigo-500" />
                        طباعة كشوف اللجان
                    </button>
                    <button
                        onClick={() => {
                            setSelectedStage('');
                            setSelectedGrade('');
                            setSelectedCommittee('');
                            setIsDistributeOpen(true);
                        }}
                        className="px-6 py-4 bg-white text-indigo-600 rounded-3xl font-black text-sm hover:bg-slate-50 transition-all shadow-sm border border-slate-100 flex items-center gap-3"
                    >
                        <Wand2 size={20} className="text-indigo-500" /> توزيع ذكي
                    </button>
                    <button
                        onClick={() => { setEditingCommittee(null); setIsModalOpen(true); }}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 flex items-center gap-3"
                    >
                        <Plus size={20} /> إضافة لجنة جديدة
                    </button>
                </div>
            </div>

            {/* ── Stats Summary Area ── */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-2">
               <div className="luxury-card p-6 bg-white border-none shadow-premium flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">إجمالي اللجان</span>
                  <span className="text-3xl font-black text-slate-900 font-header">{committees.length}</span>
               </div>
               <div className="luxury-card p-6 bg-white border-none shadow-premium flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">الطاقة الاستيعابية</span>
                  <span className="text-3xl font-black text-slate-900 font-header">{committees.reduce((sum, c) => sum + c.capacity, 0)}</span>
               </div>
               <div className="luxury-card p-6 bg-white border-none shadow-premium flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">الطلاب الموزعون</span>
                  <span className="text-3xl font-black text-indigo-600 font-header">{distributionStats.distributed}</span>
               </div>
               <div className="luxury-card p-6 bg-white border-none shadow-premium flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">بانتظار التوزيع</span>
                  <span className="text-3xl font-black text-rose-500 font-header">{distributionStats.pending}</span>
               </div>
            </div>

            {committees.length > 0 && (
                <div className="luxury-card p-5 md:p-6 mx-2 bg-violet-50/60 border border-violet-100 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="font-black text-violet-900 text-lg">طباعة وتصدير كشوف اللجان</h2>
                            <p className="text-sm font-bold text-violet-800/80 mt-1">
                                اختر المرحلة، حدّد اللجان، ثم صدّر ملف PDF منفصل لكل لجنة
                            </p>
                        </div>
                        <select
                            value={rosterExportStage}
                            onChange={(e) => setRosterExportStage(e.target.value)}
                            className="md:w-56 px-4 py-3 rounded-2xl bg-white border border-violet-200 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-violet-100"
                        >
                            {rosterStageOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {committeesInRosterStage.length > 0 ? (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[11px] font-black text-violet-900">
                                    {committeesInRosterStage.length} لجنة في هذه المرحلة — محدّد:{' '}
                                    {rosterSelectedIds.size}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={selectAllRosterCommittees}
                                        className="px-3 py-1.5 rounded-xl bg-white text-violet-800 text-[11px] font-black border border-violet-200 hover:bg-violet-100"
                                    >
                                        تحديد الكل
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearRosterCommitteeSelection}
                                        className="px-3 py-1.5 rounded-xl bg-white text-slate-600 text-[11px] font-black border border-slate-200 hover:bg-slate-100"
                                    >
                                        إلغاء التحديد
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                {committeesInRosterStage.map((c) => {
                                    const selected = rosterSelectedIds.has(c.id);
                                    const count = getStudentsInCommittee(c, students).length;
                                    return (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => toggleRosterCommittee(c.id)}
                                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-right text-sm font-bold border transition-colors ${
                                                selected
                                                    ? 'bg-white border-violet-400 text-violet-950 shadow-sm'
                                                    : 'bg-white/50 border-violet-100 text-slate-500'
                                            }`}
                                        >
                                            {selected ? (
                                                <CheckSquare size={18} className="shrink-0 text-violet-600" />
                                            ) : (
                                                <Square size={18} className="shrink-0 text-slate-300" />
                                            )}
                                            <span className="flex-1 min-w-0 truncate">{c.name}</span>
                                            <span className="text-[10px] font-black text-violet-700/80 shrink-0">
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex flex-wrap gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => openRosterPreview(selectedRosterCommittees)}
                                    disabled={!rosterSelectedIds.size || rosterBulkExporting}
                                    className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white text-violet-800 border border-violet-200 font-black text-sm hover:bg-violet-100 disabled:opacity-50"
                                >
                                    <Printer size={18} />
                                    معاينة وطباعة ({rosterSelectedIds.size})
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportRosterPdfsByStage}
                                    disabled={!rosterSelectedIds.size || rosterBulkExporting || loading}
                                    className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-violet-600 text-white font-black text-sm hover:bg-violet-700 disabled:opacity-50"
                                >
                                    {rosterBulkExporting ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <FileDown size={18} />
                                    )}
                                    PDF — {rosterSelectedIds.size} لجنة (ملف لكل لجنة)
                                    {rosterExportProgress?.committee && (
                                        <span className="text-[10px] opacity-90">
                                            {rosterExportProgress.committeeIndex}/
                                            {rosterExportProgress.totalCommittees}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="text-sm font-bold text-violet-800/70">
                            لا توجد لجان مسجّلة لهذه المرحلة.
                        </p>
                    )}
                </div>
            )}

            {distributionStats.orphanCount > 0 && (
                <div className="luxury-card p-5 md:p-6 mx-2 bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <AlertCircle size={24} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-black text-amber-900">
                                توزيع قديم على لجان محذوفة ({distributionStats.orphanCount} طالب)
                            </p>
                            <p className="text-sm font-bold text-amber-800/80 mt-1">
                                حُذفت اللجان لكن سجلات الطلاب ما زالت تحمل أرقام لجان. يمكنك إلغاء هذا التوزيع دفعة واحدة.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClearOrphanAssignments}
                        disabled={clearingOrphans || loading}
                        className="shrink-0 px-6 py-3.5 bg-amber-600 text-white rounded-2xl font-black text-sm hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                        {clearingOrphans ? 'جاري التنظيف...' : 'إلغاء التوزيع القديم'}
                    </button>
                </div>
            )}

            {/* ── Committees Grid ── */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-40 opacity-20">
                    <Landmark size={64} className="animate-pulse mb-4 text-slate-400" />
                    <p className="font-black text-xl text-slate-600 tracking-tighter uppercase">تجميع بيانات اللجان والقاعات...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 px-2">
                    {committees.map((committee) => {
                        const studentCount = getStudentsInCommittee(committee, students).length;
                        const occupancy = (studentCount / committee.capacity) * 100;
                        const stageLabel = COMMITTEE_STAGES.find((s) => s.id === committee.stage)?.label;

                        return (
                            <div
                                key={committee.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setViewingCommittee(committee)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setViewingCommittee(committee);
                                    }
                                }}
                                className="luxury-card group p-0 overflow-hidden bg-white border-none shadow-premium transition-all duration-500 hover:-translate-y-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-indigo-200"
                            >
                                {/* Card Header */}
                                <div className="p-8 pb-4 flex justify-between items-start">
                                    <div className="flex items-center gap-5 flex-1 min-w-0">
                                        <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-sm">
                                            <LayoutGrid size={32} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-800 font-header leading-tight">{committee.name}</h3>
                                            <div className="flex flex-wrap items-center gap-2 text-slate-400 font-bold text-xs mt-1">
                                                {stageLabel && (
                                                    <span className="px-2 py-0.5 rounded-lg bg-violet-100 text-violet-700 text-[10px] font-black">
                                                        {stageLabel}
                                                    </span>
                                                )}
                                                {committee.grade && (
                                                    <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-black">
                                                        {committee.grade}
                                                    </span>
                                                )}
                                                <span className="inline-flex items-center gap-1">
                                                    <Home size={14} className="text-indigo-400" />
                                                    قاعة: {committee.room}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        className="flex gap-2 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-300"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setRosterPrintCommittees([committee]);
                                            }}
                                            className="p-3 bg-violet-50 text-violet-600 rounded-2xl hover:bg-violet-600 hover:text-white transition-all"
                                            title="طباعة كشف اللجنة"
                                        >
                                            <Printer size={18} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setViewingCommittee(committee)}
                                            className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all"
                                            title="عرض أسماء الطلاب"
                                        >
                                            <Eye size={18} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingCommittee(committee);
                                                setIsModalOpen(true);
                                            }}
                                            className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-slate-900 hover:text-white transition-all"
                                            title="تعديل"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => handleDelete(committee.id, e)}
                                            className="p-3 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-sm shadow-rose-100"
                                            title="حذف"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Progress Section */}
                                <div className="p-8 pt-4 pb-6">
                                    <div className="bg-slate-50/80 rounded-3xl p-6 border border-slate-100/50">
                                        <div className="flex justify-between items-end mb-3">
                                            <div>
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">نسبة الإشغال</span>
                                                <span className="text-lg font-black text-slate-800">{studentCount} من أصل {committee.capacity}</span>
                                            </div>
                                            <span className={`text-xs font-black px-3 py-1 rounded-full ${occupancy > 90 ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                                %{Math.round(occupancy)}
                                            </span>
                                        </div>
                                        <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden p-[2px]">
                                            <div
                                                className={`h-full rounded-full transition-all duration-1000 shadow-sm ${occupancy > 90 ? 'bg-gradient-to-l from-rose-500 to-rose-400' : 'bg-gradient-to-l from-indigo-600 to-indigo-400'}`}
                                                style={{ width: `${occupancy}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                    <p className="text-[10px] font-bold text-indigo-500 mt-4 flex items-center gap-1.5">
                                        <Eye size={12} />
                                        اضغط لعرض قائمة الطلاب في اللجنة
                                    </p>
                                </div>

                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── تفاصيل اللجنة وأسماء الطلاب ── */}
            {viewingCommittee && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300"
                    onClick={() => setViewingCommittee(null)}
                >
                    <div
                        className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border-none relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="absolute top-0 right-0 w-full h-1.5 bg-gradient-to-l from-indigo-500 via-violet-500 to-indigo-500" />

                        <div className="p-8 pb-6 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
                            <div className="flex items-start gap-4 min-w-0">
                                <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
                                    <Users size={26} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-2xl font-black text-slate-900 font-header leading-tight">
                                        {viewingCommittee.name}
                                    </h3>
                                    <p className="text-slate-500 font-bold text-sm mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        {viewingCommittee.stage && (
                                            <span className="px-2 py-0.5 rounded-lg bg-violet-100 text-violet-700 text-[10px] font-black">
                                                {COMMITTEE_STAGES.find((s) => s.id === viewingCommittee.stage)?.label}
                                            </span>
                                        )}
                                        {viewingCommittee.grade && (
                                            <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-black">
                                                {viewingCommittee.grade}
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1">
                                            <Home size={14} className="text-indigo-400" />
                                            {viewingCommittee.room}
                                        </span>
                                        <span>
                                            {viewingStudents.length} / {viewingCommittee.capacity} طالب
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setViewingCommittee(null)}
                                className="p-3 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-2xl transition-all shrink-0"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-8">
                            {viewingStudents.length === 0 ? (
                                <div className="py-16 text-center">
                                    <Users size={48} className="mx-auto mb-4 text-slate-200" />
                                    <p className="font-black text-slate-600 text-lg">لا يوجد طلاب في هذه اللجنة بعد</p>
                                    <p className="text-slate-400 text-sm font-bold mt-2">
                                        استخدم «توزيع ذكي» أو عيّن اللجنة من قائمة الطلاب
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full text-right">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-12">
                                                م
                                            </th>
                                            <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                اسم الطالب
                                            </th>
                                            <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                                                المرحلة
                                            </th>
                                            <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                                                الصف
                                            </th>
                                            <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                                                رقم الجلوس
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {viewingStudents.map((student, index) => (
                                            <tr key={student.id} className="hover:bg-indigo-50/40">
                                                <td className="py-3.5 px-4 text-slate-400 font-black text-sm">
                                                    {index + 1}
                                                </td>
                                                <td className="py-3.5 px-4 font-black text-slate-900">
                                                    {student.name || '—'}
                                                </td>
                                                <td className="py-3.5 px-4 text-center font-bold text-slate-600 text-sm">
                                                    {student.stage || '—'}
                                                </td>
                                                <td className="py-3.5 px-4 text-center font-bold text-slate-600 text-sm">
                                                    {student.grade || '—'}
                                                </td>
                                                <td className="py-3.5 px-4 text-center font-black text-indigo-600 font-mono">
                                                    {student.seatNumber || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50/80 shrink-0 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setRosterPrintCommittees([viewingCommittee]);
                                }}
                                className="px-6 py-3.5 bg-violet-600 text-white rounded-2xl font-black text-sm hover:bg-violet-700 transition-all flex items-center gap-2"
                            >
                                <Printer size={16} />
                                طباعة كشف اللجنة
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewingCommittee(null)}
                                className="px-8 py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Modal (Committee Setup) ── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border-none relative">
                        <div className="absolute top-0 right-0 w-full h-1.5 bg-gradient-to-l from-indigo-500 via-violet-500 to-indigo-500"></div>
                        
                        <div className="p-10 pb-6 border-b border-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 font-header leading-tight">
                                    {editingCommittee ? 'تحديث بيانات اللجنة' : 'إنشاء لجنة جديدة'}
                                </h3>
                                <p className="text-slate-400 font-medium text-xs mt-1">أدخل البيانات الأساسية للقاعة والسعة</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-4 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-2xl transition-all shadow-sm">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-10 space-y-8">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">المرحلة</label>
                                    <select
                                        required
                                        name="stage"
                                        value={formStage}
                                        onChange={(e) => {
                                            setFormStage(e.target.value);
                                            setFormGrade('');
                                        }}
                                        className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800"
                                    >
                                        {COMMITTEE_STAGES.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">الصف الدراسي</label>
                                    <select
                                        name="grade"
                                        value={formGrade}
                                        onChange={(e) => setFormGrade(e.target.value)}
                                        className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800"
                                    >
                                        <option value="">كل صفوف المرحلة</option>
                                        {formGrades.map((g) => (
                                            <option key={g} value={g}>
                                                {g}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold px-1 -mt-4">
                                يمكن تكرار رقم اللجنة (مثل لجنة ١) بين المراحل أو الصفوف. اترك الصف فارغاً إذا كانت اللجنة لكل صفوف المرحلة.
                            </p>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">مسمى اللجنة الرسمي</label>
                                <input required name="name" defaultValue={editingCommittee?.name} placeholder="مثال: لجنة ١" className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800 transition-all font-header" />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">القاعة أو الغرفة</label>
                                    <input required name="room" defaultValue={editingCommittee?.room} placeholder="مثال: المختبر ١" className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800 transition-all font-header text-center" />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">السعة القصوى</label>
                                    <input required type="number" name="capacity" defaultValue={editingCommittee?.capacity} className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800 transition-all font-header text-center" />
                                </div>
                            </div>

                            <div className="flex gap-4 mt-6">
                                <button type="submit" className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg hover:bg-indigo-700 shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all">اعتماد البيانات</button>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-10 py-5 bg-slate-100 text-slate-500 rounded-3xl font-black hover:bg-slate-200 transition-all text-lg">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Auto-Distribute Modal ── */}
            {isDistributeOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border-none relative">
                        <div className="absolute top-0 right-0 w-full h-1.5 bg-gradient-to-l from-indigo-500 via-violet-500 to-indigo-500"></div>

                        <div className="p-10 pb-6 border-b border-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 font-header leading-tight">التوزيع الذكي القواتي</h3>
                                <p className="text-slate-400 font-medium text-xs mt-1">توزيع كتل الطلاب على القاعات المتاحة بضغطة زر واحدة</p>
                            </div>
                            <button onClick={() => setIsDistributeOpen(false)} className="p-4 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-2xl transition-all shadow-sm">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-10 space-y-8">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">المرحلة</label>
                                    <select
                                        className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 font-black text-sm text-slate-800 appearance-none"
                                        value={selectedStage}
                                        onChange={(e) => {
                                            setSelectedStage(e.target.value);
                                            setSelectedGrade('');
                                            setSelectedCommittee('');
                                        }}
                                    >
                                        <option value="">— اختر المرحلة —</option>
                                        {distributeStages.map((st) => (
                                            <option key={st.id} value={st.id}>
                                                {st.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">الصف الدراسي</label>
                                    <select
                                        className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 font-black text-sm text-slate-800 appearance-none disabled:opacity-50"
                                        value={selectedGrade}
                                        disabled={!selectedStage}
                                        onChange={(e) => {
                                            setSelectedGrade(e.target.value);
                                            setSelectedCommittee('');
                                        }}
                                    >
                                        <option value="">
                                            {selectedStage ? '— اختر الصف —' : 'اختر المرحلة أولاً'}
                                        </option>
                                        {distributeGrades.map((g) => (
                                            <option key={g} value={g}>
                                                {g}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                    طريقة التوزيع
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setDistributeMode('single')}
                                        className={`px-4 py-2.5 rounded-xl text-xs font-black border transition-colors ${
                                            distributeMode === 'single'
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-slate-50 text-slate-600 border-slate-200'
                                        }`}
                                    >
                                        لجنة واحدة
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDistributeMode('all')}
                                        className={`px-4 py-2.5 rounded-xl text-xs font-black border transition-colors ${
                                            distributeMode === 'all'
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-slate-50 text-slate-600 border-slate-200'
                                        }`}
                                    >
                                        كل لجان الصف (بالترتيب)
                                    </button>
                                </div>
                            </div>

                            {distributeMode === 'single' && (
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                        اللجنة المستهدفة
                                    </label>
                                    <select
                                        className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 font-black text-sm text-slate-800 appearance-none"
                                        value={selectedCommittee}
                                        disabled={!selectedStage || !selectedGrade}
                                        onChange={(e) => setSelectedCommittee(e.target.value)}
                                    >
                                        <option value="">
                                            {!selectedStage || !selectedGrade
                                                ? 'اختر المرحلة والصف أولاً'
                                                : '— حدد اللجنة —'}
                                        </option>
                                        {distributeCommittees.map((c) => {
                                            const remaining =
                                                c.capacity - getStudentsInCommittee(c, students).length;
                                            return (
                                                <option key={c.id} value={c.id}>
                                                    {committeeLabelWithStage(c)} (المتبقي: {remaining}{' '}
                                                    مقعد)
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            )}

                            {selectedStage && selectedGrade && distributeSeatPreview && (
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 space-y-1">
                                    {distributeSeatPreview.range ? (
                                        <>
                                            <p>
                                                أرقام الجلوس في الصف:{' '}
                                                <span className="text-indigo-700 font-black">
                                                    من {distributeSeatPreview.range.min} إلى{' '}
                                                    {distributeSeatPreview.range.max}
                                                </span>{' '}
                                                ({distributeSeatPreview.range.count} طالب)
                                            </p>
                                            <p>
                                                غير موزّعين: {distributeSeatPreview.unassignedCount}
                                                {distributeSeatPreview.nextSeat != null && (
                                                    <>
                                                        {' '}
                                                        — التوزيع التالي يبدأ من رقم{' '}
                                                        <span className="text-indigo-700 font-black">
                                                            {distributeSeatPreview.nextSeat}
                                                        </span>
                                                    </>
                                                )}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-amber-800">
                                            لا توجد أرقام جلوس لهذا الصف. ولّدها من «بطاقات الجلوس» برقم
                                            البداية الذي تريده.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 flex gap-4">
                                <AlertCircle size={24} className="text-indigo-500 shrink-0" />
                                <p className="text-xs font-bold text-indigo-700 leading-relaxed">
                                    التوزيع <span className="font-black">بترتيب رقم الجلوس</span> كما
                                    أُدخل في النظام (من رقم البداية الذي حدّدته — ليس عشوائياً). لجنة
                                    سعة 24 تأخذ أول 24 طالباً بالترتيب، ثم اللجنة التالية 24 التاليين،
                                    وهكذا.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={handleAutoDistribute}
                                    disabled={distributing || !selectedStage || !selectedGrade}
                                    className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg hover:bg-indigo-700 shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {distributing ? (
                                        <Loader2 size={24} className="animate-spin" />
                                    ) : (
                                        <Wand2 size={24} />
                                    )}
                                    {distributeMode === 'single'
                                        ? 'توزيع على اللجنة (بالترتيب)'
                                        : 'توزيع كل لجان الصف (بالترتيب)'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRedistribute}
                                    disabled={
                                        distributing ||
                                        !selectedStage ||
                                        !selectedGrade ||
                                        committeesWithStudentsInGrade === 0
                                    }
                                    className="w-full py-4 bg-amber-50 text-amber-900 border-2 border-amber-200 rounded-3xl font-black text-sm hover:bg-amber-100 flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    <RefreshCw size={20} />
                                    إعادة توزيع اللجان الموزّعة ({committeesWithStudentsInGrade})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsDistributeOpen(false)}
                                    className="w-full py-4 bg-slate-100 text-slate-500 rounded-3xl font-black hover:bg-slate-200 transition-all"
                                >
                                    تجاهل
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {rosterPrintCommittees && (
                <CommitteeRosterPrintOverlay
                    committees={rosterPrintCommittees}
                    students={students}
                    onClose={() => setRosterPrintCommittees(null)}
                />
            )}
        </div>
    );
};

export default Committees;
