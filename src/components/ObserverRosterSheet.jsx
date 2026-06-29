import React from 'react';
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
  rowAlt: '#f8fafc',
};

const PX_PER_MM = 96 / 25.4;
export const OBSERVER_ROSTER_A4_WIDTH_PX = Math.round(210 * PX_PER_MM);
export const OBSERVER_ROSTER_A4_HEIGHT_PX = Math.round(297 * PX_PER_MM);

const cellBorder = { borderRight: '1px solid #e2e8f0' };
const thBorder = { borderRight: '1px solid rgba(255,255,255,0.25)' };

/**
 * صفحة A4 — كشف ملاحظي (لجنة أو مجمع) — تصميم مدمج مثل كشف اللجان
 */
export default function ObserverRosterSheet({
  page,
  config,
  schoolName = 'المدرسة',
  previewPx,
  embedded = false,
}) {
  if (!page || !config) return null;

  const table = config.table || {};
  const isFullPage = !embedded && !previewPx;
  const pageW = previewPx?.width ?? (isFullPage ? OBSERVER_ROSTER_A4_WIDTH_PX : '210mm');
  const pageH = previewPx?.height ?? (isFullPage ? OBSERVER_ROSTER_A4_HEIGHT_PX : '297mm');
  const scale = typeof pageW === 'number' ? pageW / OBSERVER_ROSTER_A4_WIDTH_PX : 1;
  const pad = embedded ? 6 : isFullPage ? 38 : 14;
  const rowHeightMm = table.rowHeightMm ?? 7.2;
  const fontSize = table.fontSizeRem ?? 0.82;
  const isSummary = page.type === 'summary';
  const title = isSummary
    ? config.summaryTitle || 'الكشف المجمع لملاحظي الاختبار'
    : config.committeeTitle || 'كشف ملاحظي اللجنة';

  const maxRows = isSummary
    ? config.summaryMaxRows || 25
    : config.committeeMaxRows || 20;

  const rows = isSummary
    ? (page.rows || []).map((row, idx) => ({
        key: row.rowKey || `${row.observerId}-${row.committeeId}-${idx}`,
        cells: [
          { col: 'index', value: row.serial },
          { col: 'name', value: row.teacherName },
          { col: 'committee', value: row.committeeNum || row.committee },
          { col: 'signature', value: '' },
        ],
        zebra: idx % 2 === 0,
      }))
    : (page.observers || []).map((name, idx) => ({
        key: `${page.committeeId}-${page.globalStartIndex + idx}`,
        cells: [
          { col: 'index', value: page.globalStartIndex + idx + 1 },
          { col: 'name', value: name },
        ],
        zebra: idx % 2 === 0,
      }));

  const columns = isSummary
    ? [
        { key: 'index', label: 'م', pct: 6 },
        { key: 'name', label: 'اسم المعلم', pct: 38 },
        { key: 'committee', label: 'رقم اللجنة', pct: 18 },
        { key: 'signature', label: config.signatureColumnLabel || 'التوقيع', pct: 38 },
      ]
    : [
        { key: 'index', label: 'م', pct: 10 },
        { key: 'name', label: 'اسم الملاحظ', pct: 90 },
      ];

  const padCount = Math.max(0, maxRows - rows.length);
  const emptyRows = Array.from({ length: padCount });

  const stageLine = isSummary
    ? page.meta?.stage
    : page.sheetStageLabel || page.stageLabel;
  const headerSubtitle = [config.subtitle, stageLine]
    .filter((v) => v && String(v).trim() && v !== '—')
    .join(' · ');

  const metaItems = isSummary
    ? [
        { label: 'المرحلة', value: page.meta?.stage, accent: '#7c3aed' },
        { label: 'المادة', value: page.meta?.subject, accent: BRAND.indigo },
        { label: 'اليوم', value: page.meta?.day, accent: BRAND.navyMid },
        { label: 'التاريخ', value: page.meta?.date, accent: BRAND.gold },
        { label: 'الفترة', value: page.meta?.period, accent: BRAND.navy },
      ]
    : [
        { label: 'المرحلة', value: page.sheetStageLabel || page.stageLabel, accent: '#7c3aed' },
        { label: 'رقم اللجنة', value: page.committeeNumber, accent: BRAND.indigo },
        { label: 'القاعة', value: page.room, accent: BRAND.navyMid },
        { label: 'عدد الملاحظين', value: page.observerCount, accent: BRAND.gold },
      ];

  return (
    <div
      className={`observer-roster-page observer-roster-native font-alexandria ${
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
      data-observer-roster-page={embedded ? undefined : true}
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
        <HeaderBlock
          scale={scale}
          config={config}
          schoolName={schoolName}
          title={title}
          subtitle={headerSubtitle}
        />

        {config.showMetaBox !== false && (
          <table
            dir="rtl"
            style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', direction: 'rtl' }}
          >
            <tbody>
              <tr>
                {metaItems.map((m) => (
                  <MetaCellTd
                    key={m.label}
                    label={m.label}
                    value={m.value}
                    accent={m.accent}
                    scale={scale}
                    colCount={metaItems.length}
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
            {rows.map(({ key, cells, zebra }) => (
              <tr
                key={key}
                style={{
                  height: `${rowHeightMm}mm`,
                  backgroundColor: zebra ? '#ffffff' : BRAND.rowAlt,
                }}
              >
                {columns.map((col, i) => {
                  const cell = cells.find((c) => c.col === col.key);
                  return (
                    <DataTd key={col.key} col={col.key} scale={scale} isLast={i === columns.length - 1}>
                      {cell?.value ?? '—'}
                    </DataTd>
                  );
                })}
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
            managerName={config.managerName || 'محمد نصر الدين '}
            signatureLineLabel={config.signatureLineLabel || 'التوقيع :'}
            stampLabel={config.stampLabel || 'الختم'}
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

function HeaderBlock({ scale, config, schoolName, title, subtitle }) {
  return (
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
        <h2 style={{ margin: 0, fontSize: 13 * scale, fontWeight: 900 }}>{title}</h2>
      </div>
      {subtitle ? (
        <p style={{ margin: `${8 * scale}px 0 0`, fontSize: 11 * scale, fontWeight: 700, color: BRAND.slate }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function ManagerSignatureFooter({
  scale,
  layout,
  managerTitle,
  managerName,
  signatureLineLabel,
  stampLabel,
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
        backgroundColor: '#ffffff',
        borderTop: `1px solid ${BRAND.navyMid}`,
        width: '100%',
        boxSizing: 'border-box',
        direction: 'ltr',
      }}
    >
      {fields.map(({ key, text, layout: fieldLayout }) => (
        <p key={key} style={managerFooterFieldStyle(fieldLayout, key, scale)}>
          {text}
        </p>
      ))}
    </div>
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

function DataTd({ children, col, scale, isLast }) {
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
          {children}
        </span>
      </td>
    );
  }

  if (col === 'committee') {
    return (
      <td style={{ ...base, textAlign: 'center', fontWeight: 900, color: BRAND.indigo, fontFamily: 'monospace' }}>
        {children}
      </td>
    );
  }

  if (col === 'signature') {
    return (
      <td
        style={{
          ...base,
          textAlign: 'center',
          padding: `0 ${6 * scale}px`,
          verticalAlign: 'middle',
        }}
        aria-label="التوقيع"
      >
        <span
          style={{
            display: 'block',
            width: '88%',
            margin: '0 auto',
            borderBottom: `1px solid ${BRAND.slate}`,
            minHeight: 14 * scale,
          }}
        />
      </td>
    );
  }

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
      title={String(children ?? '')}
    >
      {children}
    </td>
  );
}

function MetaCellTd({ label, value, accent, scale, colCount = 3 }) {
  const widthPct = `${100 / colCount}%`;

  return (
    <td
      style={{
        width: widthPct,
        padding: `${8 * scale}px`,
        verticalAlign: 'top',
        borderBottom: `1px solid ${BRAND.navyMid}`,
      }}
    >
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
          title={String(value ?? '')}
        >
          {value ?? '—'}
        </div>
      </div>
    </td>
  );
}
