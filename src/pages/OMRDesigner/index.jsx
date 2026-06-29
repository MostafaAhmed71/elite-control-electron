import React, { useState, useRef } from 'react';
import { OMR_API_BASE } from '../../utils/dataService';
import {
  Trash2, Save, Plus, Image as ImageIcon,
  QrCode, ChevronUp, ChevronDown, Download,
  RotateCcw, Palette, Layout, Settings, Type,
  Maximize2, Eye, FileText, CheckCircle2,
  Wifi, WifiOff, X
} from 'lucide-react';

/* ─────────── Constants ─────────── */
const A4_W = 595;  // points → use as px at 1x scale
const A4_H = 842;
const SCALE = 0.85; // canvas display scale

const QUESTIONS_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];

/* ─────────── Default template ─────────── */
const defaultTemplate = () => ({
  logo: { show: true, x: 30, y: 20, size: 70, url: '' },
  schoolName: { show: true, x: A4_W / 2, y: 28, text: 'وزارة التعليم - مدرسة النموذجية', fontSize: 13, bold: true, align: 'center' },
  examTitle: { show: true, x: A4_W / 2, y: 48, text: 'اختبار نهاية الفصل الدراسي الأول', fontSize: 11, bold: true, align: 'center' },
  infoRow: {
    show: true, y: 58,
    fields: [
      { label: 'اسم الطالب', width: 360 },
      { label: 'اليوم', width: 120 },
      { label: 'التاريخ', width: 120 },
      { label: 'المادة', width: 120 },
      { label: 'الصف', width: 120 },
    ]
  },
  qrCode: { show: true, x: A4_W - 90, y: 20, size: 70 },
  questions: {
    show: true,
    count: 20,
    cols: 2,
    startY: 118,
    rowH: 28,
    optionSize: 12,
    optionGap: 22,
    marginX: 40,
    options: ['أ', 'ب', 'ج', 'د'],
  },
  dividerLine: { show: true, y: 115 },
  cornerMarkers: { show: true, size: 20 },
  bgColor: '#ffffff',
  borderColor: '#cccccc',
});

/* ─────────── Premium Preview component ─────────── */
const SheetPreview = ({ tpl, logoDataUrl }) => {
  const W = A4_W * SCALE;
  const H = A4_H * SCALE;
  const s = SCALE;

  const qs = tpl.questions;
  const perCol = Math.ceil(qs.count / qs.cols);
  const colW = (A4_W - qs.marginX * 2) / qs.cols;

  return (
    <div className="relative bg-white shadow-[0_30px_90px_rgba(0,0,0,0.15)] rounded-sm overflow-hidden border border-slate-200 transition-all duration-500"
      style={{ width: W, height: H, flexShrink: 0 }}>

      {/* Corner markers */}
      {tpl.cornerMarkers.show && ['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
        <div key={i} className={`absolute ${pos} bg-slate-900 shadow-sm`}
          style={{ width: tpl.cornerMarkers.size * s, height: tpl.cornerMarkers.size * s }} />
      ))}

      {/* Logo */}
      {tpl.logo.show && (
        <div className="absolute flex items-center justify-center border border-slate-100 rounded-lg overflow-hidden bg-slate-50/30"
          style={{ left: tpl.logo.x * s, top: tpl.logo.y * s, width: tpl.logo.size * s, height: tpl.logo.size * s }}>
          {logoDataUrl
            ? <img src={logoDataUrl} className="w-full h-full object-contain p-1" alt="logo" />
            : <ImageIcon size={20} className="text-slate-200" />}
        </div>
      )}

      {/* QR code placeholder */}
      {tpl.qrCode.show && (
        <div className="absolute flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50"
          style={{ left: tpl.qrCode.x * s, top: tpl.qrCode.y * s, width: tpl.qrCode.size * s, height: tpl.qrCode.size * s }}>
          <QrCode size={20} className="text-slate-300" />
          <span className="text-[7px] font-black text-slate-300 mt-1 uppercase tracking-tighter">OMR KEY</span>
        </div>
      )}

      {/* School name */}
      {tpl.schoolName.show && (
        <div className="absolute text-center w-full" style={{ top: tpl.schoolName.y * s }}>
          <span className="block font-black text-slate-900"
            style={{ fontSize: tpl.schoolName.fontSize * s, fontWeight: tpl.schoolName.bold ? 900 : 400 }}>
            {tpl.schoolName.text}
          </span>
        </div>
      )}

      {/* Exam title */}
      {tpl.examTitle.show && (
        <div className="absolute text-center w-full" style={{ top: tpl.examTitle.y * s }}>
          <span className="block text-slate-600 font-bold"
            style={{ fontSize: tpl.examTitle.fontSize * s, fontWeight: tpl.examTitle.bold ? 800 : 400 }}>
            {tpl.examTitle.text}
          </span>
        </div>
      )}

      {/* Info row */}
      {tpl.infoRow.show && (
        <div className="absolute flex flex-row-reverse gap-2 px-4"
          style={{ top: tpl.infoRow.y * s, left: 0, right: 0 }}>
          {tpl.infoRow.fields.map((f, i) => (
            <div key={i} className="border border-slate-300 rounded flex items-center justify-end px-2 bg-white"
              style={{ width: f.width * s, height: 20 * s }}>
              <span className="text-slate-400 font-bold" style={{ fontSize: 7 * s }}>{f.label}: _________</span>
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      {tpl.dividerLine.show && (
        <div className="absolute left-6 right-6 border-t-2 border-slate-900/10"
          style={{ top: tpl.dividerLine.y * s }} />
      )}

      {/* Questions grid */}
      {qs.show && Array.from({ length: qs.count }).map((_, idx) => {
        const col = Math.floor(idx / perCol);
        const rowInCol = idx % perCol;
        const x = qs.marginX * s + col * colW * s;
        const y = qs.startY * s + rowInCol * qs.rowH * s;
        return (
          <div key={idx} className="absolute flex items-center flex-row-reverse"
            style={{ left: x, top: y }}>
            <span className="text-slate-900 font-black ml-2" style={{ fontSize: 8 * s, minWidth: 20 * s }}>
              {idx + 1}
            </span>
            <div className="flex gap-1.5 flex-row-reverse">
              {qs.options.map((opt, oi) => (
                <div key={oi} className="border-2 border-slate-900 rounded-full flex items-center justify-center transition-all bg-white"
                  style={{ width: qs.optionSize * s, height: qs.optionSize * s }}>
                  <span className="font-bold" style={{ fontSize: 6.5 * s, color: '#000' }}>{opt}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ─────────── Sidebar Components ─────────── */
const SectionPanel = ({ title, icon: Icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`luxury-card border-none mb-3 overflow-hidden transition-all duration-300 ${open ? 'bg-white shadow-md' : 'bg-slate-50/50 shadow-none'}`}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex justify-between items-center px-5 py-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${open ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>
            <Icon size={16} />
          </div>
          <span className={`text-xs font-black uppercase tracking-widest ${open ? 'text-slate-900' : 'text-slate-400'}`}>{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-300" /> : <ChevronDown size={16} className="text-slate-300" />}
      </button>
      {open && <div className="p-5 pt-0 space-y-5 animate-in slide-in-from-top-2">{children}</div>}
    </div>
  );
};

const Label = ({ children }) => <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">{children}</label>;

const NumInput = ({ value, onChange, min, max, step = 1, label }) => (
  <div className="group">
    {label && <Label>{label}</Label>}
    <div className="relative">
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full px-4 py-3 bg-slate-50 border border-transparent rounded-2xl text-sm font-black text-slate-700 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all" />
      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col scale-75 opacity-0 group-hover:opacity-100 transition-opacity">
         <button onClick={() => onChange(Math.min(max, value + step))} className="text-slate-300 hover:text-indigo-500"><ChevronUp size={14} /></button>
         <button onClick={() => onChange(Math.max(min, value - step))} className="text-slate-300 hover:text-indigo-500"><ChevronDown size={14} /></button>
      </div>
    </div>
  </div>
);

const Toggle = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between p-2 rounded-2xl hover:bg-slate-50 transition-colors">
    <span className="text-sm font-black text-slate-700">{label}</span>
    <button onClick={() => onChange(!value)}
      className={`w-11 h-6 rounded-full transition-all flex items-center px-1 ${value ? 'bg-indigo-600' : 'bg-slate-200'}`}>
      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${value ? 'translate-x-[20px]' : 'translate-x-0'}`} />
    </button>
  </div>
);

/* ─────────── Main Designer ─────────── */
const OMRDesigner = () => {
  const [tpl, setTpl] = useState(defaultTemplate);
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [activeTab, setActiveTab] = useState('header');
  const [saved, setSaved] = useState(false);
  const [engineStatus, setEngineStatus] = useState(''); // '', 'ok', 'error', 'loaded'
  const logoInputRef = useRef();

  const update = (path, value) => {
    setTpl(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
    setSaved(false);
  };

  const updateField = (idx, key, val) => {
    setTpl(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.infoRow.fields[idx][key] = val;
      return next;
    });
    setSaved(false);
  };

  const addField = () => {
    setTpl(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.infoRow.fields.push({ label: 'حقل جديد', width: 80 });
      return next;
    });
  };

  const removeField = (idx) => {
    setTpl(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.infoRow.fields.splice(idx, 1);
      return next;
    });
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    localStorage.setItem('omr_template_config', JSON.stringify({ tpl, logoDataUrl }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => { setTpl(defaultTemplate()); setLogoDataUrl(''); };

  const handleSendToBackend = async () => {
    setEngineStatus('');
    try {
      const res = await fetch(`${OMR_API_BASE}/save-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tpl, logoDataUrl })
      });
      if (res.ok) {
        setEngineStatus('ok');
        setTimeout(() => setEngineStatus(''), 3000);
      } else {
        setEngineStatus('error');
      }
    } catch {
      setEngineStatus('error');
    }
  };

  const handleLoadFromServer = async () => {
    try {
      const res = await fetch(`${OMR_API_BASE}/get-template`);
      if (res.ok) {
        const data = await res.json();
        if (data.tpl) setTpl(data.tpl);
        if (data.logoDataUrl) setLogoDataUrl(data.logoDataUrl);
        setEngineStatus('loaded');
        setTimeout(() => setEngineStatus(''), 2000);
      }
    } catch {
      setEngineStatus('error');
    }
  };

  const TABS = [
    { id: 'header', label: 'الهوية البصرية', icon: Type },
    { id: 'questions', label: 'هيكلة الأسئلة', icon: Layout },
    { id: 'layout', label: 'إعدادات الصفحة', icon: Settings },
  ];

  return (
    <div className="flex flex-col lg:flex-row bg-[#F1F3F9] min-h-screen min-h-[100dvh] font-alexandria overflow-x-hidden" dir="rtl">

      {/* ── Left Designer Sidebar ── */}
      <div className="w-full lg:w-[min(100%,420px)] lg:max-w-[420px] max-h-[55vh] lg:max-h-none lg:h-screen bg-white border-b lg:border-b-0 lg:border-l border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.04)] lg:shadow-[20px_0_50px_rgba(0,0,0,0.03)] flex flex-col z-20 overflow-hidden shrink-0">
        
        {/* Sidebar Header */}
        <div className="p-5 sm:p-8 pb-4 sm:pb-6 border-b border-slate-50 bg-gradient-to-l from-slate-900 to-indigo-900 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
          <div className="relative z-10">
            <h2 className="text-2xl font-black font-header tracking-tight">استوديو القوالب</h2>
            <p className="text-indigo-200 text-xs mt-2 font-bold uppercase tracking-widest opacity-80">مصمم ورق الإجابات الذكي</p>
          </div>
        </div>

        {/* Premium Tab Interface */}
        <div className="flex p-2 bg-slate-50/50">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-2 py-4 rounded-2.5xl transition-all relative group
                ${activeTab === t.id ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <t.icon size={20} className={activeTab === t.id ? 'scale-110 duration-300' : 'group-hover:scale-110 transition-transform'} />
              <span className="text-[10px] font-black uppercase tracking-widest">{t.label}</span>
              {activeTab === t.id && <div className="absolute bottom-1 w-1 h-1 bg-indigo-600 rounded-full"></div>}
            </button>
          ))}
        </div>

        {/* Scrollable Control Panel */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-2">

          {/* ────── HEADER TAB ────── */}
          {activeTab === 'header' && (
            <div className="animate-in fade-in slide-in-from-right-4">
              <SectionPanel title="شعار المؤسسة" icon={ImageIcon}>
                <Toggle label="تفعيل الشعار" value={tpl.logo.show} onChange={v => update('logo.show', v)} />
                {tpl.logo.show && (
                  <div className="space-y-6 pt-2">
                    <div>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      <button onClick={() => logoInputRef.current?.click()}
                        className="w-full h-32 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-100 rounded-[2rem] bg-slate-50/50 hover:bg-indigo-50/30 hover:border-indigo-200 transition-all group">
                        {logoDataUrl ? (
                          <div className="relative w-full h-full p-4 flex items-center justify-center">
                            <img src={logoDataUrl} className="max-h-full max-w-full object-contain drop-shadow-sm" />
                            <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-[2rem] flex items-center justify-center">
                              <span className="text-[10px] font-black text-indigo-600 bg-white px-3 py-1.5 rounded-full shadow-sm">تغيير الصورة</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-300 group-hover:text-indigo-400 transition-colors">
                              <Plus size={24} />
                            </div>
                            <span className="text-[11px] font-black text-slate-400">تحميل شعار مخصص</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <NumInput label="الحجم (بكسل)" value={tpl.logo.size} onChange={v => update('logo.size', v)} min={30} max={150} />
                       <NumInput label="الارتفاع (Y)" value={tpl.logo.y} onChange={v => update('logo.y', v)} min={0} max={200} />
                    </div>
                    <NumInput label="الموضع الأفقي (X)" value={tpl.logo.x} onChange={v => update('logo.x', v)} min={0} max={500} />
                  </div>
                )}
              </SectionPanel>

              <SectionPanel title="اسم المدرسة" icon={Type}>
                <Toggle label="تفعيل النص" value={tpl.schoolName.show} onChange={v => update('schoolName.show', v)} />
                {tpl.schoolName.show && (
                  <div className="space-y-6 pt-2">
                    <div className="space-y-2">
                      <Label>النص المعروض</Label>
                      <input value={tpl.schoolName.text} onChange={e => update('schoolName.text', e.target.value)}
                        className="w-full px-5 py-4 bg-slate-50 border border-transparent rounded-2.5xl text-sm font-bold text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all font-header" dir="rtl" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <NumInput label="حجم الخط" value={tpl.schoolName.fontSize} onChange={v => update('schoolName.fontSize', v)} min={8} max={24} />
                      <NumInput label="موضع Y" value={tpl.schoolName.y} onChange={v => update('schoolName.y', v)} min={0} max={200} />
                    </div>
                    <Toggle label="خط عريض جداً" value={tpl.schoolName.bold} onChange={v => update('schoolName.bold', v)} />
                  </div>
                )}
              </SectionPanel>

              <SectionPanel title="عنوان الاختبار الرئيسي" icon={FileText}>
                <Toggle label="تفعيل العنوان" value={tpl.examTitle.show} onChange={v => update('examTitle.show', v)} />
                {tpl.examTitle.show && (
                   <div className="space-y-6 pt-2">
                    <div className="space-y-2">
                      <Label>نص العنوان</Label>
                      <input value={tpl.examTitle.text} onChange={e => update('examTitle.text', e.target.value)}
                        className="w-full px-5 py-4 bg-slate-50 border border-transparent rounded-2.5xl text-sm font-bold text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all" dir="rtl" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <NumInput label="الحجم" value={tpl.examTitle.fontSize} onChange={v => update('examTitle.fontSize', v)} min={8} max={20} />
                      <NumInput label="موضع Y" value={tpl.examTitle.y} onChange={v => update('examTitle.y', v)} min={0} max={200} />
                    </div>
                  </div>
                )}
              </SectionPanel>
            </div>
          )}

          {/* ────── QUESTIONS TAB ────── */}
          {activeTab === 'questions' && (
            <div className="animate-in fade-in slide-in-from-right-4">
               <SectionPanel title="هيكل الفقرات" icon={Layout}>
                  <div className="space-y-6">
                    <NumInput label="عدد الأسئلة الكلي" value={tpl.questions.count} onChange={v => update('questions.count', v)} min={5} max={120} />
                    <div className="grid grid-cols-2 gap-4">
                       <NumInput label="عدد الأعمدة" value={tpl.questions.cols} onChange={v => update('questions.cols', v)} min={1} max={4} />
                       <NumInput label="الإزاحة (Y)" value={tpl.questions.startY} onChange={v => update('questions.startY', v)} min={80} max={400} />
                    </div>
                    <NumInput label="ارتفاع الصف" value={tpl.questions.rowH} onChange={v => update('questions.rowH', v)} min={16} max={60} />
                  </div>
               </SectionPanel>

               <SectionPanel title="تصميم الدوائر" icon={Settings}>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <NumInput label="قطر الدائرة" value={tpl.questions.optionSize} onChange={v => update('questions.optionSize', v)} min={8} max={30} />
                      <NumInput label="تباعد الخيارات" value={tpl.questions.optionGap} onChange={v => update('questions.optionGap', v)} min={14} max={50} />
                    </div>
                    <NumInput label="الهامش الجانبي" value={tpl.questions.marginX} onChange={v => update('questions.marginX', v)} min={10} max={100} />
                    <div className="space-y-2">
                      <Label>تسمية الخيارات (A, B, C...)</Label>
                      <input value={tpl.questions.options.join(',')}
                        onChange={e => update('questions.options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        className="w-full px-5 py-4 bg-slate-50 border border-transparent rounded-2.5xl text-sm font-black text-slate-800 outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all text-center tracking-widest" dir="ltr" />
                      <p className="text-[10px] text-slate-400 font-bold mt-1 text-center">أ,ب,ج,د أو A,B,C,D</p>
                    </div>
                  </div>
               </SectionPanel>
            </div>
          )}

          {/* ────── LAYOUT TAB ────── */}
          {activeTab === 'layout' && (
            <div className="animate-in fade-in slide-in-from-right-4">
               <SectionPanel title="العناصر اللوجستية" icon={QrCode}>
                  <div className="space-y-8">
                    <div className="luxury-card bg-slate-50/50 p-4 space-y-4">
                       <Toggle label="كود QR الذكي" value={tpl.qrCode.show} onChange={v => update('qrCode.show', v)} />
                       {tpl.qrCode.show && (
                         <div className="grid grid-cols-2 gap-4 pt-2">
                           <NumInput label="الحجم" value={tpl.qrCode.size} onChange={v => update('qrCode.size', v)} min={40} max={120} />
                           <NumInput label="الارتفاع" value={tpl.qrCode.y} onChange={v => update('qrCode.y', v)} min={0} max={200} />
                         </div>
                       )}
                    </div>

                    <div className="luxury-card bg-slate-50/50 p-4 space-y-4">
                        <Toggle label="خط الفصل العلوي" value={tpl.dividerLine.show} onChange={v => update('dividerLine.show', v)} />
                        {tpl.dividerLine.show && <NumInput label="الموضع الرأسي" value={tpl.dividerLine.y} onChange={v => update('dividerLine.y', v)} min={50} max={300} />}
                    </div>

                    <div className="luxury-card bg-slate-50/50 p-4 space-y-4">
                        <Toggle label="مربعات المعايرة (Corners)" value={tpl.cornerMarkers.show} onChange={v => update('cornerMarkers.show', v)} />
                        {tpl.cornerMarkers.show && <NumInput label="حجم المربع" value={tpl.cornerMarkers.size} onChange={v => update('cornerMarkers.size', v)} min={10} max={40} />}
                    </div>
                  </div>
               </SectionPanel>

               <SectionPanel title="حقول البيانات السطرية" icon={FileText}>
                  <Toggle label="تفعيل حقول الطالب" value={tpl.infoRow.show} onChange={v => update('infoRow.show', v)} />
                  {tpl.infoRow.show && (
                    <div className="space-y-6 pt-2">
                      <NumInput label="موضع الارتفاع (Y)" value={tpl.infoRow.y} onChange={v => update('infoRow.y', v)} min={60} max={250} />
                      <div className="space-y-3">
                        {tpl.infoRow.fields.map((f, i) => (
                          <div key={i} className="flex gap-3 items-center p-3 bg-white border border-slate-100 rounded-2xl shadow-sm group">
                            <input value={f.label} onChange={e => updateField(i, 'label', e.target.value)}
                              className="flex-1 bg-slate-50 border-none px-3 py-2 rounded-xl text-xs font-black text-slate-700 focus:ring-2 focus:ring-indigo-100" dir="rtl" />
                            <input type="number" value={f.width} onChange={e => updateField(i, 'width', Number(e.target.value))}
                              className="w-16 bg-slate-50 border-none px-2 py-2 rounded-xl text-xs font-black text-slate-700 text-center" />
                            <button onClick={() => removeField(i)} className="p-2 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                        <button onClick={addField}
                          className="w-full py-4 border-2 border-dashed border-slate-100 rounded-2xl text-xs text-slate-400 font-black hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50/20 transition-all flex items-center justify-center gap-2">
                          <Plus size={16} /> إضافة حقل جديد
                        </button>
                      </div>
                    </div>
                  )}
               </SectionPanel>
            </div>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="p-8 border-t border-slate-100 space-y-4 bg-white shrink-0">
          <button onClick={handleSave}
            className={`w-full py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl
              ${saved ? 'bg-emerald-500 text-white shadow-emerald-100' : 'bg-slate-900 text-white shadow-slate-200 hover:bg-slate-800'}`}>
            <Save size={20} /> {saved ? 'تم الحفظ بنجاح' : 'حفظ التصميم'}
          </button>
          
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleSendToBackend}
              className="py-4 bg-indigo-50 text-indigo-700 rounded-2.5xl font-black text-xs flex items-center justify-center gap-2 hover:bg-indigo-100 transition-all">
              <Download size={16} /> ارساء للمحرك
            </button>
            <button onClick={handleLoadFromServer}
              className="py-4 bg-violet-50 text-violet-700 rounded-2.5xl font-black text-xs flex items-center justify-center gap-2 hover:bg-violet-100 transition-all">
              <Eye size={16} /> استيراد الحالي
            </button>
          </div>
          
          <button onClick={handleReset}
             className="w-full py-3 bg-white text-slate-300 hover:text-rose-500 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2">
             <RotateCcw size={12} /> إعادة ضبط المصنع
          </button>

          {engineStatus === 'ok' && <div className="text-center text-[10px] font-black text-emerald-600 bg-emerald-50 rounded-xl py-3 border border-emerald-100 animate-in fade-in">✅ تم تحديث القالب في المحرك الذكي</div>}
          {engineStatus === 'error' && <div className="text-center text-[10px] font-black text-rose-500 bg-rose-50 rounded-xl py-3 border border-rose-100 animate-in shake">⚠️ فشل في الاتصال بالخدمة السحابية</div>}
        </div>
      </div>

      {/* ── Main Canvas (Preview) Area ── */}
      <div className="flex-1 flex flex-col min-h-0 lg:h-screen overflow-hidden min-w-0">
         {/* Top Info Bar */}
         <header className="min-h-14 sm:h-20 px-3 sm:px-6 lg:px-10 py-2 sm:py-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white/60 backdrop-blur-xl border-b border-white z-10 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 min-w-0">
               <h1 className="text-base sm:text-xl font-black text-slate-900 font-header truncate">معاينة المستخرج النهائي</h1>
               <div className="hidden sm:block h-6 w-[2px] bg-slate-200"></div>
               <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] sm:text-xs uppercase tracking-widest">
                  <Maximize2 size={14} className="shrink-0" /> مقياس: {(SCALE * 100).toFixed(0)}%
               </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
               <div className="px-5 py-2 bg-slate-900 text-white rounded-full font-black text-xs shadow-lg shadow-slate-200">A4 STANDARD</div>
               <div className={`px-4 py-2 rounded-full font-black text-[10px] flex items-center gap-2 border 
                 ${engineStatus === 'ok' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                 <div className={`w-2 h-2 rounded-full ${engineStatus === 'ok' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                 {engineStatus === 'ok' ? 'متصل' : 'قيد الانتظار'}
               </div>
            </div>
         </header>

         {/* Spotlight Canvas */}
         <main className="flex-1 overflow-auto bg-[#F1F3F9] p-3 sm:p-8 lg:p-20 flex justify-center items-start custom-scrollbar">
            <div className="relative group">
               {/* Hover effect decorations */}
               <div className="absolute -inset-4 bg-indigo-600/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity blur-2xl"></div>
               <SheetPreview tpl={tpl} logoDataUrl={logoDataUrl} />
            </div>
         </main>

         {/* Desktop Footer (Tools) */}
         <footer className="min-h-12 sm:h-14 px-4 sm:px-10 py-2 flex items-center justify-center bg-white border-t border-slate-100 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.3em] shrink-0 text-center">
            💡 نصيحة: استخدم حقول البيانات بحرص لتوفير مساحة كافية للفقرات
         </footer>
      </div>
    </div>
  );
};

export default OMRDesigner;
