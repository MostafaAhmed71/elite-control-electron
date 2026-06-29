import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Eye, Download, Filter } from 'lucide-react';
import { getStudents, getCommittees } from '../utils/dataService';
import { PERIOD_OPTIONS, daysForFilters } from '../utils/examSchedule';
import {
    coverStageToStudentStage,
    getCoverTemplatesByStage,
    getCoverTemplate,
    renderCoverToCanvas,
    resolveCoverLayout,
    exportCoversBatchToPdf,
} from '../utils/coverTemplates';
import {
    buildCoverContext,
    committeesFromStudents,
    filterStudentsForCover,
    resolveCoverFieldData,
} from '../utils/coverDataSources';

const CoverPrintPanel = ({ appConfig, activeStage }) => {
    const studentStage = coverStageToStudentStage(activeStage);

    const [students, setStudents] = useState([]);
    const [committees, setCommittees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedGrade, setSelectedGrade] = useState('الكل');
    const [selectedCommittee, setSelectedCommittee] = useState('الكل');
    const [selectedPeriod, setSelectedPeriod] = useState(1);
    const [selectedDay, setSelectedDay] = useState('الكل');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [printing, setPrinting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);

    useEffect(() => {
        Promise.all([getStudents(), getCommittees()])
            .then(([s, c]) => {
                setStudents(s);
                setCommittees(c);
            })
            .finally(() => setLoading(false));
    }, []);

    const stageStudents = useMemo(
        () => (students || []).filter((s) => !studentStage || s.stage === studentStage),
        [students, studentStage]
    );

    const templates = appConfig ? getCoverTemplatesByStage(appConfig, activeStage) : [];

    useEffect(() => {
        if (templates.length && !selectedTemplateId) {
            setSelectedTemplateId(templates[0].id);
        }
        if (templates.length && !templates.find((t) => t.id === selectedTemplateId)) {
            setSelectedTemplateId(templates[0]?.id || '');
        }
    }, [templates, selectedTemplateId, activeStage]);

    const grades = useMemo(() => {
        const g = [...new Set(stageStudents.map((s) => s.grade).filter(Boolean))];
        return ['الكل', ...g];
    }, [stageStudents]);

    useEffect(() => {
        setSelectedCommittee('الكل');
    }, [selectedGrade, activeStage]);

    const filters = useMemo(
        () => ({
            stage: studentStage || 'الكل',
            grade: selectedGrade,
            committee: selectedCommittee,
            period: selectedPeriod,
            day: selectedDay,
        }),
        [studentStage, selectedGrade, selectedCommittee, selectedPeriod, selectedDay]
    );

    const filteredForList = useMemo(
        () => filterStudentsForCover(stageStudents, filters),
        [stageStudents, filters]
    );

    const committeeList = useMemo(() => {
        if (selectedCommittee !== 'الكل') return [selectedCommittee];
        return committeesFromStudents(filteredForList);
    }, [filteredForList, selectedCommittee]);

    const availableCommittees = useMemo(() => {
        const base = filterStudentsForCover(stageStudents, {
            ...filters,
            committee: 'الكل',
        });
        return ['الكل', ...committeesFromStudents(base)];
    }, [stageStudents, filters]);

    const examSchedule = appConfig?.examSchedule;
    const availableDays = useMemo(() => {
        if (!examSchedule) return [];
        return daysForFilters(examSchedule, {
            stage: studentStage,
            grade: selectedGrade,
            period: selectedPeriod,
        });
    }, [examSchedule, studentStage, selectedGrade, selectedPeriod]);

    const buildJobs = () => {
        if (!selectedTemplateId || !appConfig) return [];
        const template = getCoverTemplate(appConfig, selectedTemplateId);
        const layout = resolveCoverLayout(appConfig, selectedTemplateId);
        return committeeList.map((committee) => {
            const ctx = buildCoverContext({
                appConfig,
                students: stageStudents,
                committees,
                filters,
                committee,
            });
            const data = resolveCoverFieldData(template.fields, ctx);
            return { committee, data, template, layout };
        });
    };

    const handlePreviewOne = async () => {
        const jobs = buildJobs();
        if (!jobs.length) {
            alert('اختر فلاتراً تعرض لجنة واحدة على الأقل');
            return;
        }
        try {
            const { data, template, layout } = jobs[0];
            const canvas = await renderCoverToCanvas(
                appConfig,
                selectedTemplateId,
                data,
                layout,
                template.width,
                template.height
            );
            setPreviewUrl(canvas.toDataURL('image/png', 1));
        } catch (err) {
            console.error(err);
            alert('تعذّر المعاينة');
        }
    };

    const handleDownloadAll = async () => {
        const jobs = buildJobs();
        if (!jobs.length) {
            alert('لا توجد لجان للتصدير');
            return;
        }
        setPrinting(true);
        try {
            const pdfJobs = jobs.map((job) => ({
                config: appConfig,
                templateId: selectedTemplateId,
                data: job.data,
                layout: job.layout,
            }));
            const stamp = new Date().toISOString().slice(0, 10);
            await exportCoversBatchToPdf(pdfJobs, `أغلفة-اللجان-${stamp}.pdf`);
        } catch (err) {
            console.error(err);
            alert('تعذّر تصدير PDF');
        } finally {
            setPrinting(false);
        }
    };

    const handlePrintAll = async () => {
        const jobs = buildJobs();
        if (!jobs.length) return;
        setPrinting(true);
        try {
            const wrap = document.createElement('div');
            wrap.id = 'cover-print-batch';
            wrap.style.cssText = 'position:fixed;left:-9999px;top:0;';
            for (const job of jobs) {
                const canvas = await renderCoverToCanvas(
                    appConfig,
                    selectedTemplateId,
                    job.data,
                    job.layout,
                    job.template.width,
                    job.template.height
                );
                const page = document.createElement('div');
                page.style.cssText =
                    'page-break-after:always;width:100%;display:flex;justify-content:center;padding:8mm;';
                const img = document.createElement('img');
                img.src = canvas.toDataURL('image/png', 1);
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                page.appendChild(img);
                wrap.appendChild(page);
            }
            document.body.appendChild(wrap);
            const prev = document.title;
            document.title = 'أغلفة';
            window.print();
            document.title = prev;
            setTimeout(() => wrap.remove(), 1000);
        } catch (err) {
            console.error(err);
            alert('تعذّر الطباعة');
        } finally {
            setPrinting(false);
        }
    };

    if (loading) {
        return <p className="text-slate-400 font-bold text-center py-8">جاري تحميل البيانات...</p>;
    }

    if (!templates.length) {
        return (
            <p className="text-slate-500 font-bold text-center py-8 luxury-card p-6">
                أنشئ غلافاً لهذه المرحلة أولاً ثم اختر الفلاتر للطباعة
            </p>
        );
    }

    return (
        <section className="luxury-card p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700">
                    <Filter size={22} />
                </div>
                <div>
                    <h2 className="text-lg font-black text-slate-900">طباعة الأغلفة ببيانات حقيقية</h2>
                    <p className="text-xs text-slate-500 font-medium">
                        نفس فلاتر طباعة الكشوف — يُطبع غلاف لكل لجنة ({committeeList.length} لجنة)
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400">القالب</span>
                    <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border font-bold text-sm"
                    >
                        {templates.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400">الصف</span>
                    <select
                        value={selectedGrade}
                        onChange={(e) => setSelectedGrade(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border font-bold text-sm"
                    >
                        {grades.map((g) => (
                            <option key={g} value={g}>
                                {g}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400">اللجنة</span>
                    <select
                        value={selectedCommittee}
                        onChange={(e) => setSelectedCommittee(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border font-bold text-sm"
                    >
                        {availableCommittees.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1">
                    <span className="text-[10px] font-black text-slate-400">الفترة</span>
                    <select
                        value={selectedPeriod}
                        onChange={(e) => setSelectedPeriod(parseInt(e.target.value, 10))}
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
                    <label className="space-y-1 sm:col-span-2">
                        <span className="text-[10px] font-black text-slate-400">اليوم</span>
                        <select
                            value={selectedDay}
                            onChange={(e) => setSelectedDay(e.target.value)}
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

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={handlePreviewOne}
                    className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-800 rounded-2xl font-black text-sm hover:bg-slate-200"
                >
                    <Eye size={18} />
                    معاينة أول لجنة
                </button>
                <button
                    type="button"
                    onClick={handleDownloadAll}
                    disabled={printing || committeeList.length === 0}
                    className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm disabled:opacity-50"
                >
                    <Download size={18} />
                    تنزيل PDF ({committeeList.length} صفحة)
                </button>
                <button
                    type="button"
                    onClick={handlePrintAll}
                    disabled={printing || committeeList.length === 0}
                    className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl font-black text-sm disabled:opacity-50"
                >
                    <Printer size={18} />
                    طباعة الكل
                </button>
            </div>

            {previewUrl && (
                <div className="rounded-2xl border p-4 bg-slate-50 flex justify-center">
                    <img src={previewUrl} alt="معاينة" className="max-h-80 object-contain shadow-lg rounded-lg" />
                </div>
            )}
        </section>
    );
};

export default CoverPrintPanel;
