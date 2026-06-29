import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, GripVertical, RotateCcw, Save, SlidersHorizontal, X, Download } from 'lucide-react';
import CoverExportDialog from './CoverExportDialog';
import { saveAppSettings } from '../utils/dataService';
import {
    COVER_PREVIEW_WIDTH,
    buildDefaultLayoutFromFields,
    buildDefaultPreviewContext,
    cloneCoverLayout,
    coverFieldStyle,
    getCoverPixelSize,
    getCoverTemplate,
    resolveCoverLayout,
    resolveCoverFieldData,
} from '../utils/coverTemplates';
import {
    buildCoverContext,
    committeesFromStudents,
    filterStudentsForCover,
} from '../utils/coverDataSources';

const CoverLayoutStudio = ({
    templateId,
    appConfig,
    students = [],
    committees = [],
    onClose,
    onSaved,
}) => {
    const [previewCommittee, setPreviewCommittee] = useState('الكل');
    const [previewGrade, setPreviewGrade] = useState('الكل');

    const templateDef = appConfig?.coverLibrary?.items?.find((t) => t.id === templateId);
    const studentStage = templateDef?.stage === 'middle' ? 'متوسط' : 'ثانوي';
    const stageStudents = useMemo(
        () => (students || []).filter((s) => s.stage === studentStage),
        [students, studentStage]
    );

    const previewCtx = useMemo(() => {
        if (!stageStudents.length) {
            return buildDefaultPreviewContext(appConfig, students, committees);
        }
        const grades = [...new Set(stageStudents.map((s) => s.grade).filter(Boolean))];
        const grade = previewGrade !== 'الكل' ? previewGrade : grades[0] || 'الكل';
        const comms = committeesFromStudents(
            filterStudentsForCover(stageStudents, {
                stage: studentStage,
                grade,
                committee: 'الكل',
                period: 1,
                day: 'الكل',
            })
        );
        const committee =
            previewCommittee !== 'الكل' ? previewCommittee : comms[0] || 'الكل';
        return buildCoverContext({
            appConfig,
            students: stageStudents,
            committees,
            filters: {
                stage: studentStage,
                grade,
                committee: 'الكل',
                period: 1,
                day: 'الكل',
            },
            committee,
        });
    }, [
        appConfig,
        stageStudents,
        students,
        committees,
        previewCommittee,
        previewGrade,
        studentStage,
    ]);

    const template = getCoverTemplate(appConfig, templateId, previewCtx);
    const { width: PREVIEW_W, height: PREVIEW_H } = getCoverPixelSize(template, COVER_PREVIEW_WIDTH);

    const previewRef = useRef(null);
    const [draft, setDraft] = useState(() =>
        cloneCoverLayout(resolveCoverLayout(appConfig, templateId), template)
    );
    const [activeField, setActiveField] = useState(template.fields?.[0]?.key || 'committee');
    const [dragging, setDragging] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showExportDialog, setShowExportDialog] = useState(false);

    useEffect(() => {
        const t = getCoverTemplate(appConfig, templateId);
        setDraft(cloneCoverLayout(resolveCoverLayout(appConfig, templateId), t));
    }, [appConfig, templateId]);

    const previewValues = useMemo(
        () => resolveCoverFieldData(template.fields, previewCtx),
        [template.fields, previewCtx]
    );

    const previewGrades = useMemo(
        () => ['الكل', ...new Set(stageStudents.map((s) => s.grade).filter(Boolean))],
        [stageStudents]
    );
    const previewCommittees = useMemo(() => {
        const g = previewGrade === 'الكل' ? stageStudents : stageStudents.filter((s) => s.grade === previewGrade);
        return ['الكل', ...committeesFromStudents(g)];
    }, [stageStudents, previewGrade]);

    const updateField = (key, patch) => {
        setDraft((prev) => ({
            ...prev,
            [key]: { ...prev[key], ...patch },
        }));
    };

    const buildConfigWithDraft = () => ({
        ...appConfig,
        covers: {
            ...(appConfig?.covers || {}),
            [templateId]: cloneCoverLayout(draft, template),
        },
    });

    const positionFromPointer = useCallback((clientX, clientY) => {
        const el = previewRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const right = ((rect.right - clientX) / rect.width) * 100;
        const top = ((clientY - rect.top) / rect.height) * 100;
        return {
            right: Math.round(Math.min(92, Math.max(3, right)) * 10) / 10,
            top: Math.round(Math.min(92, Math.max(5, top)) * 10) / 10,
        };
    }, []);

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e) => {
            const pos = positionFromPointer(e.clientX, e.clientY);
            if (pos && activeField) updateField(activeField, pos);
        };
        const onUp = () => setDragging(false);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [dragging, activeField, positionFromPointer]);

    const handleSave = async (stayOpen = false) => {
        if (!appConfig) return;
        setSaving(true);
        try {
            const next = buildConfigWithDraft();
            await saveAppSettings(next);
            onSaved?.(next);
            alert(`✅ تم حفظ مواضع «${template.name}»`);
            if (!stayOpen) onClose();
        } catch (err) {
            console.error(err);
            alert('فشل الحفظ. تحقق من الاتصال بقاعدة البيانات.');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        if (window.confirm(`استعادة المواضع الافتراضية لـ «${template.name}»؟`)) {
            setDraft(buildDefaultLayoutFromFields(template.fields));
        }
    };

    const handleOpenExport = () => {
        if (!stageStudents.length) {
            alert('لا يوجد طلاب لهذه المرحلة. أضف الطلاب أولاً.');
            return;
        }
        setShowExportDialog(true);
    };

    const fieldMeta = template.fields || [];
    const fieldDefaults = buildDefaultLayoutFromFields(template.fields);
    const active = draft[activeField] || fieldDefaults[activeField] || {};

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm font-alexandria"
            dir="rtl"
        >
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <SlidersHorizontal size={22} className="text-indigo-600" />
                        <div>
                            <h2 className="text-xl font-black text-slate-900 font-header">
                                ضبط معايير — {template.name}
                            </h2>
                            <p className="text-slate-400 text-xs font-bold mt-0.5">
                                اسحب الحقول على القالب ثم احفظ — مثل ضبط كشوف الحضور
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="flex flex-col lg:flex-row gap-8 items-start">
                        <div className="flex-1 flex flex-col items-center w-full">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                <Eye size={14} className="text-indigo-500" />
                                معاينة الغلاف
                            </p>
                            <p className="text-[10px] font-bold text-amber-700 mb-2">
                                المعاينة ببيانات حقيقية من النظام
                            </p>
                            <div className="flex flex-wrap gap-2 mb-3 justify-center">
                                <select
                                    value={previewGrade}
                                    onChange={(e) => setPreviewGrade(e.target.value)}
                                    className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-white"
                                >
                                    {previewGrades.map((g) => (
                                        <option key={g} value={g}>
                                            {g}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={previewCommittee}
                                    onChange={(e) => setPreviewCommittee(e.target.value)}
                                    className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-white"
                                >
                                    {previewCommittees.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div
                                ref={previewRef}
                                className="select-none touch-none rounded-xl shadow-xl border-2 border-indigo-200"
                                style={{
                                    position: 'relative',
                                    width: PREVIEW_W,
                                    height: PREVIEW_H,
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    background: '#ffffff',
                                }}
                            >
                                {template.template && (
                                    <img
                                        src={template.template}
                                        alt=""
                                        draggable={false}
                                        style={{
                                            position: 'absolute',
                                            inset: 0,
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'fill',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                )}
                                {fieldMeta.map(({ key, color }) => {
                                    const f = draft[key];
                                    const isActive = activeField === key;
                                    const text = previewValues[key];
                                    return (
                                        <div
                                            key={key}
                                            role="button"
                                            tabIndex={0}
                                            onPointerDown={(e) => {
                                                e.preventDefault();
                                                setActiveField(key);
                                                setDragging(true);
                                                const pos = positionFromPointer(e.clientX, e.clientY);
                                                if (pos) updateField(key, pos);
                                            }}
                                            style={{
                                                ...coverFieldStyle(
                                                    { ...f, color: f?.color || color },
                                                    PREVIEW_W,
                                                    text
                                                ),
                                                cursor: 'grab',
                                                zIndex: 10,
                                                padding: isActive ? '4px 8px' : '2px 6px',
                                                borderRadius: '8px',
                                                border: isActive
                                                    ? '2px solid #6366f1'
                                                    : '2px solid transparent',
                                                background: isActive
                                                    ? 'rgba(255,255,255,0.9)'
                                                    : 'rgba(255,255,255,0.55)',
                                            }}
                                        >
                                            <span className="flex items-center gap-1">
                                                <GripVertical
                                                    size={14}
                                                    className={isActive ? 'text-indigo-600' : 'text-slate-400'}
                                                />
                                                {text}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="w-full lg:w-72 space-y-6 shrink-0">
                            <div className="space-y-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    الحقل النشط
                                </span>
                                <div className="flex flex-col gap-2">
                                    {fieldMeta.map(({ key, label }) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setActiveField(key)}
                                            className={`px-4 py-3 rounded-xl text-sm font-black text-right transition-all ${
                                                activeField === key
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-slate-50 text-slate-600 hover:bg-indigo-50'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="luxury-card p-5 bg-slate-50 border-slate-100 space-y-4">
                                <p className="text-xs font-black text-slate-600">
                                    {fieldMeta.find((f) => f.key === activeField)?.label}
                                </p>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black text-slate-400">
                                        <span>رأسي (top)</span>
                                        <span className="text-indigo-600">{active.top}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={5}
                                        max={92}
                                        step={0.5}
                                        value={active.top ?? 40}
                                        onChange={(e) =>
                                            updateField(activeField, { top: parseFloat(e.target.value) })
                                        }
                                        className="w-full premium-range"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black text-slate-400">
                                        <span>أفقي (right / وسط)</span>
                                        <span className="text-indigo-600">{active.right ?? 50}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={3}
                                        max={92}
                                        step={0.5}
                                        value={active.right ?? 50}
                                        onChange={(e) =>
                                            updateField(activeField, { right: parseFloat(e.target.value) })
                                        }
                                        className="w-full premium-range"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black text-slate-400">
                                        <span>حجم الخط</span>
                                        <span className="text-indigo-600">{active.fontSize}rem</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0.5}
                                        max={3.5}
                                        step={0.05}
                                        value={active.fontSize ?? 1}
                                        onChange={(e) =>
                                            updateField(activeField, { fontSize: parseFloat(e.target.value) })
                                        }
                                        className="w-full premium-range"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-8 py-6 border-t border-slate-100 bg-slate-50/50">
                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={handleReset}
                            className="flex items-center gap-2 px-5 py-3 text-rose-600 font-black text-sm hover:bg-rose-50 rounded-2xl"
                        >
                            <RotateCcw size={18} />
                            استعادة الافتراضي
                        </button>
                        <button
                            type="button"
                            onClick={handleOpenExport}
                            className="flex items-center gap-2 px-5 py-3 text-emerald-700 font-black text-sm hover:bg-emerald-50 rounded-2xl"
                        >
                            <Download size={18} />
                            تصدير PDF
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 bg-white border border-slate-200 rounded-2xl font-black text-sm text-slate-600"
                        >
                            إلغاء
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSave(false)}
                            disabled={saving}
                            className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save size={18} />
                            {saving ? 'جاري الحفظ...' : 'حفظ وإغلاق'}
                        </button>
                    </div>
                </div>
            </div>

            <CoverExportDialog
                open={showExportDialog}
                onClose={() => setShowExportDialog(false)}
                appConfig={appConfig}
                template={{ ...templateDef, ...template, id: templateId }}
                layoutDraft={draft}
                students={students}
                committees={committees}
            />

            <style>{`
                .premium-range {
                  -webkit-appearance: none;
                  width: 100%;
                  height: 6px;
                  background: #e2e8f0;
                  border-radius: 5px;
                }
                .premium-range::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  width: 16px;
                  height: 16px;
                  background: #4f46e5;
                  border-radius: 50%;
                  cursor: pointer;
                  border: 2px solid white;
                }
            `}</style>
        </div>
    );
};

export default CoverLayoutStudio;
