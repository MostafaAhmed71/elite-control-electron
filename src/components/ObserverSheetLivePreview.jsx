import React, { useEffect, useState } from 'react';
import {
    buildObserverSheetPages,
    buildObserverSummaryMeta,
    buildObserverSummaryRows,
    renderObserverSheetToCanvas,
    renderObserverSummaryToCanvas,
    resolveObserverSheetLayout,
} from '../utils/observerSheetTemplates';

/**
 * معاينة مرئية على القالب ببيانات حقيقية (canvas → صورة)
 */
const ObserverSheetLivePreview = ({
    mode,
    stageId,
    appConfig,
    committees,
    observers,
    assignments,
    filters,
    committeeIndex = 0,
    className = '',
    maxWidth = 320,
}) => {
    const [src, setSrc] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            setBusy(true);
            setError('');
            try {
                const layout = resolveObserverSheetLayout(appConfig, stageId);

                if (mode === 'summary') {
                    const metaData = buildObserverSummaryMeta(appConfig, stageId, filters);
                    const rows = buildObserverSummaryRows(
                        committees,
                        observers,
                        assignments,
                        stageId
                    );
                    const maxPerPage = layout.summary?.table?.maxRowsPerPage ?? 28;
                    const slice = rows.slice(0, maxPerPage);
                    const canvas = await renderObserverSummaryToCanvas(
                        metaData,
                        slice,
                        layout.summary,
                        stageId
                    );
                    if (!cancelled) setSrc(canvas.toDataURL('image/jpeg', 0.88));
                    return;
                }

                const pages = buildObserverSheetPages(
                    committees,
                    observers,
                    assignments,
                    stageId
                );
                const page =
                    pages[committeeIndex] ||
                    pages.find((p) => p.observers?.length) ||
                    pages[0];
                if (!page) {
                    if (!cancelled) setError('لا توجد لجان لهذه المرحلة');
                    return;
                }
                const canvas = await renderObserverSheetToCanvas(page, layout, stageId);
                if (!cancelled) setSrc(canvas.toDataURL('image/jpeg', 0.88));
            } catch (e) {
                console.error(e);
                if (!cancelled) setError(e.message || 'تعذّر المعاينة');
            } finally {
                if (!cancelled) setBusy(false);
            }
        };

        if (appConfig && stageId) run();
        return () => {
            cancelled = true;
        };
    }, [
        mode,
        stageId,
        appConfig,
        appConfig?.observerSheets,
        committees,
        observers,
        assignments,
        filters?.period,
        filters?.day,
        committeeIndex,
    ]);

    if (busy) {
        return (
            <div
                className={`flex items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-400 text-xs font-bold ${className}`}
                style={{ minHeight: 200, maxWidth }}
            >
                جاري تحميل المعاينة...
            </div>
        );
    }

    if (error) {
        return (
            <div
                className={`flex items-center justify-center rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs font-bold p-4 text-center ${className}`}
                style={{ minHeight: 120, maxWidth }}
            >
                {error}
            </div>
        );
    }

    return (
        <img
            src={src}
            alt="معاينة كشف الملاحظين"
            className={`rounded-xl border border-slate-200 shadow-lg w-full h-auto ${className}`}
            style={{ maxWidth }}
            draggable={false}
        />
    );
};

export default ObserverSheetLivePreview;
