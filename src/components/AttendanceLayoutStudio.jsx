import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, RotateCcw } from 'lucide-react';
import {
    ATTENDANCE_PAGE_ROWS,
    ATTENDANCE_TEMPLATE,
    getStudentRowTop,
    maxRowHeightPct,
    resolveAttendanceConfig,
} from '../utils/attendanceLayout';
import AttendanceSheetPage from './AttendanceSheetPage';

const PREVIEW_W = 360;
const PREVIEW_H = Math.round(PREVIEW_W * (297 / 210));

export const SAMPLE_ATTENDANCE_PAGE = {
    id: 'preview',
    committee: '1',
    grade: 'الأول الثانوي',
    totalCount: 25,
    globalStartIndex: 0,
    sheetMeta: {
        subject: 'رياضيات',
        day: 'الأحد',
        date: '١٤٤٧/٠٣/٠١',
        periodLabel: 'الفترة الأولى',
    },
    students: [
        {
            id: 'p1',
            name: 'عبدالله سعود محمد بن عبدالعزيز آل سعود',
            seatNumber: '101',
            grade: 'الأول الثانوي',
        },
        { id: 'p2', name: 'سعود عبدالله العتيبي', seatNumber: '102', grade: 'الأول الثانوي' },
        { id: 'p3', name: 'فهد خالد الدوسري', seatNumber: '103', grade: 'الأول الثانوي' },
    ],
};

const META_PREVIEW_KEYS = {
    headerSubject: 'subject',
    headerDay: 'day',
    headerDate: 'date',
    headerPeriod: 'periodLabel',
};

const HEADER_FIELDS = [
    { key: 'headerSubject', label: 'المادة', anchor: 'center' },
    { key: 'headerDay', label: 'اليوم', anchor: 'center' },
    { key: 'headerDate', label: 'التاريخ', anchor: 'center' },
    { key: 'headerPeriod', label: 'الفترة', anchor: 'center' },
    { key: 'headerCommittee', label: 'رقم اللجنة', anchor: 'right' },
    { key: 'headerCount', label: 'عدد الطلاب', anchor: 'center' },
    { key: 'headerGrade', label: 'الصف (رأس الكشف)', anchor: 'center' },
];

/** م → اسم → جلوس → صف */
const TABLE_COLUMNS = [
    { key: 'index', label: 'م', rightKey: 'indexRight', topKey: 'indexTop', anchor: 'center' },
    {
        key: 'name',
        label: 'اسم الطالب',
        rightKey: 'nameRight',
        topKey: 'nameTop',
        widthKey: 'nameWidthPct',
        anchor: 'right',
    },
    { key: 'seat', label: 'رقم الجلوس', rightKey: 'seatRight', topKey: 'seatTop', anchor: 'center' },
    { key: 'grade', label: 'الصف', rightKey: 'gradeRight', topKey: 'gradeTop', anchor: 'center' },
];

export const cloneAttendanceConfig = (raw) => resolveAttendanceConfig(raw);

function buildStudioMeta(previewPage, sheetMetaProp, sheetMetaPreview) {
    const fromPage = previewPage?.sheetMeta || {};
    const ext = sheetMetaProp || {};
    const manual = sheetMetaPreview || {};
    const pick = (key) => {
        for (const src of [manual, ext, fromPage, SAMPLE_ATTENDANCE_PAGE.sheetMeta]) {
            const v = src?.[key];
            if (v != null && String(v).trim() && v !== '—') return String(v).trim();
        }
        return SAMPLE_ATTENDANCE_PAGE.sheetMeta[key];
    };
    return {
        subject: pick('subject'),
        day: pick('day'),
        date: pick('date'),
        periodLabel: pick('periodLabel'),
    };
}

const rowFieldId = (idx) => `row-${idx}`;
const colFieldId = (key) => `col-${key}`;

const parseRowFieldId = (id) => {
    if (!id?.startsWith('row-')) return null;
    return parseInt(id.slice(4), 10);
};

const parseColFieldId = (id) => {
    if (!id?.startsWith('col-')) return null;
    return id.slice(4);
};

const handleTransform = (anchor) => {
    if (anchor === 'center') return 'translate(50%, -50%)';
    if (anchor === 'right') return 'translateY(-50%)';
    return 'translate(50%, -50%)';
};

/**
 * @param {{ draft: object, setDraft: function, previewPage?: object, sheetMeta?: object }} props
 */
const AttendanceLayoutStudio = ({
    draft,
    setDraft,
    previewPage = SAMPLE_ATTENDANCE_PAGE,
    sheetMeta: sheetMetaProp,
}) => {
    const previewWrapRef = useRef(null);
    const [activeField, setActiveField] = useState('headerSubject');
    const [selectedRowIdx, setSelectedRowIdx] = useState(0);
    const [dragging, setDragging] = useState(false);
    const activeFieldRef = useRef(activeField);
    const draftRef = useRef(draft);
    const selectedRowRef = useRef(selectedRowIdx);

    const maxRowSlots = ATTENDANCE_PAGE_ROWS;

    useEffect(() => {
        activeFieldRef.current = activeField;
    }, [activeField]);

    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    useEffect(() => {
        selectedRowRef.current = selectedRowIdx;
    }, [selectedRowIdx]);

    useEffect(() => {
        if (!sheetMetaProp) return;
        const hasReal = ['subject', 'day', 'date', 'periodLabel'].some(
            (k) => sheetMetaProp[k] && sheetMetaProp[k] !== '—'
        );
        if (!hasReal) return;
        setDraft((p) => {
            const cur = p.sheetMetaPreview || {};
            if (cur.subject && cur.subject !== '—') return p;
            return {
                ...p,
                sheetMetaPreview: {
                    subject: sheetMetaProp.subject,
                    day: sheetMetaProp.day,
                    date: sheetMetaProp.date,
                    periodLabel: sheetMetaProp.periodLabel,
                },
            };
        });
    }, [
        sheetMetaProp?.subject,
        sheetMetaProp?.day,
        sheetMetaProp?.date,
        sheetMetaProp?.periodLabel,
    ]);

    const previewMeta = useMemo(
        () => buildStudioMeta(previewPage, sheetMetaProp, draft.sheetMetaPreview),
        [previewPage, sheetMetaProp, draft.sheetMetaPreview]
    );

    const studioPreviewPage = useMemo(() => {
        const src = previewPage ?? SAMPLE_ATTENDANCE_PAGE;
        const student =
            src.students?.[selectedRowIdx] ??
            src.students?.[0] ??
            SAMPLE_ATTENDANCE_PAGE.students[0];
        return {
            ...src,
            sheetMeta: previewMeta,
            students: [student],
            globalStartIndex: selectedRowIdx,
            totalCount: src.totalCount ?? ATTENDANCE_PAGE_ROWS,
        };
    }, [previewPage, selectedRowIdx, previewMeta]);

    const usingSampleMeta =
        !(sheetMetaProp?.subject && sheetMetaProp.subject !== '—') &&
        !(previewPage?.sheetMeta?.subject && previewPage.sheetMeta.subject !== '—');

    const updateSheetMetaPreview = useCallback(
        (key, value) => {
            setDraft((prev) => ({
                ...prev,
                sheetMetaPreview: { ...(prev.sheetMetaPreview || {}), [key]: value },
            }));
        },
        [setDraft]
    );

    useEffect(() => {
        const img = new Image();
        img.src = ATTENDANCE_TEMPLATE;
    }, []);

    const positionFromPointer = useCallback((clientX, clientY) => {
        const el = previewWrapRef.current;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const right = ((rect.right - clientX) / rect.width) * 100;
        const top = ((clientY - rect.top) / rect.height) * 100;
        return {
            right: Math.round(Math.min(96, Math.max(2, right)) * 10) / 10,
            top: Math.round(Math.min(96, Math.max(2, top)) * 10) / 10,
        };
    }, []);

    const updateHeader = useCallback(
        (key, patch) => {
            setDraft((prev) => ({
                ...prev,
                [key]: { ...prev[key], ...patch },
            }));
        },
        [setDraft]
    );

    const updateTable = useCallback(
        (patch) => {
            setDraft((prev) => ({
                ...prev,
                table: { ...prev.table, ...patch },
            }));
        },
        [setDraft]
    );

    const updateRowOverride = useCallback(
        (idx, patch) => {
            setDraft((prev) => ({
                ...prev,
                table: {
                    ...prev.table,
                    rowOverrides: {
                        ...prev.table.rowOverrides,
                        [idx]: {
                            top: 0,
                            right: 0,
                            fontSize: 0,
                            ...(prev.table.rowOverrides?.[idx] || {}),
                            ...patch,
                        },
                    },
                },
            }));
        },
        [setDraft]
    );

    const applyFontSizeToAllRows = useCallback(() => {
        setDraft((prev) => {
            const fs = prev.table.rowOverrides?.[selectedRowIdx]?.fontSize ?? 0;
            const overrides = { ...(prev.table.rowOverrides || {}) };
            for (let i = 0; i < maxRowSlots; i++) {
                const cur = overrides[i] || { top: 0, right: 0, fontSize: 0 };
                overrides[i] = { ...cur, fontSize: fs, right: 0 };
            }
            return {
                ...prev,
                table: { ...prev.table, rowOverrides: overrides },
            };
        });
    }, [selectedRowIdx, maxRowSlots, setDraft]);

    const applyDrag = useCallback(
        (pos) => {
            if (!pos) return;
            const field = activeFieldRef.current;
            const d = draftRef.current;

            if (field.startsWith('header')) {
                updateHeader(field, { top: pos.top, right: pos.right });
                return;
            }

            const colKey = parseColFieldId(field);
            if (colKey) {
                const col = TABLE_COLUMNS.find((c) => c.key === colKey);
                if (col) {
                    const anchorTop = getStudentRowTop(d, 0);
                    updateTable({
                        [col.rightKey]: pos.right,
                        [col.topKey]: Math.round((pos.top - anchorTop) * 10) / 10,
                    });
                }
                return;
            }

            const rowIdx = parseRowFieldId(field);
            if (rowIdx != null && !Number.isNaN(rowIdx)) {
                const baseTop = d.table.startTop + rowIdx * d.table.rowHeight;
                updateRowOverride(rowIdx, {
                    top: Math.round((pos.top - baseTop) * 10) / 10,
                });
            }
        },
        [updateHeader, updateTable, updateRowOverride]
    );

    useEffect(() => {
        if (!dragging) return;
        const onMove = (e) => applyDrag(positionFromPointer(e.clientX, e.clientY));
        const onUp = () => setDragging(false);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
    }, [dragging, applyDrag, positionFromPointer]);

    const handleReset = () => {
        if (window.confirm('استعادة مواضع القالب الافتراضية؟')) {
            setDraft(cloneAttendanceConfig(null));
            setSelectedRowIdx(0);
            setActiveField('col-name');
        }
    };

    const isHeaderActive = activeField.startsWith('header');
    const activeHeader = isHeaderActive ? draft[activeField] : null;
    const activeColKey = parseColFieldId(activeField);
    const activeCol = TABLE_COLUMNS.find((c) => c.key === activeColKey);
    const rowOverride = draft.table.rowOverrides?.[selectedRowIdx] || {
        top: 0,
        right: 0,
        fontSize: 0,
    };

    const startDrag = (field, e) => {
        e.preventDefault();
        e.stopPropagation();
        activeFieldRef.current = field;
        setActiveField(field);
        if (field.startsWith('row-')) {
            setSelectedRowIdx(parseRowFieldId(field) ?? 0);
        }
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        setDragging(true);
        const pos = positionFromPointer(e.clientX, e.clientY);
        if (pos) applyDrag(pos);
    };

    const colHandleTop = (col) =>
        getStudentRowTop(draft, selectedRowIdx) + (draft.table[col.topKey] || 0);

    const rowBandTop = getStudentRowTop(draft, selectedRowIdx);

    const goRow = (delta) => {
        const next = Math.min(maxRowSlots - 1, Math.max(0, selectedRowIdx + delta));
        setSelectedRowIdx(next);
        setActiveField(`row-${next}`);
    };

    return (
        <div className="space-y-6 font-alexandria">
            <div className="luxury-card p-4 bg-indigo-50 border-indigo-100 space-y-3">
                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest block">
                    ضبط صف الطالب (صف واحد في المعاينة)
                </span>
                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => goRow(-1)}
                        disabled={selectedRowIdx <= 0}
                        className="p-2 rounded-xl bg-white border border-indigo-200 disabled:opacity-30"
                    >
                        <ChevronRight size={20} />
                    </button>
                    <div className="text-center flex-1">
                        <span className="text-lg font-black text-indigo-800 font-header">
                            صف {selectedRowIdx + 1}
                        </span>
                        <span className="text-[10px] font-bold text-indigo-500 block">
                            من {maxRowSlots}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => goRow(1)}
                        disabled={selectedRowIdx >= maxRowSlots - 1}
                        className="p-2 rounded-xl bg-white border border-indigo-200 disabled:opacity-30"
                    >
                        <ChevronLeft size={20} />
                    </button>
                </div>
                <select
                    className="w-full px-4 py-2 rounded-xl font-black text-sm bg-white border border-indigo-200"
                    value={selectedRowIdx}
                    onChange={(e) => {
                        const idx = parseInt(e.target.value, 10);
                        setSelectedRowIdx(idx);
                        setActiveField(rowFieldId(idx));
                    }}
                >
                    {Array.from({ length: maxRowSlots }).map((_, i) => (
                        <option key={i} value={i}>
                            صف {i + 1}
                        </option>
                    ))}
                </select>
                <SliderRow
                    label="إزاحة رأسية لهذا الصف"
                    value={rowOverride.top}
                    min={-2}
                    max={2}
                    step={0.1}
                    onChange={(v) => updateRowOverride(selectedRowIdx, { top: v, right: 0 })}
                />
                <SliderRow
                    label="حجم خط هذا الصف (للصف كاملاً)"
                    value={rowOverride.fontSize ?? 0}
                    min={-0.5}
                    max={0.5}
                    step={0.02}
                    onChange={(v) =>
                        updateRowOverride(selectedRowIdx, { fontSize: v, right: 0 })
                    }
                />
                <p className="text-[10px] font-black text-indigo-600/80">
                    الحجم الفعلي:{' '}
                    {(draft.table.fontSize + (rowOverride.fontSize || 0)).toFixed(2)} rem
                </p>
                <button
                    type="button"
                    onClick={applyFontSizeToAllRows}
                    className="w-full py-3 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition-colors"
                >
                    تطبيق حجم هذا الصف على كل الصفوف ({maxRowSlots})
                </button>
                <button
                    type="button"
                    onClick={() =>
                        updateRowOverride(selectedRowIdx, { top: 0, right: 0, fontSize: 0 })
                    }
                    className="text-[10px] font-black text-indigo-600 hover:underline"
                >
                    إعادة ضبط هذا الصف
                </button>
            </div>

            <div className="flex flex-col items-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-center">
                    اسحب الملصق أفقياً ورأسياً — يظهر الصف المحدد فقط
                </p>
                {usingSampleMeta && (
                    <p className="text-[10px] font-bold text-amber-600 mb-2 text-center px-2">
                        بيانات المادة/اليوم/التاريخ للمعاينة — عيّن جدول الفترات من القائمة
                    </p>
                )}
                <div
                    ref={previewWrapRef}
                    className="relative rounded-xl shadow-lg border-2 border-indigo-200 bg-slate-100 overflow-hidden select-none touch-none mx-auto"
                    style={{ width: PREVIEW_W, height: PREVIEW_H }}
                >
                    <AttendanceSheetPage
                        page={studioPreviewPage}
                        config={draft}
                        previewPx={{ width: PREVIEW_W, height: PREVIEW_H }}
                        embedded
                        focusRowIdx={selectedRowIdx}
                    />

                    <div
                        className="absolute left-1 right-1 border-2 border-indigo-500/80 bg-indigo-400/10 rounded pointer-events-none z-20"
                        style={{
                            top: `${rowBandTop}%`,
                            height: `${draft.table.rowHeight}%`,
                        }}
                    />

                    {HEADER_FIELDS.map(({ key, label, anchor }) => {
                        if (!draft[key]?.show) return null;
                        const f = draft[key];
                        const isActive = activeField === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                onPointerDown={(e) => startDrag(key, e)}
                                className={`absolute z-32 px-2 py-1 rounded-lg font-black text-xs whitespace-nowrap flex items-center gap-1 ${
                                    isActive
                                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-300'
                                        : 'bg-amber-100/90 text-amber-900 border border-amber-300'
                                }`}
                                style={{
                                    top: `${f.top}%`,
                                    right: `${f.right}%`,
                                    transform: handleTransform(anchor),
                                    pointerEvents: 'auto',
                                    cursor: 'grab',
                                }}
                            >
                                <GripVertical size={12} />
                                {label}
                            </button>
                        );
                    })}

                    {TABLE_COLUMNS.map((col) => {
                        const showKey = `${col.key}Show`;
                        if (!draft.table[showKey]) return null;

                        const right = draft.table[col.rightKey];
                        const topOnPage = colHandleTop(col);
                        const isActive = activeField === colFieldId(col.key);

                        return (
                            <button
                                key={col.key}
                                type="button"
                                onPointerDown={(e) => startDrag(colFieldId(col.key), e)}
                                className={`absolute z-40 px-2 py-1 rounded-lg font-black text-[10px] whitespace-nowrap flex items-center gap-1 ${
                                    isActive
                                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                                        : 'bg-emerald-100/95 text-emerald-900 border border-emerald-300'
                                }`}
                                style={{
                                    top: `${topOnPage}%`,
                                    right: `${right}%`,
                                    transform: handleTransform(col.anchor),
                                    pointerEvents: 'auto',
                                    cursor: 'grab',
                                }}
                            >
                                <GripVertical size={10} />
                                {col.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                    رأس الكشف
                </span>
                <div className="flex flex-wrap gap-2">
                    {HEADER_FIELDS.map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveField(key)}
                            className={`px-3 py-2 rounded-xl text-xs font-black ${
                                activeField === key ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-600'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="luxury-card p-4 bg-emerald-50 border-emerald-100 space-y-4">
                <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block">
                    أعمدة بيانات الطالب (كل حقل منفصل)
                </span>
                <p className="text-[10px] font-bold text-emerald-700/80">
                    اختر الحقل ثم اسحب الملصق أفقياً ورأسياً — يطبّق على كل الصفوف
                </p>
                <div className="flex flex-wrap gap-2">
                    {TABLE_COLUMNS.map(({ key, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveField(colFieldId(key))}
                            className={`px-3 py-2 rounded-xl text-xs font-black ${
                                activeField === colFieldId(key)
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-white text-slate-600 border border-emerald-200'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {activeCol && (
                    <>
                        <SliderRow
                            label={`${activeCol.label} — يمين/يسار %`}
                            value={draft.table[activeCol.rightKey]}
                            min={2}
                            max={96}
                            step={0.5}
                            onChange={(v) => updateTable({ [activeCol.rightKey]: v })}
                        />
                        {activeCol.widthKey && (
                            <SliderRow
                                label="عرض عمود الاسم % (5 أسماء في سطر)"
                                value={draft.table[activeCol.widthKey]}
                                min={22}
                                max={Math.max(
                                    24,
                                    (draft.table.seatRight ?? 46) -
                                        (draft.table.nameRight ?? 15) -
                                        3
                                )}
                                step={0.5}
                                onChange={(v) => updateTable({ [activeCol.widthKey]: v })}
                            />
                        )}
                        <SliderRow
                            label={`${activeCol.label} — رأسي (إزاحة عمود)`}
                            value={draft.table[activeCol.topKey] || 0}
                            min={-3}
                            max={3}
                            step={0.1}
                            onChange={(v) => updateTable({ [activeCol.topKey]: v })}
                        />
                    </>
                )}
            </div>

            {isHeaderActive && activeHeader && (
                <div className="luxury-card p-4 bg-slate-50 border-slate-100 space-y-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                        ضبط رأس الكشف (مادة · يوم · تاريخ · فترة · لجنة · العدد)
                    </span>
                    <label className="flex items-center justify-between text-xs font-black">
                        <span>إظهار</span>
                        <input
                            type="checkbox"
                            checked={activeHeader.show}
                            onChange={(e) => updateHeader(activeField, { show: e.target.checked })}
                        />
                    </label>
                    <SliderRow
                        label="رأسي %"
                        value={activeHeader.top}
                        min={0}
                        max={50}
                        step={0.5}
                        onChange={(v) => updateHeader(activeField, { top: v })}
                    />
                    <SliderRow
                        label="يمين/يسار %"
                        value={activeHeader.right}
                        min={2}
                        max={96}
                        step={0.5}
                        onChange={(v) => updateHeader(activeField, { right: v })}
                    />
                    <SliderRow
                        label="حجم الخط"
                        value={activeHeader.fontSize}
                        min={0.5}
                        max={2}
                        step={0.1}
                        onChange={(v) => updateHeader(activeField, { fontSize: v })}
                    />
                    {META_PREVIEW_KEYS[activeField] && (
                        <label className="block space-y-2 pt-2 border-t border-slate-200">
                            <span className="text-[10px] font-black text-slate-500 uppercase">
                                نص يظهر على الكشف
                            </span>
                            <input
                                type="text"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 font-black text-sm"
                                value={
                                    draft.sheetMetaPreview?.[META_PREVIEW_KEYS[activeField]] ??
                                    previewMeta[META_PREVIEW_KEYS[activeField]] ??
                                    ''
                                }
                                onChange={(e) =>
                                    updateSheetMetaPreview(
                                        META_PREVIEW_KEYS[activeField],
                                        e.target.value
                                    )
                                }
                            />
                            <span className="text-[10px] font-bold text-slate-400">
                                يُحفظ مع «حفظ المواضع» — من جدول الفترات أو تعديل يدوي
                            </span>
                        </label>
                    )}
                </div>
            )}

            <div className="luxury-card p-4 bg-indigo-600 text-white space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">
                    هيكل الجدول
                </span>
                <SliderRow
                    label="بداية الجدول %"
                    value={draft.table.startTop}
                    min={20}
                    max={50}
                    step={0.5}
                    onChange={(v) => {
                        const cap = maxRowHeightPct(v, ATTENDANCE_PAGE_ROWS);
                        updateTable({
                            startTop: v,
                            rowHeight: Math.min(draft.table.rowHeight, cap),
                        });
                    }}
                    light
                />
                <SliderRow
                    label="ارتفاع كل صف %"
                    value={draft.table.rowHeight}
                    min={1.5}
                    max={maxRowHeightPct(draft.table.startTop, ATTENDANCE_PAGE_ROWS)}
                    step={0.05}
                    onChange={(v) =>
                        updateTable({
                            rowHeight: Math.min(
                                v,
                                maxRowHeightPct(draft.table.startTop, ATTENDANCE_PAGE_ROWS)
                            ),
                        })
                    }
                    light
                />
                <p className="text-[10px] font-bold text-indigo-200/90">
                    القالب يتسع لـ {ATTENDANCE_PAGE_ROWS} صف — أقصى ارتفاع صف{' '}
                    {maxRowHeightPct(draft.table.startTop, ATTENDANCE_PAGE_ROWS)}%
                </p>
                <SliderRow
                    label="حجم خط الجدول"
                    value={draft.table.fontSize}
                    min={0.5}
                    max={1.2}
                    step={0.05}
                    onChange={(v) => updateTable({ fontSize: v })}
                    light
                />
                <div className="flex items-center justify-between text-xs font-black">
                    <span>صفوف / صفحة</span>
                    <span className="px-3 py-1 bg-white/20 rounded-lg">
                        {ATTENDANCE_PAGE_ROWS} (ثابت)
                    </span>
                </div>
            </div>

            <button
                type="button"
                onClick={handleReset}
                className="w-full py-3 text-xs font-black text-rose-500 border border-dashed border-rose-200 rounded-2xl hover:bg-rose-50 flex items-center justify-center gap-2"
            >
                <RotateCcw size={14} />
                استعادة الافتراضي
            </button>
        </div>
    );
};

const SliderRow = ({ label, value, min, max, step, onChange, light }) => (
    <div className="space-y-1">
        <div
            className={`flex justify-between text-[10px] font-black ${light ? 'text-indigo-200' : 'text-slate-400'}`}
        >
            <span>{label}</span>
            <span className={light ? 'text-white' : 'text-indigo-600'}>{value}</span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className={light ? 'premium-range-white w-full' : 'premium-range w-full'}
        />
    </div>
);

export default AttendanceLayoutStudio;
