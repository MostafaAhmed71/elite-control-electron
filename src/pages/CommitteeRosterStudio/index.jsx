import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  Layout,
  Printer,
  SlidersHorizontal,
  Eye,
} from 'lucide-react';
import { getStudents, getCommittees, getAppSettings } from '../../utils/dataService';
import { COMMITTEE_STAGES, gradesForStage } from '../../utils/committeeUtils';
import {
  buildAllCommitteeRosterPages,
  resolveRosterSchoolName,
} from '../../utils/committeeRosterPrint';
import { useCommitteeRosterConfig } from '../../hooks/useCommitteeRosterConfig';
import CommitteeRosterSettingsPanel from '../../components/CommitteeRosterSettingsPanel';
import CommitteeRosterSheet, { ManagerFooterPreviewOnly } from '../../components/CommitteeRosterSheet';

const SAMPLE_STUDENTS = Array.from({ length: 8 }, (_, i) => ({
  id: `sample-${i}`,
  name: `طالب تجريبي ${i + 1}`,
  grade: 'الأول الثانوي',
}));

const SAMPLE_PAGE = {
  id: 'sample-0',
  committeeNumber: '101',
  grade: 'الأول الثانوي',
  totalCount: 8,
  pageIndex: 1,
  totalPages: 1,
  globalStartIndex: 0,
  students: SAMPLE_STUDENTS,
};

const PREVIEW_W = 420;

export default function CommitteeRosterStudio() {
  const navigate = useNavigate();
  const location = useLocation();
  const initial = location.state?.filters || {};

  const [committees, setCommittees] = useState([]);
  const [students, setStudents] = useState([]);
  const [appConfig, setAppConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState(initial.stage || 'الكل');
  const [selectedGrade, setSelectedGrade] = useState(initial.grade || 'الكل');
  const [selectedCommittee, setSelectedCommittee] = useState(initial.committeeId || 'الكل');
  const [showSettings, setShowSettings] = useState(true);

  const { config, handleConfigChange, resetConfig } = useCommitteeRosterConfig();
  const schoolName = resolveRosterSchoolName(appConfig);

  useEffect(() => {
    const load = async () => {
      const [cData, sData, settings] = await Promise.all([
        getCommittees(),
        getStudents(),
        getAppSettings(),
      ]);
      setCommittees(cData);
      setStudents(sData);
      setAppConfig(settings);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    setSelectedGrade('الكل');
    setSelectedCommittee('الكل');
  }, [selectedStage]);

  useEffect(() => {
    setSelectedCommittee('الكل');
  }, [selectedGrade]);

  const stageSelectOptions = useMemo(() => {
    const fromData = [...new Set(committees.map((c) => c.stage).filter(Boolean))];
    const ids = [...new Set([...COMMITTEE_STAGES.map((s) => s.id), ...fromData])];
    return [
      { value: 'الكل', label: 'جميع المراحل' },
      ...ids.map((id) => {
        const preset = COMMITTEE_STAGES.find((s) => s.id === id);
        return { value: id, label: preset?.label || id };
      }),
    ];
  }, [committees]);

  const gradeSelectOptions = useMemo(() => {
    const grades =
      selectedStage === 'الكل'
        ? [...new Set(committees.map((c) => c.grade).filter(Boolean))]
        : gradesForStage(students, selectedStage);
    return [
      { value: 'الكل', label: 'جميع الصفوف' },
      ...grades.map((g) => ({ value: g, label: g })),
    ];
  }, [committees, students, selectedStage]);

  const committeeOptions = useMemo(() => {
    return committees.filter((c) => {
      if (selectedStage !== 'الكل' && c.stage && c.stage !== selectedStage) return false;
      if (selectedGrade !== 'الكل' && c.grade && c.grade !== selectedGrade) return false;
      return true;
    });
  }, [committees, selectedStage, selectedGrade]);

  const filteredCommittees = useMemo(() => {
    if (selectedCommittee !== 'الكل') {
      const one = committeeOptions.find((c) => c.id === selectedCommittee);
      return one ? [one] : [];
    }
    return committeeOptions;
  }, [committeeOptions, selectedCommittee]);

  const pages = useMemo(
    () => buildAllCommitteeRosterPages(filteredCommittees, students, config),
    [filteredCommittees, students, config]
  );

  const previewPage = useMemo(() => {
    if (pages[0]) return pages[0];
    const max = config.maxRows || 25;
    const previewRowCount = Math.min(max, 10);
    const pad = [...SAMPLE_STUDENTS];
    while (pad.length < previewRowCount) {
      const i = pad.length;
      pad.push({ id: `pad-${i}`, name: `طالب ${i + 1}`, grade: 'الأول الثانوي' });
    }
    return { ...SAMPLE_PAGE, students: pad.slice(0, previewRowCount) };
  }, [pages, config.maxRows]);

  const previewH = Math.round(PREVIEW_W * (297 / 210));
  const handlePrint = () => window.print();

  return (
    <div className="space-y-8 animate-in fade-in duration-700 font-alexandria pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-violet-100">
              <SlidersHorizontal size={24} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">
              ضبط قالب كشف اللجان
            </h1>
          </div>
          <p className="text-slate-400 font-medium text-sm flex items-center gap-2">
            <FileText size={16} className="text-violet-400" />
            قالب مدمج — اسم المدرسة من الإعدادات: {schoolName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/committees"
            className="px-5 py-3.5 bg-white text-slate-600 rounded-2xl font-black text-sm border border-slate-100 flex items-center gap-2 hover:bg-slate-50"
          >
            <ArrowRight size={18} />
            إدارة اللجان
          </Link>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className={`px-6 py-4 rounded-3xl font-black text-sm border flex items-center gap-3 ${
              showSettings
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-slate-600 border-slate-100'
            }`}
          >
            <SlidersHorizontal size={20} />
            {showSettings ? 'إخفاء الضبط' : 'أدوات الضبط'}
          </button>
          <button
            type="button"
            onClick={() =>
              navigate('/committees', {
                state: {
                  openRosterPrint: true,
                  filters: {
                    stage: selectedStage,
                    grade: selectedGrade,
                    committeeId: selectedCommittee,
                  },
                },
              })
            }
            className="px-6 py-4 bg-white text-slate-700 rounded-3xl font-black text-sm border border-slate-200 flex items-center gap-3 hover:bg-slate-50"
          >
            <Eye size={20} className="text-indigo-500" />
            معاينة الطباعة
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            className="px-8 py-4 bg-violet-600 text-white rounded-3xl font-black text-sm hover:bg-violet-700 shadow-xl shadow-violet-100 flex items-center gap-3 disabled:opacity-50"
          >
            <Printer size={20} />
            طباعة المعاينة
          </button>
        </div>
      </div>

      <div className="luxury-card p-2 bg-white/60 backdrop-blur-xl border-white print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <FilterSelect
            label="المرحلة"
            value={selectedStage}
            onChange={setSelectedStage}
            options={stageSelectOptions}
          />
          <FilterSelect
            label="الصف"
            value={selectedGrade}
            onChange={setSelectedGrade}
            options={gradeSelectOptions}
          />
          <FilterSelect
            label="اللجنة"
            value={selectedCommittee}
            onChange={setSelectedCommittee}
            options={[
              { value: 'الكل', label: 'أول لجنة / كل اللجان في الفلتر' },
              ...committeeOptions.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <p className="text-[10px] font-bold text-slate-400 px-4 py-2">
          {loading
            ? 'جاري التحميل...'
            : pages.length
              ? `معاينة: ${pages.length} صفحة — ${filteredCommittees.length} لجنة`
              : 'لا توجد لجان — يُعرض نموذج تجريبي'}
        </p>
      </div>

      <div className="print:hidden grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <div className="flex flex-col items-center sticky top-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            معاينة القالب المدمج (A4)
          </p>
          <p className="text-[10px] font-bold text-amber-700 mb-3">
            مرّر للأسفل لرؤية منطقة المدير والختم
          </p>
          <div
            className="rounded-2xl shadow-2xl border border-indigo-200/60 bg-gradient-to-br from-slate-100 to-indigo-50 p-3"
            style={{ width: PREVIEW_W + 24 }}
          >
            <div
              className="rounded-xl overflow-y-auto overflow-x-hidden border border-slate-200/80 bg-white"
              style={{ width: PREVIEW_W, maxHeight: previewH }}
            >
              <CommitteeRosterSheet
                page={previewPage}
                config={config}
                schoolName={schoolName}
                previewPx={{ width: PREVIEW_W }}
                embedded
                showManagerLayoutGuides
              />
            </div>
          </div>
          <div
            className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50/80 p-3 shadow-sm"
            style={{ width: PREVIEW_W + 24 }}
          >
            <p className="text-[10px] font-black text-amber-900 mb-2 text-center">
              معاينة منطقة المدير — للضبط السريع
            </p>
            <ManagerFooterPreviewOnly config={config} width={PREVIEW_W} />
          </div>
        </div>

        {showSettings ? (
          <CommitteeRosterSettingsPanel
            config={config}
            handleConfigChange={handleConfigChange}
            resetConfig={resetConfig}
            onClose={() => setShowSettings(false)}
          />
        ) : (
          <div className="luxury-card p-8 text-center text-slate-400">
            <p className="font-black text-sm mb-4">لوحة الضبط مخفية</p>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="px-6 py-3 bg-violet-600 text-white rounded-2xl font-black text-sm"
            >
              إظهار الضبط
            </button>
          </div>
        )}
      </div>

      <div id="committee-roster-studio-print" className="hidden print:block">
        {(pages.length ? pages : [previewPage]).map((page) => (
          <CommitteeRosterSheet
            key={page.id}
            page={page}
            config={config}
            schoolName={schoolName}
          />
        ))}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #committee-roster-studio-print,
          #committee-roster-studio-print * { visibility: visible; }
          #committee-roster-studio-print {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 bg-slate-50/50 rounded-2xl">
      <Layout size={20} className="text-violet-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
          {label}
        </span>
        <select
          className="w-full bg-transparent font-black text-sm text-slate-800 outline-none cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => {
            const val = typeof o === 'string' ? o : o.value;
            const lab = typeof o === 'string' ? o : o.label;
            return (
              <option key={String(val)} value={String(val)}>
                {lab}
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
