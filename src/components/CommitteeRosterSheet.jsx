import React from 'react';
import {
  getRosterStudentField,
  getVisibleRosterColumns,
  ROSTER_META_RTL,
} from '../utils/committeeRosterColumns';
import {
  mergeManagerFooterLayout,
  managerFooterFieldStyle,
} from '../utils/committeeRosterManagerFooter';
const BRAND = {
  navy: '#0f2744',
  navyMid: '#1a3a5c',
  indigo: '#3730a3',
  gold: '#b8860b',
  slate: '#64748b',
  headerBg: '#f1f5f9',
  rowAlt: '#f8fafc',
};

const META_ACCENTS = {
  committee: '#3730a3',
  grade: '#1a3a5c',
  count: '#b8860b',
};

const PX_PER_MM = 96 / 25.4;
export const ROSTER_A4_WIDTH_PX = Math.round(210 * PX_PER_MM);
export const ROSTER_A4_HEIGHT_PX = Math.round(297 * PX_PER_MM);

const cellBorder = { borderRight: '1px solid #e2e8f0' };
const thBorder = { borderRight: '1px solid rgba(255,255,255,0.25)' };

/**
 * صفحة A4 — قالب RTL (يمين → يسار)
 */
export default function CommitteeRosterSheet({
  page,
  config,
  schoolName = 'المدرسة',
  previewPx,
  embedded = false,
  highlightRowIdx = null,
  showManagerLayoutGuides = false,
}) {
  if (!page || !config) return null;

  const table = config.table || {};
  const isFullPage = !embedded && !previewPx;
  const pageW = previewPx?.width ?? (isFullPage ? ROSTER_A4_WIDTH_PX : '210mm');
  const pageH = previewPx?.height ?? (isFullPage ? ROSTER_A4_HEIGHT_PX : '297mm');
  const maxRows = config.maxRows || 25;
  const students = page.students || [];
  const rowHeightMm = table.rowHeightMm ?? 7.2;
  const fontSize = table.fontSizeRem ?? 0.82;

  const columns = getVisibleRosterColumns(table);
  const padCount = Math.max(0, maxRows - students.length);
  const emptyRows = embedded && highlightRowIdx != null ? [] : Array.from({ length: padCount });

  const rows = students.map((student, idx) => ({
    student,
    idx,
    serial: page.globalStartIndex + idx + 1,
    highlight: highlightRowIdx === idx,
    zebra: idx % 2 === 0,
  }));

  const pad = embedded ? 6 : isFullPage ? 38 : 14;
  const scale = typeof pageW === 'number' ? pageW / ROSTER_A4_WIDTH_PX : 1;
  return (
    <div
      className={`committee-roster-page committee-roster-native font-alexandria ${
        embedded ? '' : 'page-to-print mx-auto print:m-0'
      }`}
      style={{
        width: pageW,
        height: pageH,
        pageBreakAfter: embedded ? 'auto' : 'always',
        padding: pad,
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
        direction: 'rtl',
        unicodeBidi: 'isolate',
        textAlign: 'right',
        position: 'relative',
        overflow: embedded ? 'visible' : 'hidden',
        minHeight: embedded ? undefined : pageH,
      }}
      data-committee-roster-page={embedded ? undefined : true}
      dir="rtl"
      lang="ar"
    >
      <div style={{ height: 4 * scale, backgroundColor: BRAND.gold }} />

      <div
        dir="rtl"
        style={{
          border: `2px solid ${BRAND.navy}`,
          borderTop: 'none',
          backgroundColor: '#ffffff',
          height: embedded ? 'auto' : `calc(100% - ${6 * scale}px)`,
          boxSizing: 'border-box',
          direction: 'rtl',
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            borderBottom: `2px solid ${BRAND.navy}`,
            padding: `${12 * scale}px ${16 * scale}px ${10 * scale}px`,
            textAlign: 'center',
            direction: 'rtl',
          }}
        >
          {config.showMinistryLine !== false && (
            <p style={{ margin: `0 0 ${8 * scale}px`, fontSize: 11 * scale, fontWeight: 700, color: BRAND.slate }}>
              وزارة التعليم · إدارة التعليم
            </p>
          )}
          {config.showSchoolName !== false && (
            <h1 style={{ margin: `0 0 ${6 * scale}px`, fontSize: 18 * scale, fontWeight: 900, color: BRAND.navy }}>
              {schoolName}
            </h1>
          )}
          <div
            style={{
              display: 'inline-block',
              backgroundColor: BRAND.indigo,
              color: '#ffffff',
              padding: `${6 * scale}px ${20 * scale}px`,
              borderRadius: 20 * scale,
              marginTop: 4 * scale,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 13 * scale, fontWeight: 900 }}>
              {config.title || 'كشف توزيع الطلاب على لجان الاختبار'}
            </h2>
          </div>
          {config.subtitle && (
            <p style={{ margin: `${8 * scale}px 0 0`, fontSize: 11 * scale, fontWeight: 700, color: BRAND.slate }}>
              {config.subtitle}
            </p>
          )}
        </div>

        {config.showMetaBox !== false && (
          <table
            dir="rtl"
            style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', direction: 'rtl' }}
          >
            <tbody>
              <tr>
                {ROSTER_META_RTL.map((m) => (
                  <MetaCellTd
                    key={m.key}
                    label={m.label}
                    value={m.getValue(page)}
                    accent={META_ACCENTS[m.key]}
                    scale={scale}
                  />
                ))}
              </tr>
            </tbody>
          </table>
        )}

        <table
          dir="rtl"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            fontSize: `${fontSize * scale}rem`,
            marginTop: 4 * scale,
            direction: 'rtl',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: BRAND.navy, color: '#ffffff' }}>
              {columns.map((col, i) => (
                <Th key={col.key} pct={col.pct} scale={scale} isLast={i === columns.length - 1}>
                  {col.label}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ student, serial, highlight, zebra }) => (
              <tr
                key={student.id || serial}
                style={{
                  height: `${rowHeightMm}mm`,
                  backgroundColor: highlight ? '#ede9fe' : zebra ? '#ffffff' : BRAND.rowAlt,
                }}
              >
                {columns.map((col, i) => (
                  <Td
                    key={col.key}
                    col={col.key}
                    scale={scale}
                    isLast={i === columns.length - 1}
                    student={student}
                    serial={serial}
                  />
                ))}
              </tr>
            ))}
            {emptyRows.map((_, i) => (
              <tr
                key={`e-${i}`}
                style={{ height: `${rowHeightMm}mm`, backgroundColor: i % 2 ? BRAND.rowAlt : '#fff' }}
              >
                {columns.map((col, ci) => (
                  <td
                    key={col.key}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      ...(ci < columns.length - 1 ? cellBorder : {}),
                    }}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {config.showManagerSignature !== false && (
          <ManagerSignatureFooter
            scale={scale}
            layout={mergeManagerFooterLayout(config.managerFooter)}
            managerTitle={config.managerTitle || 'مدير المدرسة'}
            managerName={config.managerName || 'محمد نصر الدين مصطفي'}
            signatureLineLabel={config.signatureLineLabel || 'التوقيع :'}
            stampLabel={config.stampLabel || 'الختم'}
            showGuides={showManagerLayoutGuides}
          />
        )}

        {page.totalPages > 1 && (
          <div
            dir="rtl"
            style={{
              borderTop: `1px solid ${BRAND.navyMid}`,
              backgroundColor: BRAND.rowAlt,
              padding: `${6 * scale}px ${12 * scale}px`,
              textAlign: 'center',
              width: '100%',
              fontSize: 9 * scale,
              fontWeight: 700,
              color: BRAND.navy,
              direction: 'rtl',
            }}
          >
            صفحة {page.pageIndex} من {page.totalPages}
          </div>
        )}
      </div>

      <div style={{ height: 3 * scale, backgroundColor: BRAND.indigo }} />
    </div>
  );
}

const MANAGER_FIELD_GUIDE_LABELS = {
  managerTitle: 'مدير المدرسة',
  managerName: 'الاسم',
  signatureLine: 'التوقيع',
  stamp: 'الختم',
};

function ManagerSignatureFooter({
  scale,
  layout,
  managerTitle,
  managerName,
  signatureLineLabel,
  stampLabel,
  showGuides = false,
}) {
  const heightMm = layout.heightMm ?? 30;
  const fields = [
    { key: 'managerTitle', text: managerTitle, layout: layout.managerTitle },
    { key: 'managerName', text: `الاسم : ${managerName}`, layout: layout.managerName },
    { key: 'signatureLine', text: signatureLineLabel, layout: layout.signatureLine },
    { key: 'stamp', text: stampLabel, layout: layout.stamp },
  ];

  return (
    <div
      style={{
        position: 'relative',
        height: `${heightMm}mm`,
        backgroundColor: showGuides ? '#fffbeb' : '#ffffff',
        borderTop: `1px solid ${BRAND.navyMid}`,
        width: '100%',
        boxSizing: 'border-box',
        direction: 'ltr',
      }}
    >
      {showGuides && (
        <div
          style={{
            position: 'absolute',
            top: 4 * scale,
            left: 8 * scale,
            fontSize: 8 * scale,
            fontWeight: 800,
            color: '#b45309',
            zIndex: 5,
          }}
        >
          منطقة المدير
        </div>
      )}
      {fields.map(({ key, text, layout: fieldLayout }) =>
        showGuides ? (
          <span
            key={key}
            style={{
              ...managerFooterFieldStyle(fieldLayout, key, scale),
              display: 'inline-block',
              padding: '2px 6px',
              border: '1px dashed #f59e0b',
              borderRadius: 4,
              backgroundColor: 'rgba(255,251,235,0.95)',
              boxSizing: 'border-box',
              zIndex: 2,
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: 7 * scale,
                fontWeight: 800,
                color: '#b45309',
                marginBottom: 1,
              }}
            >
              {MANAGER_FIELD_GUIDE_LABELS[key]}
            </span>
            {text}
          </span>
        ) : (
          <p key={key} style={managerFooterFieldStyle(fieldLayout, key, scale)}>
            {text}
          </p>
        )
      )}
    </div>
  );
}

/** معاينة مكبّرة لمنطقة المدير فقط — ستوديو الضبط */
export function ManagerFooterPreviewOnly({ config, width = 420 }) {
  const scale = width / ROSTER_A4_WIDTH_PX;
  if (config?.showManagerSignature === false) {
    return (
      <p className="text-center text-xs font-bold text-amber-800 py-4">
        فعّل «بيانات المدير والختم» من لوحة الضبط
      </p>
    );
  }
  return (
    <ManagerSignatureFooter
      scale={scale * 1.15}
      layout={mergeManagerFooterLayout(config.managerFooter)}
      managerTitle={config.managerTitle || 'مدير المدرسة'}
      managerName={config.managerName || 'محمد نصر الدين مصطفي'}
      signatureLineLabel={config.signatureLineLabel || 'التوقيع :'}
      stampLabel={config.stampLabel || 'الختم'}
      showGuides
    />
  );
}

function Th({ children, pct, scale, isLast }) {
  return (
    <th
      style={{
        width: `${pct}%`,
        padding: `${8 * scale}px 4px`,
        fontWeight: 900,
        textAlign: 'center',
        ...(isLast ? {} : thBorder),
      }}
    >
      {children}
    </th>
  );
}

function Td({ col, scale, isLast, student, serial }) {
  const base = {
    borderBottom: '1px solid #e2e8f0',
    verticalAlign: 'middle',
    ...(isLast ? {} : cellBorder),
  };

  if (col === 'index') {
    return (
      <td style={{ ...base, textAlign: 'center', fontWeight: 900, color: BRAND.navy }}>
        <span
          style={{
            display: 'inline-block',
            minWidth: 22 * scale,
            padding: '2px 6px',
            borderRadius: 12,
            backgroundColor: '#e0e7ff',
          }}
        >
          {serial}
        </span>
      </td>
    );
  }
  if (col === 'name') {
    return (
      <td
        style={{
          ...base,
          textAlign: 'right',
          padding: `0 ${10 * scale}px 0 ${6 * scale}px`,
          fontWeight: 700,
          color: BRAND.navy,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          unicodeBidi: 'plaintext',
        }}
        title={student.name}
      >
        {student.name || '—'}
      </td>
    );
  }
  if (col === 'seat') {
    const seat = getRosterStudentField(student, 'seat');
    return (
      <td style={{ ...base, textAlign: 'center', fontWeight: 900, color: BRAND.indigo, fontFamily: 'monospace' }}>
        {seat}
      </td>
    );
  }
  if (col === 'grade') {
    return (
      <td style={{ ...base, textAlign: 'center', fontWeight: 800, color: BRAND.navyMid }}>
        {getRosterStudentField(student, 'grade')}
      </td>
    );
  }
  if (col === 'notes') {
    const notes = getRosterStudentField(student, 'notes');
    return (
      <td
        style={{
          ...base,
          textAlign: 'right',
          padding: `0 ${8 * scale}px`,
          fontWeight: 600,
          color: BRAND.slate,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={notes || undefined}
      >
        {notes || '\u00A0'}
      </td>
    );
  }
  return <td style={base}>&nbsp;</td>;
}

function MetaCellTd({ label, value, accent, scale }) {
  return (
    <td style={{ width: '33.33%', padding: `${8 * scale}px`, verticalAlign: 'top', borderBottom: `1px solid ${BRAND.navyMid}` }}>
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderTop: `3px solid ${accent}`,
          borderRadius: 6,
          padding: `${6 * scale}px`,
          textAlign: 'center',
          direction: 'rtl',
        }}
      >
        <div style={{ fontSize: 10 * scale, fontWeight: 900, color: BRAND.slate, marginBottom: 4 }}>{label}</div>
        <div
          style={{
            fontSize: 13 * scale,
            fontWeight: 900,
            color: BRAND.navy,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            unicodeBidi: 'plaintext',
          }}
          title={value}
        >
          {value}
        </div>
      </div>
    </td>
  );
}
