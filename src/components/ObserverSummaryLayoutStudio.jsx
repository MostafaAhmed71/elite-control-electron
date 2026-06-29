import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, RotateCcw, Save, X, User } from 'lucide-react';
import { saveAppSettings } from '../utils/dataService';
import {
    OBSERVER_SHEET_STAGES,
    OBSERVER_SUMMARY_META_FIELDS,
    buildObserverSummaryMeta,
    buildObserverSummaryRows,
    buildSampleSummaryRows,
    cloneObserverSummaryLayout,
    getObserverPixelSize,
    getObserverSummaryRowTop,
    getSummaryRowShift,
    renderObserverSummaryToCanvas,
    resolveObserverSummaryLayout,
} from '../utils/observerSheetTemplates';

const PREVIEW_COLS = [
    { key: 'name', label: 'اسم المعلم', rightKey: 'nameRight' },
    { key: 'committee', label: 'رقم اللجنة', rightKey: 'committeeRight' },
];

const num = (v, fallback = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
};

const ObserverSummaryLayoutStudio = ({
    stageId,
    appConfig,
    committees = [],
    observers = [],
    assignments = {},
    filters = {},
    onClose,
    onSaved,
}) => {
    const stageDef = OBSERVER_SHEET_STAGES[stageId];
    const { width: PREVIEW_W, height: PREVIEW_H } = getObserverPixelSize(stageId);
    const previewRef = useRef(null);

    const [draft, setDraft] = useState(() => {
        const layout = cloneObserverSummaryLayout(
            resolveObserverSummaryLayout(appConfig, stageId)
        );
        layout.table.indexShow = false;
        return layout;
    });
    const [rowIdx, setRowIdx] = useState(0);
    const [activeMeta, setActiveMeta] = useState('subject');
    const [dragRow, setDragRow] = useState(false);
    const [saving, setSaving] = useState(false);
    const [canvasSrc, setCanvasSrc] = useState('');
    const [previewBusy, setPreviewBusy] = useState(true);

    const summaryMeta = React.useMemo(
        () => buildObserverSummaryMeta(appConfig, stageId, filters),
        [appConfig, stageId, filters?.period, filters?.day]
    );

    const rows = React.useMemo(() => {
        const real = buildObserverSummaryRows(committees, observers, assignments, stageId);
        const list = real.length ? real : buildSampleSummaryRows();
        return list.slice(0, draft.table.maxRowsPerPage ?? 28);
    }, [committees, observers, assignments, stageId, draft.table.maxRowsPerPage]);

    const t = draft.table;
    const current = rows[rowIdx];
    const rowKey = current?.rowKey ?? String(rowIdx);
    const shift = getSummaryRowShift(t, rowKey, rowIdx);

    useEffect(() => {
        if (rowIdx >= rows.length) setRowIdx(0);
    }, [rows.length, rowIdx]);

    const updateTable = (patch) =>
        setDraft((prev) => ({
            ...prev,
            table: { ...prev.table, indexShow: false, ...patch },
        }));

    const updateMeta = (key, patch) =>
        setDraft((prev) => ({
            ...prev,
            meta: { ...prev.meta, [key]: { ...prev.meta[key], ...patch } },
        }));

    const metaField = draft.meta[activeMeta] || {};

    const setRowShift = (patch) => {
        setDraft((prev) => ({
            ...prev,
            table: {
                ...prev.table,
                indexShow: false,
                rowOverrides: {
                    ...(prev.table.rowOverrides || {}),
                    [rowKey]: {
                        top: 0,
                        right: 0,
                        fontSize: 0,
                        ...(prev.table.rowOverrides?.[rowKey] || {}),
                        ...patch,
                    },
                },
            },
        }));
    };

    const rowTopPct = getObserverSummaryRowTop(t, rowIdx, rowKey);

    const positionFromPointer = useCallback((clientX, clientY) => {
        const el = previewRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
            top: Math.round(
                Math.min(92, Math.max(8, ((clientY - rect.top) / rect.height) * 100)) * 10
            ) / 10,
        };
    }, []);

    useEffect(() => {
        if (!dragRow) return;
        const onMove = (e) => {
            const pos = positionFromPointer(e.clientX, e.clientY);
            if (!pos) return;
            const base = num(t.startTop, 32) + rowIdx * num(t.rowHeight, 2.35);
            setRowShift({ top: Math.round((pos.top - base) * 10) / 10, right: 0 });
        };
        const onUp = () => setDragRow(false);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [dragRow, rowIdx, rowKey, t.startTop, t.rowHeight, positionFromPointer]);

    const draftSignature = JSON.stringify({ meta: draft.meta, table: draft.table });

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            setPreviewBusy(true);
            try {
                const canvas = await renderObserverSummaryToCanvas(
                    summaryMeta,
                    rows,
                    draft,
                    stageId,
                    0,
                    0
                );
                if (!cancelled) setCanvasSrc(canvas.toDataURL('image/jpeg', 0.92));
            } catch (e) {
                console.error(e);
                if (!cancelled) setCanvasSrc('');
            } finally {
                if (!cancelled) setPreviewBusy(false);
            }
        }, 120);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [draftSignature, rows, summaryMeta, stageId]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const prev = appConfig?.observerSheets?.[stageId] || {};
            const summary = cloneObserverSummaryLayout(draft);
            summary.table.indexShow = false;
            const next = {
                ...appConfig,
                observerSheets: {
                    ...(appConfig?.observerSheets || {}),
                    [stageId]: { ...prev, summary },
                },
            };
            const saved = await saveAppSettings(next);
            onSaved?.(saved);
            alert('تم حفظ المواضع — التصدير سيستخدم نفس المعاينة');
            onClose();
        } catch (err) {
            console.error(err);
            alert('فشل الحفظ');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-3 bg-slate-900/70 font-alexandria"
            dir="rtl"
        >
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div>
                        <h2 className="text-lg font-black">ضبط مواضع المعلمين — {stageDef.label}</h2>
                        <p className="text-xs text-slate-500 font-bold mt-0.5">
                            المعاينة مطابقة للتصدير — احفظ ثم صدّر
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-100">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col items-center gap-2">
                            <p className="text-[10px] font-black text-emerald-700">
                                معاينة PDF (نفس محرك التصدير)
                            </p>
                            <div
                                ref={previewRef}
                                className="relative mx-auto rounded-xl border-2 border-violet-200 bg-slate-100 overflow-hidden touch-none"
                                style={{ width: PREVIEW_W, height: PREVIEW_H }}
                            >
                                {previewBusy ? (
                                    <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-400">
                                        تحديث المعاينة...
                                    </div>
                                ) : canvasSrc ? (
                                    <img
                                        src={canvasSrc}
                                        alt="معاينة الكشف"
                                        className="absolute inset-0 w-full h-full object-fill pointer-events-none"
                                        draggable={false}
                                    />
                                ) : null}
                                <div
                                    role="button"
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        setDragRow(true);
                                    }}
                                    className="absolute left-0 right-0 border-2 border-violet-500 bg-violet-500/10 rounded cursor-ns-resize z-20"
                                    style={{
                                        top: `${rowTopPct}%`,
                                        height: `${num(t.rowHeight, 2.35)}%`,
                                    }}
                                    title="اسحب لأعلى أو أسفل"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 space-y-3">
                                <p className="text-xs font-black text-amber-900 flex items-center gap-2">
                                    <Calendar size={14} />
                                    رأس الكشف (بيانات من جدول الفترات)
                                </p>
                                <p className="text-[10px] font-bold text-amber-800/80 leading-relaxed">
                                    {summaryMeta.subject} · {summaryMeta.day} · {summaryMeta.date}{' '}
                                    · {summaryMeta.period}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    {OBSERVER_SUMMARY_META_FIELDS.map(({ key, label }) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setActiveMeta(key)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black ${
                                                activeMeta === key
                                                    ? 'bg-amber-600 text-white'
                                                    : 'bg-white text-amber-900 border border-amber-200'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <label className="block text-xs font-black text-slate-600">
                                    {OBSERVER_SUMMARY_META_FIELDS.find((m) => m.key === activeMeta)
                                        ?.label}{' '}
                                    — رأسي: {num(metaField.top, 15)}%
                                    <input
                                        type="range"
                                        min={8}
                                        max={32}
                                        step={0.5}
                                        value={num(metaField.top, 15)}
                                        onChange={(e) =>
                                            updateMeta(activeMeta, {
                                                top: parseFloat(e.target.value),
                                            })
                                        }
                                        className="w-full mt-1"
                                    />
                                </label>
                                <label className="block text-xs font-black text-slate-600">
                                    أفقي: {num(metaField.right, 50)}%
                                    <input
                                        type="range"
                                        min={20}
                                        max={80}
                                        step={0.5}
                                        value={num(metaField.right, 50)}
                                        onChange={(e) =>
                                            updateMeta(activeMeta, {
                                                right: parseFloat(e.target.value),
                                            })
                                        }
                                        className="w-full mt-1"
                                    />
                                </label>
                                <label className="block text-xs font-black text-slate-600">
                                    حجم الخط: {num(metaField.fontSize, 1)} rem
                                    <input
                                        type="range"
                                        min={0.6}
                                        max={1.5}
                                        step={0.05}
                                        value={num(metaField.fontSize, 1)}
                                        onChange={(e) =>
                                            updateMeta(activeMeta, {
                                                fontSize: parseFloat(e.target.value),
                                            })
                                        }
                                        className="w-full mt-1"
                                    />
                                </label>
                            </div>

                            <div className="bg-violet-50 rounded-2xl p-4 border border-violet-100 space-y-3">
                                <p className="text-xs font-black text-violet-900">المعلم المحدد</p>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={rowIdx <= 0}
                                        onClick={() => setRowIdx((i) => i - 1)}
                                        className="p-2 rounded-lg bg-white border disabled:opacity-30"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                    <select
                                        className="flex-1 py-2.5 px-3 rounded-xl border font-black text-sm bg-white"
                                        value={rowIdx}
                                        onChange={(e) => setRowIdx(parseInt(e.target.value, 10))}
                                    >
                                        {rows.map((r, i) => (
                                            <option key={r.rowKey ?? i} value={i}>
                                                {r.teacherName} — {r.committee}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        disabled={rowIdx >= rows.length - 1}
                                        onClick={() => setRowIdx((i) => i + 1)}
                                        className="p-2 rounded-lg bg-white border disabled:opacity-30"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                </div>

                                <label className="block text-xs font-black text-slate-600">
                                    تحريك لأعلى / أسفل: {shift.top}
                                    <input
                                        type="range"
                                        min={-3}
                                        max={3}
                                        step={0.1}
                                        value={shift.top}
                                        onChange={(e) =>
                                            setRowShift({
                                                top: parseFloat(e.target.value),
                                                right: 0,
                                            })
                                        }
                                        className="w-full mt-1"
                                    />
                                </label>
                                <label className="block text-xs font-black text-slate-600">
                                    حجم خط هذا المعلم: {shift.fontSize}
                                    <input
                                        type="range"
                                        min={-0.4}
                                        max={0.4}
                                        step={0.02}
                                        value={shift.fontSize}
                                        onChange={(e) =>
                                            setRowShift({
                                                fontSize: parseFloat(e.target.value),
                                                right: 0,
                                            })
                                        }
                                        className="w-full mt-1"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setRowShift({ top: 0, right: 0, fontSize: 0 })
                                    }
                                    className="text-xs font-black text-violet-700 underline"
                                >
                                    إلغاء تعديل هذا المعلم
                                </button>
                            </div>

                            <div className="bg-slate-50 rounded-2xl p-4 border space-y-3">
                                <p className="text-xs font-black text-slate-700 flex items-center gap-2">
                                    <User size={14} />
                                    مواضع الأعمدة (لجميع المعلمين)
                                </p>
                                {PREVIEW_COLS.map((col) => (
                                    <label key={col.key} className="block text-xs font-black text-slate-600">
                                        {col.label}: {num(t[col.rightKey], 50)}%
                                        <input
                                            type="range"
                                            min={col.key === 'name' ? 25 : 10}
                                            max={col.key === 'name' ? 80 : 55}
                                            step={0.5}
                                            value={num(t[col.rightKey], col.key === 'name' ? 55 : 32)}
                                            onChange={(e) =>
                                                updateTable({
                                                    [col.rightKey]: parseFloat(e.target.value),
                                                })
                                            }
                                            className="w-full mt-1"
                                        />
                                    </label>
                                ))}
                                <label className="block text-xs font-black text-slate-600">
                                    بداية الجدول: {num(t.startTop, 32)}%
                                    <input
                                        type="range"
                                        min={28}
                                        max={50}
                                        step={0.5}
                                        value={num(t.startTop, 32)}
                                        onChange={(e) =>
                                            updateTable({ startTop: parseFloat(e.target.value) })
                                        }
                                        className="w-full mt-1"
                                    />
                                </label>
                                <label className="block text-xs font-black text-slate-600">
                                    المسافة بين الصفوف: {num(t.rowHeight, 2.35)}%
                                    <input
                                        type="range"
                                        min={1.8}
                                        max={4}
                                        step={0.1}
                                        value={num(t.rowHeight, 2.35)}
                                        onChange={(e) =>
                                            updateTable({ rowHeight: parseFloat(e.target.value) })
                                        }
                                        className="w-full mt-1"
                                    />
                                </label>
                                <label className="block text-xs font-black text-slate-600">
                                    حجم الخط العام: {num(t.fontSize, 0.88)} rem
                                    <input
                                        type="range"
                                        min={0.6}
                                        max={1.2}
                                        step={0.02}
                                        value={num(t.fontSize, 0.88)}
                                        onChange={(e) =>
                                            updateTable({ fontSize: parseFloat(e.target.value) })
                                        }
                                        className="w-full mt-1"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center px-6 py-4 border-t bg-slate-50">
                    <button
                        type="button"
                        onClick={() => {
                            const layout = cloneObserverSummaryLayout(null);
                            layout.table.indexShow = false;
                            setDraft(layout);
                            setRowIdx(0);
                        }}
                        className="text-sm font-black text-rose-600 flex items-center gap-1"
                    >
                        <RotateCcw size={16} />
                        افتراضي
                    </button>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl border font-black text-sm"
                        >
                            إلغاء
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2.5 rounded-xl bg-violet-600 text-white font-black text-sm flex items-center gap-2"
                        >
                            <Save size={16} />
                            {saving ? 'جاري الحفظ...' : 'حفظ'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ObserverSummaryLayoutStudio;
