import React from 'react';
import { SlidersHorizontal, X, RotateCcw } from 'lucide-react';
import { ROSTER_COLUMNS_RTL } from '../utils/committeeRosterColumns';
import {
  MANAGER_FOOTER_FIELD_DEFS,
  mergeManagerFooterLayout,
} from '../utils/committeeRosterManagerFooter';

const TABLE_COLS = ROSTER_COLUMNS_RTL;

export default function CommitteeRosterSettingsPanel({
  config,
  handleConfigChange,
  resetConfig,
  onClose,
}) {
  const table = config.table || {};
  const managerFooter = mergeManagerFooterLayout(config.managerFooter);

  const setRoot = (prop, value) => handleConfigChange(prop, null, value);

  return (
    <div className="luxury-card p-6 md:p-8 bg-white border-none print:hidden relative overflow-hidden">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-violet-50 rounded-2xl flex items-center justify-center text-violet-600 border border-violet-100">
            <SlidersHorizontal size={22} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 font-header">ضبط القالب المدمج</h3>
            <p className="text-slate-400 font-bold text-xs mt-0.5">
              قالب HTML رسمي — يُحفظ تلقائياً
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-black text-slate-500">صفوف/صفحة</label>
          <input
            type="number"
            min={1}
            max={40}
            value={config.maxRows ?? 25}
            onChange={(e) => handleConfigChange('maxRows', null, e.target.value)}
            className="w-14 bg-slate-50 border border-slate-200 rounded-lg text-center font-black text-violet-600 outline-none"
          />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-xl"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <label className="block text-[10px] font-black text-slate-400 uppercase">عنوان الكشف</label>
        <input
          type="text"
          value={config.title || ''}
          onChange={(e) => setRoot('title', e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 font-black text-sm"
        />
        <input
          type="text"
          value={config.subtitle || ''}
          onChange={(e) => setRoot('subtitle', e.target.value)}
          placeholder="عنوان فرعي (اختياري)"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-sm text-slate-600"
        />
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { key: 'showMinistryLine', label: 'سطر الوزارة' },
          { key: 'showSchoolName', label: 'اسم المدرسة' },
          { key: 'showMetaBox', label: 'صندوق بيانات اللجنة' },
          { key: 'showManagerSignature', label: 'بيانات المدير والختم' },
        ].map(({ key, label }) => (
          <ToggleChip
            key={key}
            label={label}
            on={config[key] !== false}
            onToggle={() => handleConfigChange(key, null, null, config[key] === false)}
          />
        ))}
      </div>

      {config.showManagerSignature !== false && (
        <div className="space-y-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 mb-6">
          <h4 className="text-sm font-black text-amber-900">نصوص ومواضع المدير (أسفل الكشف)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-[10px] font-black text-slate-500">
              نص «مدير المدرسة»
              <input
                type="text"
                value={config.managerTitle || ''}
                onChange={(e) => setRoot('managerTitle', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-amber-200 font-bold text-sm"
              />
            </label>
            <label className="block text-[10px] font-black text-slate-500">
              اسم المدير (بدون «الاسم :»)
              <input
                type="text"
                value={config.managerName || ''}
                onChange={(e) => setRoot('managerName', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-amber-200 font-bold text-sm"
              />
            </label>
            <label className="block text-[10px] font-black text-slate-500">
              نص التوقيع
              <input
                type="text"
                value={config.signatureLineLabel || ''}
                onChange={(e) => setRoot('signatureLineLabel', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-amber-200 font-bold text-sm"
              />
            </label>
            <label className="block text-[10px] font-black text-slate-500">
              نص الختم
              <input
                type="text"
                value={config.stampLabel || ''}
                onChange={(e) => setRoot('stampLabel', e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-amber-200 font-bold text-sm"
              />
            </label>
          </div>
          <SliderRow
            label="ارتفاع منطقة المدير"
            value={managerFooter.heightMm ?? 30}
            min={22}
            max={50}
            step={1}
            suffix="mm"
            onChange={(v) => handleConfigChange('managerFooter', 'heightMm', null, v)}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {MANAGER_FOOTER_FIELD_DEFS.map((def) => {
              const f = managerFooter[def.key] || {};
              return (
                <div
                  key={def.key}
                  className="p-4 rounded-2xl border border-amber-100 bg-white space-y-2"
                >
                  <span className="text-xs font-black text-amber-900">{def.label}</span>
                  <SliderRow
                    label="من الأعلى"
                    value={f.topPct ?? 0}
                    min={0}
                    max={85}
                    step={1}
                    suffix="%"
                    onChange={(v) => handleConfigChange('managerFooter', def.key, 'topPct', v)}
                  />
                  {def.useRight ? (
                    <SliderRow
                      label="من اليمين"
                      value={f.rightPct ?? 0}
                      min={0}
                      max={90}
                      step={1}
                      suffix="%"
                      onChange={(v) => handleConfigChange('managerFooter', def.key, 'rightPct', v)}
                    />
                  ) : (
                    <SliderRow
                      label="من اليسار"
                      value={f.leftPct ?? 0}
                      min={0}
                      max={90}
                      step={1}
                      suffix="%"
                      onChange={(v) => handleConfigChange('managerFooter', def.key, 'leftPct', v)}
                    />
                  )}
                  {def.hasWidth && (
                    <SliderRow
                      label="عرض النص"
                      value={f.widthPct ?? 40}
                      min={15}
                      max={80}
                      step={1}
                      suffix="%"
                      onChange={(v) => handleConfigChange('managerFooter', def.key, 'widthPct', v)}
                    />
                  )}
                  <SliderRow
                    label="حجم الخط"
                    value={f.fontSizeRem ?? 0.62}
                    min={0.5}
                    max={1}
                    step={0.02}
                    suffix="rem"
                    onChange={(v) => handleConfigChange('managerFooter', def.key, 'fontSizeRem', v)}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[10px] font-bold text-amber-800/80">
            حرّك كل عنصر بمؤشر «من الأعلى» و«من اليسار/اليمين» — التغيير يظهر فوراً في المعاينة.
          </p>
        </div>
      )}

      <div className="space-y-4 p-4 bg-violet-50 rounded-2xl border border-violet-100 mb-6">
        <SliderRow
          label="حجم خط الجدول"
          value={table.fontSizeRem ?? 0.82}
          min={0.6}
          max={1.2}
          step={0.02}
          suffix="rem"
          onChange={(v) => handleConfigChange('table', 'fontSizeRem', v)}
        />
        <SliderRow
          label="حجم خط رأس الكشف"
          value={table.headerFontSizeRem ?? 0.88}
          min={0.7}
          max={1.2}
          step={0.02}
          suffix="rem"
          onChange={(v) => handleConfigChange('table', 'headerFontSizeRem', v)}
        />
        <SliderRow
          label="ارتفاع الصف"
          value={table.rowHeightMm ?? 7.2}
          min={5}
          max={12}
          step={0.2}
          suffix="mm"
          onChange={(v) => handleConfigChange('table', 'rowHeightMm', v)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TABLE_COLS.map((col) => (
          <div key={col.key} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-slate-700">{col.label}</span>
              <ToggleChip
                label="إظهار"
                on={table[col.showKey] !== false}
                onToggle={() =>
                  handleConfigChange('table', col.showKey, null, table[col.showKey] === false)
                }
                small
              />
            </div>
            <SliderRow
              label="عرض العمود (من اليمين)"
              value={table[col.widthKey] ?? col.defaultPct}
              min={5}
              max={60}
              step={1}
              suffix="%"
              disabled={table[col.showKey] === false}
              onChange={(v) => handleConfigChange('table', col.widthKey, v)}
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={resetConfig}
          className="text-xs font-black text-rose-500 hover:text-rose-700 px-4 py-2 rounded-xl border border-dashed border-rose-200 flex items-center gap-2"
        >
          <RotateCcw size={14} />
          إعادة القالب الافتراضي
        </button>
      </div>

      <style>{`
        .premium-range-roster {
          -webkit-appearance: none;
          width: 100%;
          height: 5px;
          background: #e2e8f0;
          border-radius: 5px;
          outline: none;
        }
        .premium-range-roster::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          background: #7c3aed;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid white;
        }
      `}</style>
    </div>
  );
}

function ToggleChip({ label, on, onToggle, small }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${small ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-2'} rounded-xl font-black border transition-colors ${
        on ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-500 border-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function SliderRow({ label, value, min, max, step, suffix, onChange, disabled }) {
  return (
    <div className={`space-y-1 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
      <div className="flex justify-between text-[10px] font-black">
        <span className="text-slate-500">{label}</span>
        <span className="text-violet-600">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="premium-range-roster"
      />
    </div>
  );
}
