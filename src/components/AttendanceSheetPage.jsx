import React from 'react';
import {
    ATTENDANCE_TEMPLATE,
    EXAM_META_HEADER_KEYS,
    formatCommitteeDisplay,
    getRowShift,
    mergeSheetMeta,
} from '../utils/attendanceLayout';

const BOLD_TEXT = { fontWeight: 900, fontFamily: 'Tahoma, Arial, sans-serif' };
const EXAM_META_BOLD = {
    fontWeight: 900,
    fontFamily: 'Tahoma, Arial, sans-serif',
    letterSpacing: '0.02em',
};

const headerTextStyle = (key) =>
    EXAM_META_HEADER_KEYS.includes(key) ? EXAM_META_BOLD : BOLD_TEXT;

/**
 * صفحة A4: قالب + صف واحد لكل طالب (م | اسم | جلوس | صف)
 */
const AttendanceSheetPage = ({
    page,
    config,
    previewPx,
    embedded = false,
    /** في الاستوديو: عرض صف واحد عند موضع هذا الرقم (0–24) */
    focusRowIdx = null,
}) => {
    if (!config || !page) return null;

    const table = config.table;
    const sheetMeta = mergeSheetMeta(config?.sheetMetaPreview, page?.sheetMeta) || {};
    const studentRows =
        focusRowIdx != null && page.students?.length
            ? [{ student: page.students[0], idx: focusRowIdx }]
            : page.students.map((student, idx) => ({ student, idx }));
    const pageW = previewPx?.width ?? '210mm';
    const pageH = previewPx?.height ?? '297mm';

    return (
        <div
            className={`relative bg-white overflow-hidden ${
                embedded
                    ? ''
                    : 'page-to-print mx-auto border border-white shadow-[0_30px_90px_rgba(0,0,0,0.15)] transition-all duration-700 print:shadow-none print:border-none print:m-0'
            }`}
            style={{
                width: pageW,
                height: pageH,
                pageBreakAfter: embedded ? 'auto' : 'always',
            }}
        >
            <img
                src={ATTENDANCE_TEMPLATE}
                alt="قالب كشف التوقيع"
                crossOrigin="anonymous"
                className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
                draggable={false}
            />

            {config.headerSubject?.show && (
                <div
                    className={`absolute font-black text-slate-900 text-center z-10 leading-none${embedded ? ' pointer-events-none' : ''}`}
                    style={{
                        top: `${config.headerSubject.top}%`,
                        right: `${config.headerSubject.right}%`,
                        fontSize: `${config.headerSubject.fontSize}rem`,
                        transform: 'translateY(-50%) translateX(50%)',
                        ...headerTextStyle('headerSubject'),
                    }}
                >
                    {sheetMeta.subject ?? '—'}
                </div>
            )}
            {config.headerDay?.show && (
                <div
                    className={`absolute font-black text-slate-900 text-center z-10 leading-none${embedded ? ' pointer-events-none' : ''}`}
                    style={{
                        top: `${config.headerDay.top}%`,
                        right: `${config.headerDay.right}%`,
                        fontSize: `${config.headerDay.fontSize}rem`,
                        transform: 'translateY(-50%) translateX(50%)',
                        ...headerTextStyle('headerDay'),
                    }}
                >
                    {sheetMeta.day ?? '—'}
                </div>
            )}
            {config.headerDate?.show && (
                <div
                    className={`absolute font-black text-slate-900 text-center z-10 leading-none${embedded ? ' pointer-events-none' : ''}`}
                    style={{
                        top: `${config.headerDate.top}%`,
                        right: `${config.headerDate.right}%`,
                        fontSize: `${config.headerDate.fontSize}rem`,
                        transform: 'translateY(-50%) translateX(50%)',
                        ...headerTextStyle('headerDate'),
                    }}
                >
                    {sheetMeta.date ?? '—'}
                </div>
            )}
            {config.headerPeriod?.show && (
                <div
                    className={`absolute font-black text-slate-900 text-center z-10 leading-none${embedded ? ' pointer-events-none' : ''}`}
                    style={{
                        top: `${config.headerPeriod.top}%`,
                        right: `${config.headerPeriod.right}%`,
                        fontSize: `${config.headerPeriod.fontSize}rem`,
                        transform: 'translateY(-50%) translateX(50%)',
                        ...headerTextStyle('headerPeriod'),
                    }}
                >
                    {sheetMeta.periodLabel ?? '—'}
                </div>
            )}
            {config.headerCommittee?.show && (
                <div
                    className={`absolute font-black text-slate-900 text-right font-header z-10 leading-none${embedded ? ' pointer-events-none' : ''}`}
                    style={{
                        top: `${config.headerCommittee.top}%`,
                        right: `${config.headerCommittee.right}%`,
                        fontSize: `${config.headerCommittee.fontSize}rem`,
                        transform: 'translateY(-50%)',
                        ...BOLD_TEXT,
                    }}
                >
                    {formatCommitteeDisplay(page.committee)}
                </div>
            )}
            {config.headerGrade?.show && (
                <div
                    className={`absolute font-black text-slate-900 text-center font-header z-10 leading-none${embedded ? ' pointer-events-none' : ''}`}
                    style={{
                        top: `${config.headerGrade.top}%`,
                        right: `${config.headerGrade.right}%`,
                        fontSize: `${config.headerGrade.fontSize}rem`,
                        transform: 'translateY(-50%) translateX(50%)',
                        ...BOLD_TEXT,
                    }}
                >
                    {page.grade}
                </div>
            )}
            {config.headerCount?.show && (
                <div
                    className={`absolute font-black text-slate-900 text-center font-header z-10 leading-none${embedded ? ' pointer-events-none' : ''}`}
                    style={{
                        top: `${config.headerCount.top}%`,
                        right: `${config.headerCount.right}%`,
                        fontSize: `${config.headerCount.fontSize}rem`,
                        transform: 'translateY(-50%) translateX(50%)',
                        ...BOLD_TEXT,
                    }}
                >
                    {page.totalCount}
                </div>
            )}

            {studentRows.map(({ student, idx }) => {
                const shift = getRowShift(config, idx);
                const rowBase =
                    table.startTop + idx * table.rowHeight + (shift.top || 0);
                const fontSize = table.fontSize + (shift.fontSize || 0);
                const fs = `${fontSize}rem`;
                const cellTop = (colTop) => `${rowBase + (colTop || 0)}%`;

                return (
                    <React.Fragment key={student.id ?? `row-${idx}`}>
                        {table.indexShow && (
                            <div
                                className={`absolute z-10 text-center whitespace-nowrap font-black text-slate-900 leading-none${embedded ? ' pointer-events-none' : ''}`}
                                style={{
                                    top: cellTop(table.indexTop),
                                    right: `${table.indexRight}%`,
                                    fontSize: fs,
                                    transform: 'translate(50%, -50%)',
                                    ...BOLD_TEXT,
                                }}
                            >
                                {page.globalStartIndex + idx + 1}
                            </div>
                        )}
                        {table.nameShow && (
                            <div
                                className={`absolute z-10 text-right whitespace-nowrap font-black text-slate-900 leading-none${embedded ? ' pointer-events-none' : ''}`}
                                style={{
                                    top: cellTop(table.nameTop),
                                    right: `${table.nameRight}%`,
                                    maxWidth: `${table.nameWidthPct ?? 38}%`,
                                    fontSize: fs,
                                    transform: 'translateY(-50%)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    ...BOLD_TEXT,
                                }}
                                title={student.name}
                            >
                                {student.name || '—'}
                            </div>
                        )}
                        {table.seatShow && (
                            <div
                                className={`absolute z-10 text-center whitespace-nowrap font-black text-slate-900 leading-none${embedded ? ' pointer-events-none' : ''}`}
                                style={{
                                    top: cellTop(table.seatTop),
                                    right: `${table.seatRight}%`,
                                    fontSize: fs,
                                    transform: 'translate(50%, -50%)',
                                    ...BOLD_TEXT,
                                }}
                            >
                                {student.seatNumber || '—'}
                            </div>
                        )}
                        {table.gradeShow && (
                            <div
                                className={`absolute z-10 text-center whitespace-nowrap font-black text-slate-900 leading-none${embedded ? ' pointer-events-none' : ''}`}
                                style={{
                                    top: cellTop(table.gradeTop),
                                    right: `${table.gradeRight}%`,
                                    fontSize: fs,
                                    transform: 'translate(50%, -50%)',
                                    ...BOLD_TEXT,
                                }}
                            >
                                {student.grade || '—'}
                            </div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default AttendanceSheetPage;
