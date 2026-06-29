import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, GripVertical, RotateCcw, Save, SlidersHorizontal, X, List } from 'lucide-react';
import { saveAppSettings } from '../utils/dataService';
import {
    OBSERVER_FIELD_META,
    OBSERVER_SHEET_PREVIEW_WIDTH,
    OBSERVER_SHEET_STAGES,
    buildObserverSheetPages,
    buildSampleObserverPage,
    cloneObserverSheetLayout,
    getObserverPixelSize,
    observerFieldStyle,
    resolveObserverSheetLayout,
} from '../utils/observerSheetTemplates';

const ObserverSheetLayoutStudio = ({
    stageId,
    appConfig,
    committees = [],
    observers = [],
    assignments = {},
    onClose,
    onSaved,
}) => {
    const stageDef = OBSERVER_SHEET_STAGES[stageId];
    const { width: PREVIEW_W, height: PREVIEW_H } = getObserverPixelSize(stageId);

    const previewRef = useRef(null);
    const [draft, setDraft] = useState(() =>
        cloneObserverSheetLayout(resolveObserverSheetLayout(appConfig, stageId))
    );
    const [activeField, setActiveField] = useState('committee');
    const [dragging, setDragging] = useState(false);
    const [saving, setSaving] = useState(false);

    const previewPage = React.useMemo(() => {
        const pages = buildObserverSheetPages(committees, observers, assignments, stageId);
        const withObservers = pages.find((p) => p.observers?.length);
        return withObservers || pages[0] || buildSampleObserverPage(stageId);
    }, [committees, observers, assignments, stageId]);

    const usingSamplePage =
        !buildObserverSheetPages(committees, observers, assignments, stageId).some(
            (p) => p.observers?.length
        );

    useEffect(() => {
        setDraft(cloneObserverSheetLayout(resolveObserverSheetLayout(appConfig, stageId)));
    }, [appConfig, stageId]);

    const updateField = (key, patch) => {
        setDraft((prev) => ({
            ...prev,
            fields: { ...prev.fields, [key]: { ...prev.fields[key], ...patch } },
        }));
    };

    const updateList = (patch) => {
        setDraft((prev) => ({
            ...prev,
            list: { ...prev.list, ...patch },
        }));
    };

    const buildConfigWithDraft = () => {
        const prev = appConfig?.observerSheets?.[stageId] || {};
        const nextStage = cloneObserverSheetLayout(draft);
        return {
            ...appConfig,
            observerSheets: {
                ...(appConfig?.observerSheets || {}),
                [stageId]: {
                    fields: nextStage.fields,
                    list: nextStage.list,
                    summary: nextStage.summary || prev.summary,
                },
            },
        };
    };

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

    const handleSave = async () => {
        setSaving(true);
        try {
            const next = buildConfigWithDraft();
            await saveAppSettings(next);
            onSaved?.(next);
            alert(`✅ تم حفظ مواضع كشف الملاحظين — ${stageDef.label}`);
            onClose();
        } catch (err) {
            console.error(err);
            alert('فشل الحفظ.');
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        if (window.confirm('استعادة المواضع الافتراضية؟')) {
            setDraft(cloneObserverSheetLayout(null));
        }
    };

    const active = draft.fields[activeField] || {};
    const list = draft.list;

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
                            <h2 className="text-xl font-black text-slate-900">
                                ضبط كشف الملاحظين — {stageDef.label}
                            </h2>
                            <p className="text-slate-400 text-xs font-bold mt-0.5">
                                {stageDef.template}
                                {usingSamplePage && (
                                    <span className="text-amber-600 block">
                                        لا توجد إسنادات — معاينة تجريبية
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-3 rounded-2xl bg-slate-50 text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="flex flex-col lg:flex-row gap-8 items-start">
                        <div className="flex-1 flex flex-col items-center w-full">
                            <p className="text-[10px] font-black text-slate-400 mb-2 flex items-center gap-2">
                                <Eye size={14} className="text-indigo-500" />
                                معاينة القالب
                            </p>
                            <div
                                ref={previewRef}
                                className="select-none touch-none rounded-xl shadow-xl border-2 border-violet-200 relative"
                                style={{
                                    width: PREVIEW_W,
                                    height: PREVIEW_H,
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    background: '#fff',
                                }}
                            >
                                <img
                                    src={stageDef.template}
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
                                {OBSERVER_FIELD_META.map(({ key }) => {
                                    const f = draft.fields[key];
                                    const isActive = activeField === key;
                                    const text = previewPage[key];
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
                                                ...observerFieldStyle(f, PREVIEW_W, text),
                                                cursor: 'grab',
                                                zIndex: 10,
                                                padding: isActive ? '4px 8px' : '2px 6px',
                                                borderRadius: '8px',
                                                border: isActive
                                                    ? '2px solid #6366f1'
                                                    : '2px solid transparent',
                                                background: isActive
                                                    ? 'rgba(255,255,255,0.92)'
                                                    : 'rgba(255,255,255,0.55)',
                                            }}
                                        >
                                            <GripVertical size={14} />
                                            {text}
                                        </div>
                                    );
                                })}
                                {(previewPage.observers || []).map((name, i) => {
                                    const top = (list.startTop ?? 38) + i * (list.rowHeight ?? 3.2);
                                    const fontPx =
                                        Math.round((list.fontSize ?? 0.95) * 16 * (PREVIEW_W / OBSERVER_SHEET_PREVIEW_WIDTH) * 10) /
                                        10;
                                    return (
                                        <div
                                            key={i}
                                            style={{
                                                position: 'absolute',
                                                top: `${top}%`,
                                                right: `${list.nameRight ?? list.right ?? 50}%`,
                                                transform: 'translateX(50%)',
                                                fontSize: `${fontPx}px`,
                                                fontWeight: 900,
                                                color: list.color || '#0f172a',
                                                textAlign: 'center',
                                                whiteSpace: 'nowrap',
                                                zIndex: 5,
                                                pointerEvents: 'none',
                                            }}
                                        >
                                            {list.indexShow ? `${i + 1}. ` : ''}
                                            {name}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="w-full lg:w-72 space-y-5 shrink-0">
                            <div className="space-y-2">
                                <span className="text-[10px] font-black text-slate-400">حقول الرأس</span>
                                {OBSERVER_FIELD_META.map(({ key, label }) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setActiveField(key)}
                                        className={`w-full px-4 py-3 rounded-xl text-sm font-black text-right ${
                                            activeField === key
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-slate-50 text-slate-600'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            <div className="luxury-card p-4 bg-slate-50 space-y-3">
                                <p className="text-xs font-black text-slate-600">
                                    {OBSERVER_FIELD_META.find((f) => f.key === activeField)?.label}
                                </p>
                                <label className="block text-[10px] font-black text-slate-400">
                                    رأسي {active.top}%
                                    <input
                                        type="range"
                                        min={5}
                                        max={90}
                                        step={0.5}
                                        value={active.top ?? 20}
                                        onChange={(e) =>
                                            updateField(activeField, { top: parseFloat(e.target.value) })
                                        }
                                        className="w-full premium-range mt-1"
                                    />
                                </label>
                                <label className="block text-[10px] font-black text-slate-400">
                                    أفقي {active.right ?? 50}%
                                    <input
                                        type="range"
                                        min={3}
                                        max={92}
                                        step={0.5}
                                        value={active.right ?? 50}
                                        onChange={(e) =>
                                            updateField(activeField, { right: parseFloat(e.target.value) })
                                        }
                                        className="w-full premium-range mt-1"
                                    />
                                </label>
                                <label className="block text-[10px] font-black text-slate-400">
                                    خط {active.fontSize}rem
                                    <input
                                        type="range"
                                        min={0.5}
                                        max={3}
                                        step={0.05}
                                        value={active.fontSize ?? 1}
                                        onChange={(e) =>
                                            updateField(activeField, { fontSize: parseFloat(e.target.value) })
                                        }
                                        className="w-full premium-range mt-1"
                                    />
                                </label>
                            </div>

                            <div className="luxury-card p-4 bg-violet-50/50 space-y-3 border border-violet-100">
                                <p className="text-xs font-black text-violet-800 flex items-center gap-2">
                                    <List size={14} />
                                    قائمة أسماء الملاحظين
                                </p>
                                <label className="block text-[10px] font-black text-slate-500">
                                    بداية القائمة {list.startTop}%
                                    <input
                                        type="range"
                                        min={25}
                                        max={75}
                                        step={0.5}
                                        value={list.startTop ?? 38}
                                        onChange={(e) =>
                                            updateList({ startTop: parseFloat(e.target.value) })
                                        }
                                        className="w-full premium-range mt-1"
                                    />
                                </label>
                                <label className="block text-[10px] font-black text-slate-500">
                                    ارتفاع الصف {list.rowHeight}%
                                    <input
                                        type="range"
                                        min={1.5}
                                        max={6}
                                        step={0.1}
                                        value={list.rowHeight ?? 3.2}
                                        onChange={(e) =>
                                            updateList({ rowHeight: parseFloat(e.target.value) })
                                        }
                                        className="w-full premium-range mt-1"
                                    />
                                </label>
                                <label className="block text-[10px] font-black text-slate-500">
                                    حجم خط الاسم {list.fontSize}rem
                                    <input
                                        type="range"
                                        min={0.5}
                                        max={2}
                                        step={0.05}
                                        value={list.fontSize ?? 0.95}
                                        onChange={(e) =>
                                            updateList({ fontSize: parseFloat(e.target.value) })
                                        }
                                        className="w-full premium-range mt-1"
                                    />
                                </label>
                                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={list.indexShow !== false}
                                        onChange={(e) => updateList({ indexShow: e.target.checked })}
                                    />
                                    إظهار الترقيم
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap justify-between gap-3 px-8 py-6 border-t bg-slate-50/50">
                    <button
                        type="button"
                        onClick={handleReset}
                        className="flex items-center gap-2 px-5 py-3 text-rose-600 font-black text-sm rounded-2xl hover:bg-rose-50"
                    >
                        <RotateCcw size={18} />
                        استعادة الافتراضي
                    </button>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 border rounded-2xl font-black text-sm"
                        >
                            إلغاء
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save size={18} />
                            {saving ? 'جاري الحفظ...' : 'حفظ'}
                        </button>
                    </div>
                </div>
            </div>
            <style>{`
                .premium-range { -webkit-appearance: none; width: 100%; height: 6px; background: #e2e8f0; border-radius: 5px; }
                .premium-range::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: #4f46e5; border-radius: 50%; cursor: pointer; border: 2px solid white; }
            `}</style>
        </div>
    );
};

export default ObserverSheetLayoutStudio;
