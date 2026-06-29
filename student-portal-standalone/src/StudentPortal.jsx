import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  fetchOmrResultsForPortalLookup,
  hydrateOmrResultsDetails,
  getAppSettings,
  findStudentByNormalizedNationalId,
  getStudentsCached,
  getOmrExamsPortalCached,
  collectStudentIdentityNorms,
  examIsArchived,
  requestRetake,
  getMyRetakeRequestsForNational,
  getNextMonday,
  retakeMatchesResult,
  isRetakeForUpcomingMonday,
  supabaseUrl,
} from './dataService';
import { applyExamKeysToResults } from './omrGrading';
import {
  Search, Printer, CheckCircle, AlertCircle, Download,
  GraduationCap, School, User, Award, Hash, BookOpen,
  Calendar, Filter, ChevronDown, X, RotateCcw, Clock, CreditCard
} from 'lucide-react';
import html2canvas from 'html2canvas';

/* ── helpers ── */
const getGradeLabel = (pct) => {
  if (pct >= 90) return { label: 'ممتاز',       color: '#1e1b4b', bg: '#e0e7ff', icon: <Award className="w-5 h-5" /> };
  if (pct >= 80) return { label: 'جيد جداً',    color: '#1e3a8a', bg: '#dbeafe', icon: <Award className="w-5 h-5" /> };
  if (pct >= 70) return { label: 'جيد',         color: '#1d4ed8', bg: '#eff6ff', icon: <Award className="w-5 h-5" /> };
  if (pct >= 50) return { label: 'مقبول',       color: '#4338ca', bg: '#eef2ff', icon: <Award className="w-5 h-5" /> };
  return           { label: 'دون المستوى',     color: '#dc2626', bg: '#fef2f2', icon: <AlertCircle className="w-5 h-5" /> };
};

const getLetterAr = (l) => ({ A: 'أ', B: 'ب', C: 'ج', D: 'د', E: 'هـ' }[l] || l || '—');

/* Tries to parse a date out of the result object */
const parseResultDate = (r) => {
  const raw = r.date || r.createdAt || r.scannedAt || r.timestamp || r.examDate || r._rowCreatedAt || '';
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

/* Format a Date → "YYYY-MM-DD" for <input type="date"> */
const toDateValue = (d) => d ? d.toISOString().slice(0, 10) : '';



/* ── Filter Bar ── */
const FilterBar = ({ results, filterText, setFilterText, filtered }) => {
  /* Collect unique exam/subject titles from results */
  const availableExamTitles = useMemo(() => {
    const set = new Set();
    results.forEach(r => {
      const t = displayExamTitle(r);
      if (t) set.add(t);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [results]);

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-white shadow-xl p-4 sm:p-6 mb-6">
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
        {/* Exam name filter (dropdown) */}
        <div className="flex-1 space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <Filter className="w-3 h-3" /> اختر المادة لعرض النتيجة
          </label>
          <div className="flex gap-2">
            <select
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
            >
              <option value="">— اختر المادة —</option>
              {availableExamTitles.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {filterText && (
              <button onClick={() => setFilterText('')}
                className="p-2.5 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all border border-rose-100">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Counter */}
        <div className="flex items-end pb-0.5">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
            <div className="text-[10px] font-black text-indigo-400 uppercase">الظاهر</div>
            <div className="text-indigo-900 font-black text-xl">{filtered.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** عنوان الاختبار للعرض: من النتيجة أو احتياطي */
const displayExamTitle = (result) => {
  const t = String(result?.examTitle || '').trim();
  return t || 'نتيجة الاختبار المعتمدة';
};

/** توحيد أرقام الهوية (عربي/لاتيني/أصفار بادئة) للمقارنة */
const normalizeNationalId = (value) => {
  const raw = (value ?? '').toString().trim();
  if (!raw) return '';
  const arabicIndicDigits = '٠١٢٣٤٥٦٧٨٩';
  const easternArabicDigits = '۰۱۲۳۴۵۶۷۸۹';
  const latin = raw
    .split('')
    .map((ch) => {
      const ia = arabicIndicDigits.indexOf(ch);
      if (ia >= 0) return String(ia);
      const ie = easternArabicDigits.indexOf(ch);
      if (ie >= 0) return String(ie);
      return ch;
    })
    .join('');
  return latin.replace(/[^a-zA-Z0-9]/g, '').replace(/^0+/, '').trim();
};

/** حقول الهوية المحتملة على سجل طالب (بعض الاستيرادات تضعها في id أو studentId) */
const studentNationalIdNorms = (s) =>
  [s?.nationalId, s?.national_id, s?.id, s?.studentId, s?.student_id]
    .map((v) => normalizeNationalId(String(v ?? '')))
    .filter(Boolean);

/** فهرس: أي معرّف معروف للطالب (هوية، جلوس، معرف نظام…) → سجل الطالب */
const buildSeatStudentMap = (students) => {
  const m = new Map();
  for (const s of students || []) {
    for (const key of [
      s.nationalId,
      s.national_id,
      s.seatNumber,
      s.seat_number,
      s.studentId,
      s.student_id,
      s.id,
    ]) {
      const k = normalizeNationalId(String(key ?? ''));
      if (k && !m.has(k)) m.set(k, s);
    }
  }
  return m;
};

const resolveStudentFromResultRow = (r, bySeat) => {
  const candidates = [
    r.nationalId,
    r.national_id,
    r.studentId,
    r.detectedStudentId,
    r.normalizedDetectedStudentId,
    r.seatNumber,
    r.seat_number,
  ].filter(Boolean);
  for (const c of candidates) {
    const k = normalizeNationalId(String(c));
    if (k && bySeat.has(k)) return bySeat.get(k);
  }
  return null;
};

/** يطابق صفحة «كشف المعتمدين»: اعتماد صريح أو سجلات قديمة بها درجة ومعرّف */
const isApprovedOmrResult = (r) => {
  const t = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  if (t(r?.approved) || t(r?.confirmed)) return true;
  if (r?.approvedAt != null && String(r.approvedAt).trim() !== '') return true;
  const sid = r?.studentId != null ? String(r.studentId).trim() : '';
  if (sid && r?.score != null) return true;
  return false;
};

/**
 * يزيل الصفوف المكررة لنفس الطالب ونفس الاختبار (أكثر من سجل في القاعدة).
 * يُفترض أن المصفوفة مرتبة من الأحدث للأقدم؛ نُبقي أول ظهور لكل مفتاح.
 */
const dedupeStudentResults = (results) => {
  const seenRowIds = new Set();
  const seenLogical = new Set();
  const out = [];
  for (const r of results) {
    if (r.id != null && String(r.id).trim() !== '') {
      const rid = String(r.id).trim();
      if (seenRowIds.has(rid)) continue;
      seenRowIds.add(rid);
    }
    const eid = String(r.examId ?? '').trim();
    const title = (displayExamTitle(r) || '').trim();
    const examPart = eid || title;
    const sid = String(r.studentId ?? '').trim();
    const nat = String(r.nationalId ?? '').trim();
    const name = String(r.studentName ?? '').trim();
    const studentPart = sid || nat || name;
    const logical = `${examPart}|||${studentPart}`;
    if (seenLogical.has(logical)) continue;
    seenLogical.add(logical);
    out.push(r);
  }
  return out;
};

/* ── Result Slip ── */
const ResultSlip = ({ result, schoolName, index, retakeRequest, pastRetakes, onRequestRetake, portalNationalId, portalSeatNumber }) => {
  const g = getGradeLabel(result.percentage);
  const slipRef  = useRef();
  const exportRef = useRef();
  const [retakeLoading, setRetakeLoading] = useState(false);
  const [retakeError, setRetakeError]   = useState('');

  const handleRetakeClick = async () => {
    if (retakeRequest || retakeLoading) return;
    setRetakeLoading(true); setRetakeError('');
    try {
      await onRequestRetake(result);
    } catch (err) {
      setRetakeError('حدث خطأ أثناء إرسال طلبك. حاول مرة أخرى.');
    } finally {
      setRetakeLoading(false);
    }
  };

  const formatScheduled = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  const nextMonday = useMemo(() => getNextMonday(), []);

  const handleDownload = async () => {
    const canvas = await html2canvas(exportRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.href   = canvas.toDataURL('image/png');
    link.download = `شهادة_${result.studentName || result.studentId}_${displayExamTitle(result) || index + 1}.png`;
    link.click();
  };

  const details = result.details || {};
  const qs   = Object.keys(details).sort((a, b) => parseInt(a) - parseInt(b));
  const col1 = qs.filter(q => parseInt(q) <= 15);
  const col2 = qs.filter(q => parseInt(q) > 15);
  const maxRows = Math.max(col1.length, col2.length, 1);
  const rows = Array.from({ length: maxRows }, (_, i) => ({
    q1: col1[i], d1: col1[i] ? details[col1[i]] : null,
    q2: col2[i], d2: col2[i] ? details[col2[i]] : null
  }));

  const resultDate = parseResultDate(result);

  return (
    <div className="mb-10 group">
      {/* ── hidden export target ── */}
      <div ref={exportRef} style={{ position:'fixed', left:'-10000px', top:0, width:'1000px', background:'#ffffff', direction:'rtl', padding:'40px' }}>
        <div style={{ border:'3px solid #1e1b4b', borderRadius:'24px', overflow:'hidden' }}>
          <div style={{ background:'linear-gradient(to left,#1e1b4b,#312e81)', color:'#fff', padding:'24px 28px', textAlign:'right' }}>
            <div style={{ fontSize:'34px', fontWeight:900 }}>{schoolName}</div>
            <div style={{ marginTop:'8px', fontSize:'18px', opacity:0.9 }}>{displayExamTitle(result)}</div>
          </div>
          <div style={{ padding:'28px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'20px' }}>
              <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'14px', padding:'16px', textAlign:'right' }}>
                <div style={{ color:'#64748b', fontSize:'14px', fontWeight:700, marginBottom:'8px' }}>اسم الطالب</div>
                <div style={{ color:'#0f172a', fontSize:'26px', fontWeight:900 }}>{result.studentName || result.studentId}</div>
              </div>
              <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'14px', padding:'16px', textAlign:'right' }}>
                <div style={{ color:'#64748b', fontSize:'14px', fontWeight:700, marginBottom:'8px' }}>الصف الدراسي</div>
                <div style={{ color:'#0f172a', fontSize:'26px', fontWeight:900 }}>{result.studentGrade || '—'}</div>
              </div>
            </div>
            <div style={{ background:'#eef2ff', border:'1px solid #c7d2fe', borderRadius:'16px', padding:'20px 22px', textAlign:'right' }}>
              <div style={{ color:'#4338ca', fontSize:'18px', fontWeight:800, marginBottom:'14px' }}>الدرجات</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:'12px' }}>
                <div>
                  <div style={{ color:'#64748b', fontSize:'13px', fontWeight:700 }}>المجموع</div>
                  <div style={{ color:'#0f172a', fontSize:'48px', fontWeight:900 }}>
                    {result.score}<span style={{ color:'#64748b', fontSize:'28px', fontWeight:700 }}>/{result.total}</span>
                  </div>
                </div>
                <div style={{ textAlign:'left' }}>
                  <div style={{ color:'#64748b', fontSize:'13px', fontWeight:700 }}>النسبة</div>
                  <div style={{ color:g.color, fontSize:'40px', fontWeight:900 }}>{Math.round(result.percentage)}%</div>
                  <div style={{ color:g.color, fontSize:'18px', fontWeight:800 }}>{g.label}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── visible card ── */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3 print:hidden">
        {/* Exam badge + date */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-black text-sm shadow-sm shrink-0">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-black text-slate-800 text-sm break-words leading-tight">{displayExamTitle(result)}</div>
            {resultDate && (
              <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                <Calendar className="w-3 h-3 shrink-0" />
                <span className="truncate">{resultDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-row gap-2 sm:justify-end">
          <button onClick={handleDownload}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-200 active:scale-95 text-xs sm:text-sm">
            <Download className="w-4 h-4" /> تحميل صورة
          </button>
          <button onClick={() => window.print()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-3 sm:px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-slate-200 active:scale-95 text-xs sm:text-sm">
            <Printer className="w-4 h-4" /> طباعة
          </button>
        </div>
      </div>

      <div ref={slipRef} className="luxury-card overflow-hidden border-2 border-slate-200/50 print:border-none print:shadow-none bg-white relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full opacity-50 -z-0" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-slate-50 rounded-tr-full opacity-50 -z-0" />

        <div className="relative z-10">
          {/* ── Header ── */}
          <div className="bg-gradient-to-l from-indigo-950 to-indigo-900 text-white p-4 sm:p-6 border-b-4 border-indigo-500">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="flex items-center gap-3 sm:gap-5 text-right min-w-0">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-xl sm:rounded-2xl p-1.5 shadow-2xl flex items-center justify-center overflow-hidden shrink-0">
                  <img src="/school_logo.jpeg" alt="Logo" className="w-full h-full object-contain"
                    onError={e => { e.target.src = 'https://ui-avatars.com/api/?name=S&background=1e1b4b&color=fff'; }} />
                </div>
                <div className="min-w-0 flex-1 text-right">
                  <h2 className="text-sm sm:text-2xl font-black tracking-tight font-header leading-snug break-words">{schoolName}</h2>
                  <div className="flex items-start gap-1.5 mt-1 text-indigo-200">
                    <GraduationCap className="w-3 h-3 shrink-0 mt-0.5" />
                    <span className="text-[10px] sm:text-xs font-bold leading-relaxed break-words">{displayExamTitle(result)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 sm:p-4 text-center border border-white/20 w-full sm:w-auto sm:min-w-[140px]">
                <div className="flex sm:block items-baseline justify-center gap-2">
                  <div className="text-3xl sm:text-4xl font-black leading-none">
                    {result.score}<span className="text-lg sm:text-xl opacity-60">/{result.total}</span>
                  </div>
                  <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-indigo-300 sm:mt-2">الدرجة النهائية</div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-6 md:p-8">
            {/* Student Info */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mb-5 sm:mb-6">
              {[
                { label: 'اسم الطالب',   value: result.studentName || result.studentId, icon: <User className="w-4 h-4" />,     color: 'indigo' },
                { label: 'الصف الدراسي', value: result.studentGrade || '—',            icon: <School className="w-4 h-4" />,    color: 'slate'  },
                { label: 'اسم الاختبار', value: displayExamTitle(result),               icon: <BookOpen className="w-4 h-4" />,  color: 'indigo' },
                { label: 'رقم الهوية',   value: (portalNationalId || result.nationalId || '—').toString().trim() || '—', icon: <Hash className="w-4 h-4" />, color: 'indigo' },
                { label: 'رقم الجلوس',   value: (portalSeatNumber || result.seatNumber || result.seat_number || '—').toString().trim() || '—', icon: <CreditCard className="w-4 h-4" />, color: 'slate' },
              ].map((item, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex items-center gap-2 sm:gap-4 min-w-0">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-${item.color}-100 text-${item.color}-700 flex items-center justify-center shadow-sm shrink-0`}>
                    {item.icon}
                  </div>
                  <div className="text-right min-w-0 flex-1">
                    <span className="block text-slate-500 text-[9px] sm:text-[10px] font-black mb-0.5">{item.label}</span>
                    <strong className="text-slate-800 text-[11px] sm:text-sm font-bold break-words leading-tight block">{item.value}</strong>
                  </div>
                </div>
              ))}
            </div>

            {/* Grade Metric */}
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 mb-6 sm:mb-8 p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-indigo-50/50 border border-indigo-100">
              <div className="flex flex-col items-center shrink-0">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-[6px] sm:border-8 border-white flex items-center justify-center shadow-xl text-2xl sm:text-3xl font-black"
                     style={{ backgroundColor: g.bg, color: g.color }}>
                  {Math.round(result.percentage)}%
                </div>
              </div>
              <div className="flex-1 w-full text-right">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-1 sm:gap-0 mb-3">
                  <div className="flex items-center justify-end gap-2" style={{ color: g.color }}>
                    {g.icon}
                    <span className="text-lg sm:text-xl font-black">{g.label}</span>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-slate-500 text-right">مستوى الإنجاز</span>
                </div>
                <div className="h-3 sm:h-4 bg-white rounded-full overflow-hidden shadow-inner p-1">
                  <div className="h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
                       style={{ width: `${result.percentage}%`, backgroundColor: g.color }} />
                </div>
              </div>
            </div>

            {/* ── Retake Request Block ── */}
            <div className="mb-6 print:hidden">
              {retakeRequest ? (
                <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-l from-emerald-50 to-white p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-lg">
                      <CheckCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-right">
                      <div className="font-black text-emerald-800 text-sm sm:text-base mb-1">
                        تم تسجيل طلب الإعادة بنجاح
                      </div>
                      <div className="flex items-center justify-end gap-2 text-emerald-700 font-bold text-xs sm:text-sm">
                        <Calendar className="w-4 h-4" />
                        <span>الموعد: {formatScheduled(retakeRequest.scheduledDate)}</span>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-500 font-bold mt-2 leading-relaxed">
                        نرجو الحضور في الموعد المحدد إلى المدرسة لأداء الاختبار.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-amber-200 bg-gradient-to-l from-amber-50 to-white p-4 sm:p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-lg">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-right">
                      <div className="font-black text-amber-900 text-sm sm:text-base mb-1">
                        هل ترغب في إعادة الاختبار؟
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-600 font-bold leading-relaxed">
                        بالضغط على الزر سيتم تحديد موعد إعادة الاختبار يوم
                        <span className="text-amber-700 font-black mx-1">
                          {nextMonday.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                        وسيتم إبلاغ الإدارة بذلك.
                      </p>
                      {pastRetakes?.length > 0 && (
                        <p className="text-[11px] sm:text-xs text-slate-500 font-bold mt-2 leading-relaxed border-t border-amber-100 pt-2">
                          سبق تسجيل إعادة سابقة
                          {pastRetakes.length > 1 ? ` (${pastRetakes.length} مرات)` : ''}
                          {pastRetakes[0]?.scheduledDate && (
                            <> — آخر موعد: {formatScheduled(pastRetakes[0].scheduledDate)}</>
                          )}
                          . يمكنك طلب إعادة جديدة للموعد القادم أعلاه.
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleRetakeClick}
                    disabled={retakeLoading}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-black text-sm sm:text-base shadow-lg shadow-amber-200 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {retakeLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>جاري إرسال الطلب...</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4" />
                        <span>طلب إعادة الاختبار</span>
                      </>
                    )}
                  </button>
                  {retakeError && (
                    <div className="mt-2 text-rose-600 text-xs font-bold text-right flex items-center justify-end gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {retakeError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Answer Details — section title */}
            {qs.length > 0 && (
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-5 bg-indigo-600 rounded-full" />
                <h3 className="text-sm sm:text-base font-black text-slate-800">تفاصيل الإجابات</h3>
                <span className="text-[10px] sm:text-xs font-bold text-slate-400">({qs.length} سؤال)</span>
              </div>
            )}

            {/* Answer cards — Mobile (grid of small cards) */}
            <div className="grid grid-cols-2 gap-2 sm:hidden mb-4">
              {qs.map((q) => {
                const d = details[q];
                const correct = d?.is_correct;
                return (
                  <div key={q}
                    className={`rounded-xl border p-2.5 flex items-center justify-between gap-2 ${
                      correct
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : 'bg-rose-50/50 border-rose-200'
                    }`}>
                    <div className="flex flex-col items-center justify-center w-8 h-8 rounded-lg bg-indigo-900 text-white shrink-0">
                      <span className="text-[9px] font-bold opacity-70 leading-none">س</span>
                      <span className="text-xs font-black leading-none mt-0.5">{q}</span>
                    </div>
                    <div className="flex-1 text-right min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-black text-slate-500">إجابتك</span>
                        <span className="text-sm font-black text-indigo-900">{getLetterAr(d?.student_answer)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="text-[9px] font-black text-slate-500">النموذج</span>
                        <span className="text-sm font-bold text-slate-700">{getLetterAr(d?.correct_option)}</span>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
                      correct ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                    }`}>
                      {correct ? '✓' : '✗'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Answer Table — Tablet & Desktop */}
            <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full min-w-[640px] text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-indigo-950 text-white print:bg-slate-100 print:text-black">
                    <th className="p-3 border-x border-indigo-900/50 w-16">النتيجة</th>
                    <th className="p-3 border-x border-indigo-900/50 w-16">النموذج</th>
                    <th className="p-3 border-x border-indigo-900/50 w-16">إجابتك</th>
                    <th className="p-3 border-x border-indigo-900/50 bg-indigo-900">سؤال</th>
                    <th className="w-3 bg-slate-200/50" />
                    <th className="p-3 border-x border-indigo-900/50 w-16">النتيجة</th>
                    <th className="p-3 border-x border-indigo-900/50 w-16">النموذج</th>
                    <th className="p-3 border-x border-indigo-900/50 w-16">إجابتك</th>
                    <th className="p-3 border-x border-indigo-900/50 bg-indigo-900">سؤال</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {rows.map(({ q1, d1, q2, d2 }, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      {q2 ? (
                        <>
                          <td className={`p-2 font-black ${d2.is_correct ? 'text-emerald-600 bg-emerald-50/30' : 'text-red-500 bg-red-50/30'}`}>
                            {d2.is_correct ? '✓' : '✗'}
                          </td>
                          <td className="p-2 border-x border-slate-100 text-slate-600 font-bold">{getLetterAr(d2.correct_option)}</td>
                          <td className="p-2 border-x border-slate-100 font-black text-indigo-900">{getLetterAr(d2.student_answer)}</td>
                          <td className="p-2 bg-indigo-50/30 font-black text-indigo-950">{q2}</td>
                        </>
                      ) : <td colSpan="4" />}
                      <td className="bg-slate-50 w-3" />
                      {q1 ? (
                        <>
                          <td className={`p-2 font-black ${d1.is_correct ? 'text-emerald-600 bg-emerald-50/30' : 'text-red-500 bg-red-50/30'}`}>
                            {d1.is_correct ? '✓' : '✗'}
                          </td>
                          <td className="p-2 border-x border-slate-100 text-slate-600 font-bold">{getLetterAr(d1.correct_option)}</td>
                          <td className="p-2 border-x border-slate-100 font-black text-indigo-900">{getLetterAr(d1.student_answer)}</td>
                          <td className="p-2 bg-indigo-50/30 font-black text-indigo-950">{q1}</td>
                        </>
                      ) : <td colSpan="4" />}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-1 sm:gap-2 opacity-70 italic text-[9px] sm:text-[10px] font-bold text-slate-500">
              <p className="text-right">صدر هذا التقرير آلياً من نظام التصحيح الإلكتروني والمراجعة الذكية للنخبة</p>
              <p className="text-right">تاريخ الاستخراج: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════
   Main Component
══════════════════════════════════════════════ */
export default function StudentPortal() {
  const [studentId, setStudentId] = useState('');
  const [allResults, setAllResults] = useState(null);   // sorted, full list
  const [loading, setLoading]     = useState(false);
  const [searchProgress, setSearchProgress] = useState(null);
  const [error, setError]         = useState('');
  const [config, setConfig]       = useState(null);
  const [searchedStudent, setSearchedStudent] = useState(null);
  const [myRetakes, setMyRetakes] = useState([]);

  /* filters */
  const [filterText, setFilterText] = useState('');

  useEffect(() => { getAppSettings().then(setConfig); }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) return;
    setLoading(true); setError(''); setAllResults(null);
    setFilterText(''); setMyRetakes([]); setSearchedStudent(null);
    setSearchProgress({
      phase: 'init',
      pct: 4,
      primary: 'بدء الاستعلام…',
      secondary:
        'الاستعلام يستخدم فهرس الهوية أو دالة portal_fetch على الخادم — دون تحميل كل الجدول.',
    });

    const inputNorm = normalizeNationalId(studentId);
    if (!inputNorm) {
      setError('يرجى إدخال رقم هوية صالح.');
      setLoading(false);
      setSearchProgress(null);
      return;
    }

    try {
      const reportScanProgress = (p) => {
        let pct = 10;
        if (p.totalCount != null && p.totalCount > 0) {
          pct = Math.min(88, 10 + Math.floor((p.loaded / p.totalCount) * 78));
        } else {
          pct = Math.min(82, 10 + p.pageIndex * 4);
        }
        const nf = new Intl.NumberFormat('ar-EG');
        setSearchProgress({
          phase: 'scan',
          pct,
          primary: 'جاري استعلام النتائج من الخادم…',
          secondary:
            p.totalCount != null
              ? `${nf.format(p.loaded)} من ${nf.format(p.totalCount)} سجل`
              : `تمت معالجة ${nf.format(p.loaded)} سجل`,
        });
      };

      let rawResults;
      let matchSource;
      let studentEarly = null;
      try {
        studentEarly = await findStudentByNormalizedNationalId(inputNorm);
        const pack = await fetchOmrResultsForPortalLookup(
          inputNorm,
          studentEarly,
          reportScanProgress
        );
        rawResults = pack.rows;
        matchSource = pack.source;
      } catch (inner) {
        if (inner && inner.code === 'PORTAL_FAST_PATH_FAILED') {
          setError(inner.message);
          setSearchProgress(null);
          return;
        }
        throw inner;
      }

      setSearchProgress({
        phase: 'match',
        pct: 88,
        primary: 'جاري تجهيز العرض…',
        secondary: null,
      });

      const [sRes, eRes, allStudentsRes] = await Promise.allSettled([
        Promise.resolve(studentEarly),
        getOmrExamsPortalCached(),
        getStudentsCached(),
      ]);

      const allStudents =
        allStudentsRes.status === 'fulfilled' && Array.isArray(allStudentsRes.value)
          ? allStudentsRes.value
          : [];
      const rawStudents =
        sRes.status === 'fulfilled' && sRes.value ? [sRes.value] : [];
      const allExams = eRes.status === 'fulfilled' ? eRes.value : [];

      if (sRes.status === 'rejected' || eRes.status === 'rejected') {
        console.warn(
          'بوابة الطالب: تعذر تحميل سجل الطالب أو قائمة الاختبارات؛ يُكمَل العرض من نتائج الاستعلام.',
          sRes.status === 'rejected' ? sRes.reason : null,
          eRes.status === 'rejected' ? eRes.reason : null
        );
      }

      const activeExams = allExams.filter((e) => !examIsArchived(e));
      const activeExamById = new Map(activeExams.map((e) => [String(e.id), e]));
      const examsForRegrade = allExams.filter((e) => e?.keys && Object.keys(e.keys).length > 0);
      const archivedExamIds = new Set(
        allExams.filter((e) => examIsArchived(e)).map((e) => String(e.id))
      );

      const isResultFromActiveExam = (r) => {
        const eid = r.examId != null && String(r.examId).trim() !== '' ? String(r.examId) : '';
        if (eid) {
          if (archivedExamIds.has(eid)) return false;
          if (activeExamById.has(eid)) return true;
          return true;
        }
        const title = String(r.examTitle || '').trim();
        if (title) {
          return activeExams.some((ex) => String(ex.title || '').trim() === title);
        }
        return true;
      };

      const enrichResult = (r) => {
        const eid = r.examId != null && String(r.examId).trim() !== '' ? String(r.examId) : '';
        const ex = eid ? activeExamById.get(eid) : null;
        const fromExam = ex?.title != null ? String(ex.title).trim() : '';
        const currentTitle = String(r.examTitle || '').trim();
        const examTitle = currentTitle || fromExam;
        if (examTitle && examTitle !== (r.examTitle || '').trim()) return { ...r, examTitle };
        return r;
      };

      const bySeatMap = buildSeatStudentMap(
        allStudents.length > 0 ? allStudents : rawStudents
      );
      const student =
        (sRes.status === 'fulfilled' && sRes.value) ||
        allStudents.find((s) => studentNationalIdNorms(s).includes(inputNorm)) ||
        rawStudents.find((s) => studentNationalIdNorms(s).includes(inputNorm)) ||
        null;

      const studentNorms = collectStudentIdentityNorms(student, inputNorm);

      const trustServer = ['rpc', 'index', 'merged', 'fallback'].includes(matchSource);

      const natMatchesResult = (r) => {
        if (!isApprovedOmrResult(r)) return false;
        const rNat = normalizeNationalId(r.nationalId || r.national_id || '');
        if (rNat && rNat === inputNorm) return true;
        for (const raw of [r.studentId, r.detectedStudentId, r.normalizedDetectedStudentId]) {
          if (normalizeNationalId(String(raw ?? '')) === inputNorm) return true;
        }
        const linked = resolveStudentFromResultRow(r, bySeatMap);
        if (linked && studentNationalIdNorms(linked).includes(inputNorm)) return true;
        return false;
      };

      const rowMatchesLookup = (r) => {
        if (!isApprovedOmrResult(r)) return false;
        if (natMatchesResult(r)) return true;
        const keys = [
          r.nationalId,
          r.national_id,
          r.studentId,
          r.detectedStudentId,
          r.normalizedDetectedStudentId,
          r.seatNumber,
          r.seat_number,
        ]
          .map((v) => normalizeNationalId(String(v ?? '')))
          .filter(Boolean);
        if (keys.some((k) => studentNorms.has(k))) return true;
        const linked = resolveStudentFromResultRow(r, bySeatMap);
        if (linked && student && String(linked.id) === String(student.id)) return true;
        if (linked && studentNationalIdNorms(linked).includes(inputNorm)) return true;
        if (student) {
          const seatNorm = normalizeNationalId(
            String(student.seatNumber || student.seat_number || '')
          );
          if (seatNorm && keys.includes(seatNorm)) return true;
          const name = String(student.name || '').trim();
          const rName = String(r.studentName || '').trim();
          if (name.length >= 4 && rName.length >= 4 && name === rName) return true;
        }
        return false;
      };

      let matching = trustServer
        ? rawResults.filter(rowMatchesLookup)
        : rawResults.filter(natMatchesResult);

      const afterExamFilter = matching.filter(isResultFromActiveExam);
      matching = (afterExamFilter.length > 0 ? afterExamFilter : matching).map(enrichResult);

      matching.sort((a, b) => {
        const da = parseResultDate(a);
        const db = parseResultDate(b);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db - da;
      });

      matching = dedupeStudentResults(matching);
      matching = applyExamKeysToResults(matching, examsForRegrade.length ? examsForRegrade : allExams);

      if (matching.length > 0) {
        setAllResults(matching);
        const resolvedStudent =
          student || resolveStudentFromResultRow(matching[0], bySeatMap) || null;
        const natRaw = (
          resolvedStudent?.nationalId ||
          resolvedStudent?.national_id ||
          studentId.trim() ||
          ''
        ).toString().trim();
        setSearchedStudent({
          ...(resolvedStudent || {}),
          nationalId: natRaw || studentId.trim(),
          name: resolvedStudent?.name || matching[0]?.studentName || '',
          grade: resolvedStudent?.grade || resolvedStudent?.classroom || matching[0]?.studentGrade || '',
          seatNumber: resolvedStudent?.seatNumber || resolvedStudent?.seat_number || '',
          identifier: natRaw || studentId.trim(),
        });

        setLoading(false);
        setSearchProgress(null);

        void hydrateOmrResultsDetails(matching, (p) => {
          const step = Math.max(1, p.total);
          const pct = 88 + Math.min(11, Math.floor((p.loaded / step) * 11));
          setSearchProgress({
            phase: 'details',
            pct,
            primary: 'تحميل تفاصيل الإجابات في الخلفية…',
            secondary: `الدفعة ${p.loaded} من ${p.total}`,
          });
        })
          .then((withDetails) => {
            setAllResults(applyExamKeysToResults(withDetails, examsForRegrade.length ? examsForRegrade : allExams));
            setSearchProgress(null);
          })
          .catch((e) => {
            console.warn('[بوابة الطالب] تعذر تحميل تفاصيل الأسئلة:', e);
            setSearchProgress(null);
          });

        void getMyRetakeRequestsForNational(natRaw)
          .then(setMyRetakes)
          .catch(() => setMyRetakes([]));
      } else {
        const hint = student
          ? ' الطالب مسجّل في النظام لكن لا توجد نتائج OMR معتمدة مربوطة بهويته أو جلوسه — من التطبيق الرئيسي: «مزامنة هويات البوابة» أو أعد اعتماد/ربط النتائج.'
          : ' تأكد من رقم الهوية في سجل الطلاب، أو نفّذ «مزامنة هويات البوابة» من صفحة اختبارات OMR.';
        setError(`عذراً، لم نتمكن من العثور على أي نتائج معتمدة لرقم الهوية هذا.${hint}`);
      }
    } catch (err) {
      if (err && err.code === 'PORTAL_FAST_PATH_FAILED') {
        setError(err.message);
      } else if (err && err.code === 'SUPABASE_FETCH') {
        const tech = [err.pgCode, err.pgMessage].filter(Boolean).join(' — ');
        setError(
          [
            'تعذر تحميل نتائج الاختبارات من الخادم.',
            tech ? `(${tech})` : null,
            `تأكد أن المشروع يطابق: ${supabaseUrl}`,
            'راجع سياسات RLS لـ omr_results و students، واتصال الإنترنت.',
          ]
            .filter(Boolean)
            .join(' ')
        );
      } else {
        setError('حدث خطأ أثناء البحث عن النتيجة.');
      }
    } finally {
      setLoading(false);
      setSearchProgress(null);
    }
  };

  /* طلب إعادة نشط للاثنين القادم فقط (لا يمنع طلب جديد بعد إعادة الأحد) */
  const findActiveRetakeFor = (result) =>
    myRetakes.find((r) => retakeMatchesResult(r, result) && isRetakeForUpcomingMonday(r));

  const findPastRetakesFor = (result) =>
    myRetakes
      .filter((r) => retakeMatchesResult(r, result) && !isRetakeForUpcomingMonday(r))
      .sort((a, b) => new Date(b.scheduledDate || 0) - new Date(a.scheduledDate || 0));

  /* Submit a retake request from a result */
  const handleRequestRetake = async (result) => {
    if (!searchedStudent) throw new Error('No student context');
    const pastCount = findPastRetakesFor(result).length;
    const payload = {
      studentId: searchedStudent.id || result.studentId || '',
      studentName: searchedStudent.name || result.studentName || '',
      studentGrade: searchedStudent.grade || result.studentGrade || '',
      nationalId: searchedStudent.nationalId || result.nationalId || '',
      seatNumber: searchedStudent.seatNumber || '',
      examId: result.examId != null ? String(result.examId) : '',
      examTitle: String(result.examTitle || '').trim(),
      originalScore: result.score,
      originalTotal: result.total,
      originalPercentage: Math.round(result.percentage),
      originalResultId: result.id || null,
      retakeAttempt: pastCount + 1,
    };
    const created = await requestRetake(payload);
    setMyRetakes((prev) => [...prev, created]);
  };

  /* ── Filtered results (only shown after subject is selected) ── */
  const filteredResults = useMemo(() => {
    if (!allResults) return [];
    if (!filterText.trim()) return [];
    const target = filterText.trim();
    return allResults.filter(r => {
      const title = (displayExamTitle(r) || '').trim();
      return title === target;
    });
  }, [allResults, filterText]);

  const schoolName = config?.schoolName || 'متوسطة وثانوية نخبة الشمال الأهلية';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-indigo-950 font-sans" dir="rtl">
      <div className="p-4 sm:p-6">
        <div className="print:hidden">
          {/* Page Header */}
          <header className="max-w-4xl mx-auto py-8 sm:py-12">
            <div className="flex items-center justify-center gap-3 sm:gap-5 mb-4 flex-wrap">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-2xl p-1.5 shadow-xl border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src="/school_logo.jpeg"
                  alt="شعار المدرسة"
                  className="w-full h-full object-contain"
                  onError={e => { e.target.src = 'https://ui-avatars.com/api/?name=S&background=1e1b4b&color=fff'; }}
                />
              </div>
              <h1 className="text-xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight font-header leading-snug text-right">
                نتائج <span className="text-indigo-700">اختبارات الفترة الثانية من الفصل الدراسي الثاني</span>
              </h1>
            </div>
            <p className="text-sm sm:text-base text-slate-500 font-bold max-w-lg mx-auto leading-relaxed text-center">
              أدخل رقم الهوية فقط (لا يُقبل رقم الجلوس للاستعلام).
            </p>
          </header>

          {/* Search Box */}
          <main className="max-w-xl mx-auto mb-12 sm:mb-16 relative">
            <div className="absolute -top-12 -left-12 w-64 h-64 bg-indigo-200/20 blur-3xl rounded-full" />
            <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-slate-200/20 blur-3xl rounded-full" />

            <div className="luxury-card p-5 sm:p-10 md:p-14 border border-white shadow-2xl relative z-10 backdrop-blur-sm bg-white/90">
              <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-100 shadow-sm">
                  <Search className="text-indigo-600 w-8 h-8" />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-800">استعلم عن نتيجتك</h2>
              </div>

              <form onSubmit={handleSearch} className="space-y-5">
                <div className="relative group">
                  <input
                    type="text"
                    placeholder="أدخل رقم الهوية..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 sm:py-5 px-4 sm:px-6 pt-7 sm:pt-8 text-base sm:text-xl font-bold focus:border-indigo-600 focus:bg-white outline-none transition-all shadow-sm"
                    value={studentId}
                    onChange={e => setStudentId(e.target.value)}
                  />
                  <label className="absolute right-6 top-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">رقم الهوية</label>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-indigo-950 text-white py-4 sm:py-5 rounded-2xl font-black text-base sm:text-xl shadow-xl shadow-indigo-900/20 hover:bg-indigo-900 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3">
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>جاري المراجعة...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                      <span>عــرض النـتـيـجـة</span>
                    </>
                  )}
                </button>
              </form>

              {loading && searchProgress && (
                <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-4 text-right shadow-inner">
                  <div className="h-2.5 w-full rounded-full bg-white overflow-hidden mb-3 border border-indigo-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-indigo-600 to-indigo-400 transition-[width] duration-500 ease-out"
                      style={{ width: `${Math.min(100, Math.max(3, searchProgress.pct))}%` }}
                    />
                  </div>
                  <p className="text-sm font-black text-indigo-950 leading-snug">{searchProgress.primary}</p>
                  {searchProgress.secondary ? (
                    <p className="text-xs font-bold text-indigo-700/90 mt-1.5 tabular-nums">{searchProgress.secondary}</p>
                  ) : null}
                </div>
              )}

              {error && (
                <div className="mt-8 flex items-center gap-4 text-red-600 bg-red-50 p-5 rounded-2xl font-bold border border-red-100 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* ── Results Section ── */}
        {allResults && allResults.length > 0 && (
          <div className="max-w-4xl mx-auto mb-16 sm:mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700">

            {/* 1. Filter Bar */}
            <FilterBar
              results={allResults}
              filterText={filterText}
              setFilterText={setFilterText}
              filtered={filteredResults}
            />

            {/* 2. Results list (only after subject selection) */}
            {!filterText.trim() ? (
              <div className="luxury-card p-16 text-center bg-slate-50/50 border-2 border-dashed border-slate-200">
                <BookOpen className="mx-auto text-indigo-300 mb-4 w-12 h-12" />
                <h3 className="text-xl font-black text-slate-500">يرجى اختيار المادة لعرض النتيجة</h3>
                <p className="mt-2 text-sm font-bold text-slate-400">حدد المادة من القائمة المنسدلة بالأعلى</p>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="luxury-card p-16 text-center bg-slate-50/50 border-2 border-dashed border-slate-200">
                <Filter className="mx-auto text-slate-200 mb-4 w-12 h-12" />
                <h3 className="text-xl font-black text-slate-400">لا توجد نتائج لهذه المادة</h3>
                <button onClick={() => setFilterText('')}
                  className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all">
                  اختيار مادة أخرى
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredResults.map((r, i) => (
                  <ResultSlip
                    key={r.id || i}
                    result={r}
                    schoolName={schoolName}
                    index={i}
                    retakeRequest={findActiveRetakeFor(r)}
                    pastRetakes={findPastRetakesFor(r)}
                    onRequestRetake={handleRequestRetake}
                    portalNationalId={searchedStudent?.nationalId || ''}
                    portalSeatNumber={searchedStudent?.seatNumber != null ? String(searchedStudent.seatNumber) : ''}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="py-12 border-t border-slate-200 text-center print:hidden">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Elite Control Smart System</p>
          <div className="flex justify-center gap-8 text-slate-300">
            {[1,2,3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-current" />)}
          </div>
        </div>
      </footer>
    </div>
  );
}
