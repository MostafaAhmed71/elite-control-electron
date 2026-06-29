import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Upload, FileImage, CheckCircle, AlertCircle, Loader2, ListFilter, X, BadgeCheck, Trash2, 
  ChevronDown, ChevronUp, Edit3, MessageCircle, ScanLine, Wifi, WifiOff, Printer, Eye,
  Settings, Info, AlertTriangle, CheckCircle2, Play, Download, History, Clock, Fingerprint,
  RefreshCcw, UserCheck, ArrowRight, Image as ImageIcon, Users, Search, Table2
} from 'lucide-react';
import {
  printAggregatedGradesSheet,
  resultsFromScanItems,
  resolveResultClass,
  resolveResultSubject,
} from '../../utils/aggregatedGradesPrint';
import { getOmrExams, saveOmrResult, getStudents, saveStudent, OMR_API_BASE, getWhatsAppApiBase } from '../../utils/dataService';
import {
  normalizeStudentId,
  findStudentByDetectedId,
  resolveOmrStudentFields,
  effectiveOmrScanTemplate,
} from '../../utils/studentIdentity';
import { grade } from '../../utils/omrGrading';
import { useToast } from '../../components/Toast';

/* ── Audit Trail Timeline Component ── */
const AuditTrailModal = ({ isOpen, onClose, auditData, studentName }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-8 bg-indigo-600 text-white relative overflow-hidden">
           <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
           <div className="flex justify-between items-center relative z-10">
              <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                    <History size={24} />
                 </div>
                 <div>
                    <h3 className="font-header font-black text-xl">سجل التدقيق الرقمي</h3>
                    <p className="text-indigo-100/70 text-[10px] font-bold uppercase tracking-widest mt-1">Audit Trail & Digital Integrity</p>
                 </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                 <X size={20} />
              </button>
           </div>
        </div>

        {/* Info Bar */}
        <div className="px-8 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
           <div className="text-[11px] font-black text-indigo-400 uppercase tracking-wider">اسم الطالب: <span className="text-indigo-600">{studentName || 'غير معروف'}</span></div>
           <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              <Fingerprint size={10} /> مُؤمّن رقمياً
           </div>
        </div>

        {/* Timeline Content */}
        <div className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
           {(!auditData || auditData.length === 0) ? (
             <div className="text-center py-10">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200">
                   <Clock size={24} className="text-slate-300" />
                </div>
                <p className="text-slate-400 font-bold text-sm">لا توجد عمليات مسجلة متقدمة لهذه الورقة</p>
             </div>
           ) : (
             <div className="relative border-r-2 border-slate-100 pr-8 space-y-10">
                {auditData.map((log, idx) => (
                  <div key={idx} className="relative">
                    {/* Dot */}
                    <div className={`absolute -right-[41px] top-0 w-5 h-5 rounded-full border-4 border-white shadow-sm transition-all z-10
                      ${log.action === 'system_scan' ? 'bg-indigo-500 ring-4 ring-indigo-50' : 
                        log.action === 'approve' ? 'bg-emerald-500 ring-4 ring-emerald-50' : 
                        'bg-amber-500 ring-4 ring-amber-50'}`}>
                    </div>
                    
                    {/* Entry Header */}
                    <div className="flex justify-between items-start mb-2">
                       <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                          {log.action === 'system_scan' && <ScanLine size={14} className="text-indigo-400" />}
                          {log.action === 'approve' && <UserCheck size={14} className="text-emerald-400" />}
                          {log.action === 'edit' && <Edit3 size={14} className="text-amber-400" />}
                          {log.action === 'unapprove' && <RefreshCcw size={14} className="text-rose-400" />}
                          {log.action === 'system_scan' ? 'المسح الضوئي الأولي' : 
                           log.action === 'approve' ? 'اعتماد النتائج' : 
                           log.action === 'edit' ? 'تعديل يدوي' : 
                           log.action === 'unapprove' ? 'إلغاء الاعتماد' : log.action}
                       </h4>
                       <span className="text-[10px] font-black font-mono text-slate-300">{new Date(log.ts).toLocaleString('ar-SA')}</span>
                    </div>

                    {/* Entry Bubble */}
                    <div className="luxury-card p-4 bg-slate-50/50 border-none shadow-none text-xs leading-relaxed text-slate-600">
                       <div className="mb-2 font-bold text-slate-400 flex items-center gap-1.5 border-b border-slate-100 pb-2 mb-2">
                          <Fingerprint size={12} /> القائم بالعملية: <span className="text-slate-700">{log.user || 'System'}</span>
                       </div>
                       <p className="font-medium whitespace-pre-wrap">{log.details}</p>
                       {log.metrics && (
                         <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3">
                            <div><div className="text-[9px] text-slate-400 font-black">الموثوقية</div><div className="font-black text-indigo-600">{log.metrics.reliability_score}%</div></div>
                            <div><div className="text-[9px] text-slate-400 font-black">الثقة</div><div className="font-black text-blue-600">{(log.metrics.avg_confidence * 100).toFixed(0)}%</div></div>
                            <div><div className="text-[9px] text-slate-400 font-black">المراجعة</div><div className="font-black text-amber-600">{log.metrics.needs_review_count} Qs</div></div>
                         </div>
                       )}
                    </div>
                  </div>
                ))}
             </div>
           )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 text-center">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Digital Certificate of Authenticity — Elite OMR Control</p>
        </div>
      </div>
    </div>
  );
};

/* ── Helpers ── */
const STAGES = {
  'ابتدائي': ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي'],
  'متوسط': ['الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'],
  'ثانوي': ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'],
};

const getSchoolNameByStage = (stage = '') => {
  const s = String(stage || '').trim();
  if (s === 'ابتدائي' || s === 'الابتدائي') {
    return 'مدارس نخبة الشمال الأهلية والعالمية';
  }
  return 'متوسطة وثانوية نخبة الشمال الأهلية';
};

const REVIEW_REASON_AR = {
  no_bubble_signal: 'لا يوجد قياس كافٍ للدوائر',
  weak_blank_reading: 'قراءة فراغ غير مؤكدة',
  ambiguous_mark: 'تظليل متعارض أو غير واضح',
  low_confidence: 'ثقة القراءة متوسطة',
  erase_aware_uncertain: 'أثر مسح بجانب الإجابة',
  unstable_jitter: 'تغيّر القراءة مع إزاحة بسيطة للورقة',
  pass_confidence_gap: 'فرق كبير بين مرورَي القراءة',
  double_pass_mismatch: 'اختلاف بين القراءة العادية والصارمة',
  sheet_quality_low: 'جودة الصورة منخفضة',
  alignment_failed: 'فشل في محاذاة الورقة (تأكد من الطباعة)',
  grid_auto_aligned: 'تمت معايرة شبكة الدوائر تلقائياً',
  extreme_blur: 'الصورة مهتزة جداً وغير واضحة',
  low_sharpness: 'وضوح الصورة ضعيف',
  too_dark: 'الإضاءة خافتة جداً (الصورة مظلمة)',
  low_brightness: 'إضاءة الصورة ضعيفة',
  low_contrast: 'تباين الألوان ضعيف',
};

function formatReviewReasonTags(tags) {
  if (!tags?.length) return 'يُنصح بمراجعة يدوية';
  return tags.map(t => REVIEW_REASON_AR[t] || t).join(' · ');
}

const MANUAL_STUDENT_MAP_KEY = 'omr_manual_student_map';

const getManualStudentMap = () => {
  try {
    const raw = localStorage.getItem(MANUAL_STUDENT_MAP_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveManualStudentMap = (mapObj) => {
  try {
    localStorage.setItem(MANUAL_STUDENT_MAP_KEY, JSON.stringify(mapObj || {}));
  } catch {
    // ignore storage quota errors
  }
};

const hashFileSha256 = async (file) => {
  if (!file || !window?.crypto?.subtle) return '';
  const buf = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex;
};

/* ── Session Analytics Dashboard ── */
const SessionDashboard = ({
  items,
  batchTimer,
  onConfirmAll,
  onConfirmReviewed,
  onPrintConfirmed,
  onPrintAggregated,
  safeCount,
  reviewCount,
  confirmedCount,
}) => {
  if (items.length === 0) return null;

  const validItems = items.filter(it => it.result && !it.error);
  const total = items.length;
  const rejected = validItems.filter(it => it.result.decisionStatus === 'REJECTED_QUALITY').length;

  const avgConf = validItems.length > 0 
    ? (validItems.reduce((acc, it) => acc + (it.result.average_confidence || 0), 0) / validItems.length)
    : 0;
  const avgReliability = validItems.length > 0
    ? (validItems.reduce((acc, it) => acc + (it.result.reliability_score || 0), 0) / validItems.length)
    : 0;

  const getReliabilityGrade = (score) => {
    if (score >= 90) return { label: 'A', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
    if (score >= 80) return { label: 'B', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
    if (score >= 70) return { label: 'C', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
    return { label: 'D', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' };
  };

  const grade = getReliabilityGrade(avgReliability);

  return (
    <div className="luxury-card overflow-hidden border-none mb-10 bg-white">
      <div className="bg-indigo-600 p-5 text-white flex justify-between items-center relative overflow-hidden">
        {/* Abstract background shape for flair */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
            <BadgeCheck size={22} />
          </div>
          <div>
            <h3 className="font-header font-black text-lg tracking-tight">لوحة مراقبة الجودة والتحكم في الدفعة</h3>
            <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest mt-0.5 opacity-80">Batch Performance Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold relative z-10">
           {batchTimer.running && (
             <span className="flex items-center gap-2 bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-md">
               <Loader2 size={12} className="animate-spin" /> جاري التحليل...
             </span>
           )}
           <span className="bg-indigo-700/50 px-3 py-1.5 rounded-full">{new Date().toLocaleDateString('ar-SA')}</span>
        </div>
      </div>
      
      <div className="p-8 grid grid-cols-1 md:grid-cols-4 gap-8 border-b border-slate-50">
        {/* Session Reliability Grade */}
        <div className="luxury-card flex flex-col items-center justify-center p-6 bg-slate-50/50 border-none shadow-none">
           <div className={`w-24 h-24 rounded-[2rem] flex flex-col items-center justify-center border-2 ${grade.border} ${grade.bg} shadow-lg shadow-black/5`}>
              <span className={`text-4xl font-black font-header ${grade.color}`}>{grade.label}</span>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Reliability</span>
           </div>
           <div className="mt-4 text-center">
              <div className="text-sm font-black text-slate-800 font-header">موثوقية الجلسة</div>
              <div className="inline-block mt-1 px-3 py-0.5 bg-white rounded-full border border-slate-100 text-[10px] font-bold text-slate-400">
                Score: {avgReliability.toFixed(1)}%
              </div>
           </div>
        </div>

        {/* Core Metrics */}
        <div className="space-y-6 col-span-1 md:col-span-2">
           <div className="grid grid-cols-2 gap-6">
              <div className="luxury-card p-6 bg-white shadow-sm border-slate-100 relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-full -translate-y-1/2 translate-x-1/2 opacity-60"></div>
                 <div className="text-[11px] font-black text-blue-600 mb-2 flex items-center gap-2 relative z-10">
                   <Wifi size={14} /> متوسط الثقة بالبيانات
                 </div>
                 <div className="text-4xl font-black text-slate-900 tracking-tighter relative z-10 font-header">{(avgConf * 100).toFixed(1)}<span className="text-lg opacity-30">%</span></div>
                 <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden relative z-10">
                    <div className="bg-blue-500 h-full rounded-full transition-all duration-1000" style={{ width: `${avgConf * 100}%` }}></div>
                 </div>
              </div>
              <div className="luxury-card p-6 bg-white shadow-sm border-slate-100 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-50 rounded-full -translate-y-1/2 translate-x-1/2 opacity-60"></div>
                 <div className="text-[11px] font-black text-emerald-600 mb-2 flex items-center gap-2 relative z-10">
                   <CheckCircle2 size={14} /> نسبة النجاح المحقق
                 </div>
                 <div className="text-4xl font-black text-slate-900 tracking-tighter relative z-10 font-header">{(confirmedCount / total * 100).toFixed(0)}<span className="text-lg opacity-30">%</span></div>
                 <div className="text-[10px] font-bold text-emerald-600/70 mt-3 relative z-10">
                    تم اعتماد وتثبيت {confirmedCount} من {total} ورقة
                 </div>
              </div>
           </div>
           
           <div className="luxury-card p-5 bg-slate-50/50 border-slate-100/50 flex items-center justify-between shadow-none">
              <div className="flex gap-8 px-4">
                <div className="text-center">
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">آمن تلقائياً</div>
                   <div className="text-2xl font-black text-emerald-600 tracking-tight">{safeCount}</div>
                </div>
                <div className="text-center border-x border-slate-200 px-8">
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">يحتاج مراجعة</div>
                   <div className="text-2xl font-black text-amber-500 tracking-tight">{reviewCount}</div>
                </div>
                <div className="text-center">
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">مرفوض جودة</div>
                   <div className="text-2xl font-black text-rose-500 tracking-tight">{rejected}</div>
                </div>
              </div>
              {batchTimer.lastBatchMs && (
                <div className="text-left border-r border-slate-200 pr-6">
                   <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">سرعة المعالجة</div>
                   <div className="text-lg font-black text-indigo-600">
                     {(batchTimer.lastBatchMs / 1000).toFixed(1)}<span className="text-xs opacity-40 mx-0.5">s</span>
                     <span className="text-slate-400 text-[10px] font-bold">/batch</span>
                   </div>
                </div>
              )}
           </div>
        </div>

        {/* Guidance Column */}
        <div className="flex flex-col gap-3">
           {reviewCount > 0 && (
             <div className="p-4 bg-amber-50/60 text-amber-700 rounded-2xl border border-amber-100 text-[11px] leading-relaxed relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-1 h-full bg-amber-400 opacity-60"></div>
                <div className="flex items-center gap-2 mb-2 font-black">
                   <AlertTriangle size={14} /> توجيه تدقيق
                </div>
                يوجد <strong className="text-sm">{reviewCount} ورقة</strong> تتطلب لمسة بشرية لضمان دقة كاملة. يرجى تدقيق الدوائر المظللة بالبرتقالي.
             </div>
           )}
           {total > 0 && (
             <div className="p-4 bg-indigo-50/60 text-indigo-700 rounded-2xl border border-indigo-100 text-[11px] leading-relaxed relative overflow-hidden">
                <div className="absolute top-0 right-0 w-1 h-full bg-indigo-400 opacity-60"></div>
                <div className="flex items-center gap-2 mb-2 font-black">
                   <Info size={14} /> حالة البيانات
                </div>
                تم مسح {total} ورقة بنجاح. متوسط الموثوقية هو {avgReliability.toFixed(1)}%. النظام يعمل في الوضع الهجين لضمان السرعة والدقة.
             </div>
           )}
        </div>
      </div>

      {/* Batch Control Footer */}
      <div className="bg-slate-50/30 p-5 px-8 flex items-center justify-between gap-4">
        <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Global Batch Actions</div>
        <div className="flex items-center gap-4">
            {confirmedCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={onPrintConfirmed}
                  className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 text-slate-600 rounded-2xl text-xs font-bold transition-all shadow-sm active:scale-95"
                >
                  <Printer size={16} /> طباعة كشوف المعتمدين ({confirmedCount})
                </button>
                <button
                  type="button"
                  onClick={onPrintAggregated}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-emerald-100 active:scale-95"
                >
                  <Table2 size={16} /> كشف درجات مجمع ({confirmedCount})
                </button>
              </>
            )}
            {safeCount > 0 && (
              <button type="button" onClick={onConfirmAll}
                className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold transition-all shadow-xl shadow-emerald-100 active:scale-95">
                <BadgeCheck size={18} /> اعتماد النتائج الآمنة ({safeCount})
              </button>
            )}
            {reviewCount > 0 && (
              <button type="button" onClick={onConfirmReviewed}
                className="flex items-center gap-2 px-8 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-bold transition-all shadow-xl shadow-amber-100 active:scale-95">
                <BadgeCheck size={18} /> اعتماد ورقات المراجعة ({reviewCount})
              </button>
            )}
        </div>
      </div>
    </div>
  );
};

/* ── Print Result Slip ── */
const printResultSlip = (items, exam) => {
  const confirmed = Array.isArray(items) ? items : [items];
  if (!confirmed.length) return;
  const schoolName = getSchoolNameByStage(exam?.stage);

  const getLetterAr = (l) => ({ A: 'أ', B: 'ب', C: 'ج', D: 'د' }[l] || l || '—');
  const getGradeLabel = (pct) => {
    const p = parseFloat(pct);
    if (p >= 90) return { label: 'ممتاز', color: '#16a34a' };
    if (p >= 80) return { label: 'جيد جداً', color: '#2563eb' };
    if (p >= 70) return { label: 'جيد', color: '#7c3aed' };
    if (p >= 60) return { label: 'مقبول', color: '#d97706' };
    return { label: 'ضعيف', color: '#dc2626' };
  };

  const slips = confirmed.map(item => {
    const r = item.result;
    const g = getGradeLabel(r.percentage);
    const details = r.details || {};
    const qs = Object.keys(details).sort((a, b) => parseInt(a) - parseInt(b));

    // Split questions into two columns (Q1-15 right, Q16-30 left — RTL)
    const col1 = qs.filter(q => parseInt(q) <= 15);
    const col2 = qs.filter(q => parseInt(q) > 15);
    const maxRows = Math.max(col1.length, col2.length);

    const rows = Array.from({ length: maxRows }, (_, i) => {
      const q1 = col1[i]; const q2 = col2[i];
      const d1 = q1 ? details[q1] : null;
      const d2 = q2 ? details[q2] : null;
      return { q1, d1, q2, d2 };
    });

    const tableRows = rows.map(({ q1, d1, q2, d2 }) => `
      <tr>
        ${q2 ? `
          <td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center;font-weight:bold;color:${d2.is_correct ? '#15803d' : '#dc2626'}">${d2.is_correct ? `+${d2.weight}` : '✗'}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center">${getLetterAr(d2.correct_option)}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center;font-weight:bold">${getLetterAr(d2.student_answer)}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center;background:#f8fafc;font-weight:bold;color:#1e293b">${q2} <span style="font-size:8px;color:#94a3b8">(${d2.weight}ن)</span></td>
        ` : '<td colspan="4" style="border:1px solid #e5e7eb"></td>'}
        <td style="border:1px solid #e5e7eb;width:20px;background:#f1f5f9"></td>
        ${q1 ? `
          <td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center;font-weight:bold;color:${d1.is_correct ? '#15803d' : '#dc2626'}">${d1.is_correct ? `+${d1.weight}` : '✗'}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center">${getLetterAr(d1.correct_option)}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center;font-weight:bold">${getLetterAr(d1.student_answer)}</td>
          <td style="border:1px solid #e5e7eb;padding:5px 8px;text-align:center;background:#f8fafc;font-weight:bold;color:#1e293b">${q1} <span style="font-size:8px;color:#94a3b8">(${d1.weight}ن)</span></td>
        ` : '<td colspan="4" style="border:1px solid #e5e7eb"></td>'}
      </tr>`);

    return `
    <div class="slip" style="page-break-after:always;padding:28px 32px;font-family:'Segoe UI',Arial,sans-serif;direction:rtl;max-width:750px;margin:0 auto;box-sizing:border-box">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;border-radius:12px;padding:18px 24px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:18px;font-weight:900;letter-spacing:0.5px">${schoolName}</div>
          <div style="font-size:12px;opacity:0.85;margin-top:4px">نظام التصحيح الآلي OMR — نتيجة الاختبار</div>
        </div>
        <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:10px 16px;text-align:center">
          <div style="font-size:30px;font-weight:900">${r.score}/${r.total}</div>
          <div style="font-size:12px;opacity:0.85">${parseFloat(r.percentage).toFixed(1)}%</div>
        </div>
      </div>

      <!-- Student Info -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><span style="color:#64748b;font-size:12px">اسم الطالب</span><br><strong style="font-size:15px;color:#1e293b">${r.studentName}</strong></div>
        <div><span style="color:#64748b;font-size:12px">الصف</span><br><strong style="font-size:14px;color:#1e293b">${r.studentGrade || '—'}</strong></div>
        <div><span style="color:#64748b;font-size:12px">الاختبار</span><br><strong style="font-size:13px;color:#1e293b">${r.examTitle || exam?.title || '—'}</strong></div>
        <div><span style="color:#64748b;font-size:12px">الرقم التعريفي</span><br><strong style="font-size:13px;color:#475569;font-family:monospace">${r.studentId}</strong></div>
      </div>

      <!-- Score Visual -->
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;background:#fff;border:2px solid ${g.color}22;border-radius:12px;padding:14px 20px">
        <div style="font-size:42px;font-weight:900;color:${g.color};line-height:1">${r.score}<span style="font-size:18px;color:#94a3b8">/${r.total}</span></div>
        <div style="flex:1">
          <div style="background:#f1f5f9;border-radius:999px;height:10px;overflow:hidden">
            <div style="height:100%;width:${r.percentage}%;background:${g.color};border-radius:999px"></div>
          </div>
          <div style="margin-top:6px;font-size:13px;color:${g.color};font-weight:700">${g.label} — ${parseFloat(r.percentage).toFixed(1)}%</div>
        </div>
        <div style="background:${g.color}15;color:${g.color};font-size:22px;font-weight:900;padding:10px 18px;border-radius:10px;border:2px solid ${g.color}30">${g.label}</div>
      </div>

      <!-- Answers Table -->
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#1e3a5f;color:#fff">
            <th style="padding:8px;border:1px solid #2d5a9e">النتيجة</th>
            <th style="padding:8px;border:1px solid #2d5a9e">الصواب</th>
            <th style="padding:8px;border:1px solid #2d5a9e">إجابتك</th>
            <th style="padding:8px;border:1px solid #2d5a9e">السؤال</th>
            <th style="padding:8px;border:1px solid #2d5a9e;background:#172d50"></th>
            <th style="padding:8px;border:1px solid #2d5a9e">النتيجة</th>
            <th style="padding:8px;border:1px solid #2d5a9e">الصواب</th>
            <th style="padding:8px;border:1px solid #2d5a9e">إجابتك</th>
            <th style="padding:8px;border:1px solid #2d5a9e">السؤال</th>
          </tr>
        </thead>
        <tbody>${tableRows.join('')}</tbody>
      </table>

      <!-- Footer -->
      <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;border-top:2px dashed #e2e8f0;padding-top:12px">
        <div style="font-size:11px;color:#94a3b8">تاريخ التصحيح: ${new Date(r.timestamp || Date.now()).toLocaleDateString('ar-SA')}</div>
        <div style="background:#dcfce7;color:#15803d;font-weight:900;font-size:13px;padding:6px 16px;border-radius:8px;border:2px solid #86efac">✅ معتمد</div>
        <div style="font-size:11px;color:#94a3b8">نظام OMR — نخبة الشمال</div>
      </div>
    </div>`;
  }).join('');

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
    <meta charset="UTF-8">
    <title>نتائج الاختبار</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; }
      @media print {
        body { background: white; }
        .no-print { display: none !important; }
        .slip { page-break-after: always; }
      }
    </style>
  </head><body>
    <div class="no-print" style="background:#1e3a5f;color:white;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:99">
      <span style="font-weight:700">🖨️ طباعة ${confirmed.length} نتيجة</span>
      <button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:8px 20px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px">🖨️ طباعة الآن</button>
    </div>
    ${slips}
  </body></html>`);
  win.document.close();
};

const dedupeConfirmedForPrint = (list) => {
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const r = it?.result || it;
    if (!r) continue;
    const sid = normalizeStudentId(r.studentId || r.detectedStudentId || r.normalizedDetectedStudentId || '');
    const ex  = (r.examId || '').toString().trim();
    const name = (r.studentName || '').toString().trim();
    const key = `${ex}::${sid || name || 'unknown'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
};

const scanImage = async (file, template = 'default', numQuestions = 30, scanMode = 'hybrid', fromScanner = true) => {
  const fd = new FormData();
  fd.append('file', file);
  const scanTemplate = effectiveOmrScanTemplate(template);
  const res = await fetch(
    `${OMR_API_BASE}/scan?template=${scanTemplate}&num_questions=${numQuestions}&scan_mode=${scanMode}&from_scanner=${fromScanner ? '1' : '0'}`,
    { method: 'POST', body: fd }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'فشل المسح');
  }
  return res.json();
};

const revokePreviewUrl = (url) => {
  if (!url || typeof url !== 'string') return;
  if (url.startsWith('blob:')) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
};

/* ── Card for a single scanned sheet ── */
const SheetCard = React.memo(({ item, onConfirm, onUnconfirm, onRemove, onAnswerEdit, onSendWhatsapp, onPrint, onShowAudit, onPreview, onResolveUnknown, exam }) => {
  const [expanded, setExpanded] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState(null);
  const isConfirmed = item.confirmed;
  const reviewCount = item.result?.needsReviewQuestions?.length || 0;
  const decision = item.result?.decisionStatus || 'REVIEW_REQUIRED';
  const isRejected = decision === 'REJECTED_QUALITY';
  const mismatchWarning = item.result?.qualityFlags?.includes('num_questions_mismatch');
  const lowQualityWarning = item.result?.qualityFlags?.includes('quality_gate_reject');
  const isUnknownStudent = item.result?.studentName === 'طالب غير معرف';

  return (
    <div className={`luxury-card border-none transition-all overflow-hidden bg-white group/card
      ${isConfirmed ? 'ring-2 ring-emerald-500/20' : item.error ? 'ring-2 ring-red-500/10' : 'hover:shadow-indigo-100/50 hover:shadow-2xl'}`}>

      {/* Card Header */}
      <div className="p-6 flex items-center gap-5">
        {/* Status Avatar */}
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border transition-all duration-500
          ${isConfirmed ? 'bg-emerald-50 text-emerald-600 border-emerald-100 rotate-3' : item.error ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-slate-50 text-indigo-600 border-slate-100 group-hover/card:-translate-y-1'}`}>
          {item.loading ? <Loader2 size={24} className="animate-spin" /> :
            isConfirmed ? <BadgeCheck size={30} /> :
              item.error ? <AlertCircle size={28} /> :
                item.fromScanner ? <ScanLine size={28} /> :
                  <FileImage size={28} />}
        </div>

        {/* Student Info */}
        <div className="flex-1 min-w-0">
          <div className="font-header font-black text-slate-800 truncate flex items-center gap-2 text-lg">
            {item.result?.studentName || (item.fromScanner ? `ورقة مسح ${item.page || ''}` : item.file?.name || 'ورقة')}
            {isUnknownStudent && (
              <button
                type="button"
                onClick={() => onResolveUnknown?.(item.id)}
                className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-black hover:bg-amber-100 transition-colors"
                title="تعيين الطالب يدوياً"
              >
                تعديل بيانات الطالب
              </button>
            )}
            {item.fromScanner && (
              <span className="text-[9px] font-black px-2 py-1 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 uppercase tracking-widest">Scanner</span>
            )}
          </div>
          {item.result && (
            <div className="text-[11px] text-slate-400 font-bold mt-1 flex items-center gap-3">
              {item.result.studentGrade && (
                <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">{item.result.studentGrade}</span>
              )}
              <span className="font-mono tracking-widest text-slate-300">ID: {item.result.studentId}</span>
            </div>
          )}
          {item.result && (
            <div className="text-[11px] text-slate-500 font-bold mt-1.5 flex flex-wrap items-center gap-2">
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md">
                رقم الطالب المقروء: <span className="font-mono">{item.result.detectedStudentId || '—'}</span>
              </span>
              {item.result.normalizedDetectedStudentId && (
                <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md">
                  بعد التطبيع: <span className="font-mono">{item.result.normalizedDetectedStudentId}</span>
                </span>
              )}
            </div>
          )}
          
          {item.result && !item.error && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black border transition-all ${
                decision === 'AUTO_ACCEPTED'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : decision === 'REJECTED_QUALITY'
                    ? 'bg-rose-50 text-rose-700 border-rose-100'
                    : 'bg-amber-50 text-amber-700 border-amber-100'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${decision === 'AUTO_ACCEPTED' ? 'bg-emerald-500' : decision === 'REJECTED_QUALITY' ? 'bg-rose-500' : 'bg-amber-500'} animate-pulse`}></div>
                {decision === 'AUTO_ACCEPTED' ? 'جاهز للاعتماد' : decision === 'REJECTED_QUALITY' ? 'مرفوض كلياً' : 'يتطلب تدقيق'}
              </span>
              
              {reviewCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[10px] font-black">
                  <AlertTriangle size={12} />
                  {reviewCount} فقاعة غير واضحة
                </span>
              )}
            </div>
          )}
          
          {item.result && !item.error && decision === 'REJECTED_QUALITY' && (
            <div className="mt-3 space-y-1.5">
              {item.result.qualityFlags?.map(flag => (
                <div key={flag} className="text-[10px] text-rose-600 font-black flex items-center gap-2 bg-rose-50/50 p-2 rounded-xl border border-rose-100">
                  <AlertTriangle size={14} />
                  {REVIEW_REASON_AR[flag] || flag}
                </div>
              ))}
            </div>
          )}
          {item.error && <div className="text-xs text-rose-500 font-bold mt-2 bg-rose-50 p-2 rounded-xl border border-rose-100">{item.error}</div>}
        </div>

        {/* Score Radial/Vertical Badge */}
        {item.result && !item.error && (
          <div className="flex flex-col items-center gap-1 shrink-0 px-6 border-r border-slate-50">
            <div className={`text-3xl font-black font-header tracking-tighter ${parseFloat(item.result.percentage) >= 50 ? 'text-indigo-600' : 'text-rose-500'}`}>
              {item.result.score}<span className="text-sm opacity-30 mx-1">/</span>{item.result.total}
            </div>
            <div className="text-[11px] font-black text-slate-400 tracking-widest">{item.result.percentage}%</div>
            
            {/* Reliability Progress */}
            <div className="mt-3 w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden relative shadow-inner" title={`موثوقية النظام: ${item.result.reliability_score}%`}>
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${
                    item.result.reliability_score >= 90 ? 'bg-emerald-500' : 
                    item.result.reliability_score >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${item.result.reliability_score}%` }}
                ></div>
            </div>
            <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter mt-1">{item.result.reliability_score}% Reliable</span>
          </div>
        )}

        {/* Action Toolbar */}
        <div className="flex items-center gap-2 shrink-0 px-2">
          {item.result && !item.error && !isConfirmed && (
            <button type="button" onClick={() => setExpanded(v => !v)}
              className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all active:scale-95">
              {expanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
            </button>
          )}
          {item.result && !item.error && !isConfirmed && !isRejected && (
            <button type="button" onClick={() => onConfirm(item.id)}
              className={`flex items-center gap-2 px-5 py-3 text-white rounded-2xl text-xs font-black transition-all shadow-xl active:scale-95
                ${reviewCount > 0
                  ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100'
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'}`}>
              <BadgeCheck size={18} /> اعتماد
            </button>
          )}
          {isConfirmed && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-2xl text-xs font-black border border-emerald-100">
                <CheckCircle2 size={16} /> مُوثّق
              </span>
              <button
                type="button"
                onClick={() => onUnconfirm(item.id)}
                className="p-3 text-amber-500 hover:bg-amber-50 rounded-2xl text-xs font-bold transition-all active:scale-95 border border-transparent hover:border-amber-100"
                title="تراجع عن الاعتماد"
              >
                <RefreshCcw size={18} />
              </button>
            </div>
          )}
          
          {(item.previewUrl || item.result?.systemViewImage) && (
            <button
              type="button"
              onClick={() => onPreview(item)}
              className="p-3 bg-slate-800 text-white rounded-2xl hover:bg-slate-900 transition-all shadow-lg shadow-slate-200 active:scale-95"
              title="رؤية معالجة النظام للورقة"
            >
              <Eye size={20} />
            </button>
          )}
          
          <button type="button" onClick={() => onRemove(item.id)}
            className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all active:scale-95">
            <Trash2 size={20} />
          </button>
          
          {item.result && (
            <button
              type="button"
              onClick={() => onShowAudit(item)}
              className="p-3 text-indigo-400 hover:bg-indigo-50 rounded-2xl transition-all active:scale-95"
              title="عرض سجل العمليات والتدقيق"
            >
              <History size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Expandable Answer Grid */}
      {expanded && item.result && !item.error && (
        <div className="border-t border-gray-100 p-4 bg-slate-50/50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider">تفاصيل الإجابات</h4>
            <div className="flex items-center gap-2">
              {reviewCount > 0 && (
                <span className="text-xs text-amber-600 font-bold flex items-center gap-1">
                  <AlertCircle size={11} /> أسئلة تحتاج مراجعة: {reviewCount}
                </span>
              )}
              <span className="text-xs text-indigo-500 font-bold flex items-center gap-1">
                <Edit3 size={11} /> اضغط على الإجابة لتعديلها
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
            {Object.entries(item.result.details).map(([q, ans]) => (
              <div key={q} className="relative group/cell">
                {editingAnswer === q ? (
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[10px] text-center text-gray-400 font-bold">Q{q}</div>
                    <select autoFocus
                      className="w-full text-center p-1 text-xs font-bold rounded-lg border-2 border-indigo-400 bg-white"
                      defaultValue={ans.student_answer}
                      onChange={e => { onAnswerEdit(item.id, q, e.target.value); setEditingAnswer(null); }}
                      onBlur={() => setEditingAnswer(null)}>
                      <option value="">-</option>
                      {['A', 'B', 'C', 'D'].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ) : (
                  (() => {
                    const qNum = parseInt(q, 10);
                    const isReview = item.result?.needsReviewQuestions?.includes(qNum);
                    const qConfidence = item.result?.confidence?.[q];
                    const reviewNote = formatReviewReasonTags(item.result?.reviewReasons?.[q]);
                    return (
                  <div className="flex flex-col gap-0.5 w-full">
                    {isReview && (
                      <div
                        className="text-[8px] font-bold text-amber-800 text-center leading-tight px-0.5 line-clamp-3"
                        title={reviewNote}
                      >
                        {reviewNote}
                      </div>
                    )}
                  <button type="button" onClick={() => !isConfirmed && !isRejected && setEditingAnswer(q)}
                    className={`w-full p-2 rounded-xl text-center font-bold text-xs transition-all border
                      ${isReview
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : ans.is_correct
                          ? 'bg-green-50 text-green-700 border-green-100'
                          : 'bg-red-50 text-red-700 border-red-100'}
                      ${!isConfirmed ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}>
                    <div className="text-[9px] opacity-60">Q{q}</div>
                    <div className="text-sm font-black">
                      {exam?.template === 'elite'
                        ? (ans.student_answer === 'A' ? 'أ' : ans.student_answer === 'B' ? 'ب' : ans.student_answer === 'C' ? 'ج' : ans.student_answer === 'D' ? 'د' : ans.student_answer || '?')
                        : (ans.student_answer || '?')}
                    </div>
                    <div className="flex items-center justify-between mt-1 px-1">
                      {!ans.is_correct && exam?.keys?.[q] && (
                        <div className="text-[9px] text-green-600 font-bold">
                          ✓ {exam?.template === 'elite'
                            ? (exam.keys[q] === 'A' ? 'أ' : exam.keys[q] === 'B' ? 'ب' : exam.keys[q] === 'C' ? 'ج' : exam.keys[q] === 'D' ? 'د' : exam.keys[q])
                            : exam.keys[q]}
                        </div>
                      )}
                      <div className="text-[8px] text-slate-400 font-black ml-auto">
                        {ans.weight}ن
                      </div>
                    </div>
                    {typeof qConfidence === 'number' && (
                      <div className={`text-[9px] mt-0.5 ${isReview ? 'text-amber-700' : 'text-gray-500'}`}>
                        ثقة: {(qConfidence * 100).toFixed(0)}%
                      </div>
                    )}
                    {isReview && item.result?.reviewRois?.[q] && (
                      <div className="mt-1.5 p-1 bg-white rounded-lg border border-amber-200">
                        <img 
                          src={`data:image/jpeg;base64,${item.result.reviewRois[q]}`} 
                          alt={`Review Q${q}`}
                          className="w-full h-auto rounded-md"
                        />
                      </div>
                    )}
                  </button>
                  </div>
                    );
                  })()
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Image Preview logic moved to parent */}
    </div>
  );
});

/* ── Scanner Pages Modal ── */
const ScannerModal = ({ show, onClose, onScan, scannerAvailable, scannerNames, onRefresh }) => {
  const [pages, setPages] = useState(1);
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    await onScan(pages);
    setScanning(false);
    onClose();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl animate-in zoom-in-95">
        {/* Header */}
        <div className="p-5 bg-gradient-to-l from-teal-600 to-emerald-600 text-white flex justify-between items-center rounded-t-3xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <ScanLine size={20} />
            </div>
            <div>
              <h3 className="font-bold text-base">مسح بالسكانر</h3>
              <p className="text-teal-100 text-xs">التصحيح الآلي الفوري</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Scanner status */}
          <div className={`p-4 rounded-2xl border flex items-center gap-3
            ${scannerAvailable ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-100'}`}>
            {scannerAvailable
              ? <Wifi size={18} className="text-emerald-600 shrink-0" />
              : <WifiOff size={18} className="text-red-400 shrink-0" />}
            <div className="flex-1">
              <p className={`font-bold text-sm ${scannerAvailable ? 'text-emerald-800' : 'text-red-500'}`}>
                {scannerAvailable ? `سكانر متصل: ${scannerNames[0] || 'جهاز مسح ضوئي'}` : 'لا يوجد سكانر متصل'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {scannerAvailable
                  ? 'ضع أوراق الإجابة في السكانر ثم اضغط بدء المسح'
                  : 'تأكد من توصيل السكانر وتشغيله'}
              </p>
            </div>
            {!scannerAvailable && (
              <button type="button" onClick={onRefresh}
                className="text-xs font-bold text-indigo-600 px-3 py-1.5 bg-white rounded-lg border border-indigo-100 hover:bg-indigo-50 shrink-0">
                فحص
              </button>
            )}
          </div>

          {/* Page count */}
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">عدد الأوراق للمسح</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {[1, 2, 3, 5, 10, 15, 20, 30].map(n => (
                <button type="button" key={n} onClick={() => setPages(n)}
                  className={`w-12 h-10 rounded-xl font-bold text-sm transition-all border
                    ${pages === n
                      ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-100'
                      : 'bg-slate-50 text-gray-600 border-gray-200 hover:border-teal-300'}`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} max={200} value={pages}
                onChange={e => setPages(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 h-10 px-3 bg-slate-50 border border-gray-200 rounded-xl font-bold text-sm text-center focus:ring-2 focus:ring-teal-400" />
              <span className="text-sm text-gray-400 font-medium">{pages === 1 ? 'ورقة واحدة' : `${pages} أوراق`}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t flex gap-3">
          <button type="button" onClick={onClose}
            className="px-5 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition-colors">
            إلغاء
          </button>
          <button type="button" onClick={handleScan}
            disabled={!scannerAvailable || scanning}
            className={`flex-1 py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all
              ${!scannerAvailable || scanning
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 shadow-lg shadow-teal-200'}`}>
            {scanning
              ? <><Loader2 size={18} className="animate-spin" /> جاري المسح...</>
              : <><ScanLine size={18} /> بدء المسح ({pages} {pages === 1 ? 'ورقة' : 'أوراق'})</>}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Calibration Modal ── */
const CalibrationModal = ({ show, onClose, scannerAvailable, onRefresh, exam }) => {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);

  const handleCalibrate = async () => {
    setScanning(true);
    setResult(null);
    try {
      const calRes = await fetch(`${OMR_API_BASE}/calibrate-from-scanner`);
      const calData = await calRes.json();
      setResult(calData);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setScanning(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-5 bg-indigo-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
             <Settings size={20} />
             <h3 className="font-bold">معايرة دقة الطباعة</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6">
          {!result && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 flex gap-3 text-blue-700">
                <Info size={20} className="shrink-0" />
                <div className="text-sm leading-relaxed">
                  تأكد من طباعة **ورقة فارغة** من النظام أولاً. ضعها في السكانر ثم اضغط بدء المعايرة.
                  هذا يضمن أن أبعاد الطباعة مطابقة تماماً لإحداثيات التصحيح.
                </div>
              </div>

              <div className="flex justify-center">
                <a 
                  href={`${OMR_API_BASE}/generate-individual?student_id=&student_name=&class_name=&subject=&template=${exam?.template || 'nafs'}&num_questions=${exam?.qCount || 30}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-6 py-2 bg-white border-2 border-indigo-100 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-all shadow-sm"
                >
                  <Download size={18} />
                  تحميل نموذج فارغ للطباعة
                </a>
              </div>
              
              <div className="flex justify-center py-4">
                 <div className={`p-8 rounded-full border-4 border-dashed transition-all
                   ${scanning ? 'border-indigo-400 bg-indigo-50 animate-pulse' : 'border-gray-200 bg-gray-50'}`}>
                    <Printer size={48} className={scanning ? 'text-indigo-600' : 'text-gray-300'} />
                 </div>
              </div>
            </div>
          )}

          {result && (
            <div className={`p-5 rounded-2xl border-2 ${result.is_safe ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-3 mb-4">
                {result.is_safe ? <CheckCircle2 size={32} className="text-emerald-600" /> : <AlertTriangle size={32} className="text-red-600" />}
                <div>
                  <h4 className={`text-lg font-black ${result.is_safe ? 'text-emerald-800' : 'text-red-800'}`}>
                    {result.is_safe ? 'الطباعة مطابقة تماماً ✅' : 'يوجد خلل في أبعاد الطباعة ❌'}
                  </h4>
                  <p className="text-sm opacity-80 font-medium">نتائج تحليل القياسات الهندسية للورقة</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                <div className="bg-white/50 p-3 rounded-xl border border-black/5">
                  <p className="text-gray-500 mb-1">النسبة الأفقية (X)</p>
                  <p className="text-base text-gray-900">%{((result.scale_x || 0) * 100).toFixed(2)}</p>
                </div>
                <div className="bg-white/50 p-3 rounded-xl border border-black/5">
                  <p className="text-gray-500 mb-1">النسبة الرأسية (Y)</p>
                  <p className="text-base text-gray-900">%{((result.scale_y || 0) * 100).toFixed(2)}</p>
                </div>
              </div>

              {!result.is_safe && (
                <div className="mt-4 p-3 bg-red-100/50 rounded-xl text-red-700 text-xs font-bold leading-relaxed">
                  تنبيه: الورقة مطبوعة بحجم غير دقيق. يرجى التأكد عند الطباعة من اختيار إعداد 
                  <span className="mx-1 underline text-red-900">"Actual Size"</span> أو 
                  <span className="mx-1 underline text-red-900">"حجم فعلي"</span> بنسبة 100%.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 bg-gray-50 flex gap-3">
           <button type="button" onClick={onClose} className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">إغلاق</button>
           <button type="button" onClick={handleCalibrate} disabled={scanning || !scannerAvailable}
             className={`flex-1 py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all shadow-lg
               ${scanning || !scannerAvailable ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100'}`}>
             {scanning ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
             {scanning ? 'جاري التحليل...' : result ? 'إعادة الاختبار' : 'بدء المعايرة الآلية'}
           </button>
        </div>
      </div>
    </div>
  );
};

/* ── نافذة استرداد بيانات الطلاب (بحث في قائمة الطلاب المسجّلين) ── */
const StudentPickerModal = ({ show, onClose, onPick, students, detectedId }) => {
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!show) return;
    // ابدأ البحث افتراضياً بالرقم المُكتشف من QR (إن وُجد)
    setQ(detectedId ? String(detectedId) : '');
  }, [show, detectedId]);

  if (!show) return null;

  const getNational = (s) => String(s.nationalId || s.national_id || '').trim();
  const getSeat = (s) => String(s.seatNumber || s.seat_number || '').trim();

  const norm = (v) => String(v ?? '').toLowerCase().trim();
  const query = norm(q);
  const filtered = (students || []).filter((s) => {
    if (!query) return true;
    return [s.name, getNational(s), getSeat(s), s.grade, s.classroom, s.stage, s.phone]
      .some((f) => norm(f).includes(query));
  }).slice(0, 200); // حدّ أعلى للأداء عند البحث الفارغ

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-5 bg-indigo-600 text-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-black">استرداد بيانات طالب</h3>
            <p className="text-[11px] text-indigo-100 mt-1">
              ابحث بالاسم أو رقم الهوية أو رقم الجلوس للعثور على الطالب — الرمز يعتمد رقم الهوية فقط
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 bg-slate-50">
          <div className="relative">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث: اسم، رقم هوية، جلوس، صف…"
              className="w-full px-4 py-3 pr-10 bg-white border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
            />
            <Search size={16} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400" />
          </div>
          <div className="mt-2 text-[11px] font-bold text-slate-500">
            عدد النتائج: {filtered.length} {filtered.length === 200 ? '+' : ''} من أصل {(students || []).length} طالب
          </div>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-slate-400 font-bold text-sm">
              لا يوجد طالب مطابق لبحثك
            </div>
          ) : filtered.map((s) => {
            const nat = getNational(s);
            const seat = getSeat(s);
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => onPick(s)}
                className="w-full px-5 py-3 flex items-center gap-3 hover:bg-indigo-50 text-right transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm shrink-0">
                  {(s.name || '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-slate-800 text-sm truncate">{s.name || '—'}</div>
                  <div className="text-[11px] text-slate-500 font-bold flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="font-mono text-indigo-600">الهوية: {nat || '—'}</span>
                    {seat ? <span className="font-mono text-slate-600">جلوس: {seat}</span> : null}
                    {s.grade && <span>الصف: {s.grade}</span>}
                    {s.classroom && <span>الفصل: {s.classroom}</span>}
                    {s.stage && <span>المرحلة: {s.stage}</span>}
                  </div>
                </div>
                <span className="text-[11px] font-black text-indigo-600 shrink-0">اختيار</span>
              </button>
            );
          })}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button type="button" onClick={onClose} className="px-5 py-2 text-slate-500 font-bold rounded-xl hover:bg-slate-100">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Unknown Student Resolver Modal ── */
const UnknownStudentModal = ({ show, onClose, onSave, initialValues, students = [], detectedId = '' }) => {
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentGrade, setStudentGrade] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!show) return;
    setStudentName(initialValues?.studentName || '');
    setStudentId(initialValues?.studentId || '');
    setStudentGrade(initialValues?.studentGrade || '');
    setShowPicker(false);
  }, [show, initialValues]);

  if (!show) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!studentName.trim()) return alert('يرجى إدخال اسم الطالب');
    if (!studentId.trim()) return alert('يرجى إدخال رقم الهوية');
    onSave({
      studentName: studentName.trim(),
      studentId: studentId.trim(),
      studentGrade: studentGrade.trim(),
    });
  };

  const handlePick = (s) => {
    const nat = String(s.nationalId || s.national_id || '').trim();
    if (!nat) {
      window.alert('هذا الطالب بدون رقم هوية في السجل. أضف الهوية من قائمة الطلاب ثم أعد المحاولة.');
      return;
    }
    setStudentName(String(s.name || '').trim());
    setStudentId(nat);
    setStudentGrade(String(s.grade || s.classroom || '').trim());
    setShowPicker(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
      >
        <div className="p-6 bg-indigo-600 text-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black">تعيين طالب غير معروف</h3>
            <p className="text-[11px] text-indigo-100 mt-1">أدخل بيانات الطالب يدوياً أو استرد من قائمة الطلاب</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-dashed border-indigo-200 text-indigo-700 rounded-xl font-black text-sm hover:border-indigo-400 hover:bg-indigo-50 transition-all"
          >
            <Download size={16} />
            استرداد بيانات من قائمة الطلاب
            {students.length > 0 && (
              <span className="text-[11px] text-indigo-400 font-bold">({students.length} طالب)</span>
            )}
          </button>
          {detectedId && (
            <div className="mt-2 text-[11px] text-slate-500 font-bold text-center">
              الرقم المكتشف من الورقة: <span className="font-mono text-slate-700">{detectedId}</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-500 mb-1.5">اسم الطالب</label>
            <input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
              placeholder="مثال: أحمد محمد"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-500 mb-1.5">رقم الهوية (المعرّف في الرمز)</label>
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                placeholder="مثال: 10234"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-500 mb-1.5">الصف</label>
              <input
                value={studentGrade}
                onChange={(e) => setStudentGrade(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-300 outline-none"
                placeholder="مثال: الأول ابتدائي"
              />
            </div>
          </div>
        </div>

        <div className="p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-500 font-bold rounded-xl hover:bg-slate-100">
            إلغاء
          </button>
          <button type="submit" className="px-6 py-2.5 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700">
            حفظ وتحديث الورقة
          </button>
        </div>
      </form>

      <StudentPickerModal
        show={showPicker}
        onClose={() => setShowPicker(false)}
        onPick={handlePick}
        students={students}
        detectedId={detectedId}
      />
    </div>
  );
};

/* ── Main Page ── */
const OMRScanner = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [exams, setExams] = useState([]);
  const [filterStage, setFilterStage] = useState('All');
  const [filterGrade, setFilterGrade] = useState('All');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [students, setStudents] = useState([]);
  const inputRef = useRef();
  const nextId = useRef(1);

  /* Scanner state */
  const [scannerAvailable, setScannerAvailable] = useState(null);
  const [scannerNames, setScannerNames]         = useState([]);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [isScannerScanning, setIsScannerScanning] = useState(false);
  const [scanMode, setScanMode] = useState('hybrid');
  const [batchTimer, setBatchTimer] = useState({
    running: false,
    startedAt: null,
    elapsedMs: 0,
    lastBatchMs: null,
    lastBatchCount: 0,
  });

  /* Audit Trail State */
  const [auditModal, setAuditModal] = useState({ open: false, data: [], name: '' });
  const [previewItem, setPreviewItem] = useState(null);
  const [previewMode, setPreviewMode] = useState('original'); // 'original' | 'system'
  const [unknownStudentModal, setUnknownStudentModal] = useState({
    open: false,
    itemId: null,
    initialValues: { studentName: '', studentId: '', studentGrade: '' },
  });

  useEffect(() => {
    (async () => {
      try {
        const [examsData, studentsData] = await Promise.all([getOmrExams(), getStudents()]);
        setExams(examsData);
        setStudents(studentsData);
        if (examId) {
          setSelectedExamId(examId);
        } else if (examsData.length > 0) {
          setSelectedExamId(examsData[0].id);
        }
      } catch (err) {
        toast.error('فشل تحميل بيانات الاختبارات والطلاب. تحقق من اتصالك بالإنترنت.', 'خطأ في التحميل');
        console.error('OMRScanner load error:', err);
      }
    })();
    checkScanner();
  }, [examId]);

  /* ── إعادة تطابق نتائج الجلسة الحالية بالطلاب + الخريطة اليدوية ── */
  const rematchSessionResults = (studentsList) => {
    const manualMap = getManualStudentMap();
    setItems(prev => prev.map(it => {
      if (!it?.result || it.confirmed) return it;
      if (it.result.studentName && it.result.studentName !== 'طالب غير معرف') return it;
      const detected = it.result.detectedStudentId || it.result.studentId || '';
      const found = findStudentByDetectedId(studentsList, detected);
      const idKey = normalizeStudentId(detected);
      const manual = (idKey && manualMap[idKey]) || null;
      if (!found && !manual) return it;
      const identity = resolveOmrStudentFields({
        student: found,
        omrData: { student_id: detected },
        manualMapEntry: manual,
      });
      return {
        ...it,
        result: {
          ...it.result,
          studentName: identity.studentName || 'طالب غير معرف',
          studentGrade: identity.studentGrade || it.result.studentGrade,
          phone: identity.phone || it.result.phone,
          studentId: identity.studentId || it.result.studentId,
          nationalId: identity.nationalId || it.result.nationalId,
          seatNumber: identity.seatNumber || it.result.seatNumber,
          normalizedDetectedStudentId: identity.normalizedDetectedStudentId || it.result.normalizedDetectedStudentId,
          resolvedByManualMap: identity.resolvedByManualMap,
        },
      };
    }));
  };

  /* ── تحديث قائمة الطلاب يدوياً + إعادة المطابقة ── */
  const [isRefreshingStudents, setIsRefreshingStudents] = useState(false);
  const refreshStudents = async () => {
    setIsRefreshingStudents(true);
    try {
      const fresh = await getStudents();
      setStudents(fresh);
      rematchSessionResults(fresh);
      toast.success(`تم تحديث ${fresh.length} طالب وإعادة تطابق النتائج الحالية.`, 'تم التحديث');
    } catch (e) {
      toast.error('تعذّر تحديث قائمة الطلاب.', 'خطأ');
    } finally {
      setIsRefreshingStudents(false);
    }
  };

  /* ── تحديث تلقائي عند العودة لنافذة المتصفح ── */
  useEffect(() => {
    const onFocus = async () => {
      try {
        const fresh = await getStudents();
        setStudents(fresh);
        rematchSessionResults(fresh);
      } catch { /* تجاهل */ }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!batchTimer.running || !batchTimer.startedAt) return undefined;
    const t = setInterval(() => {
      setBatchTimer(prev => ({
        ...prev,
        elapsedMs: Date.now() - prev.startedAt,
      }));
    }, 250);
    return () => clearInterval(t);
  }, [batchTimer.running, batchTimer.startedAt]);

  /* ── Check scanner ── */
  const checkScanner = async () => {
    setScannerAvailable(null);
    try {
      const res = await fetch(`${OMR_API_BASE}/scanner-status`);
      if (res.ok) {
        const data = await res.json();
        setScannerAvailable(data.available);
        setScannerNames(data.scanners || []);
      } else {
        setScannerAvailable(false);
      }
    } catch {
      setScannerAvailable(false);
    }
  };

  const selectedExam = exams.find(e => e.id === selectedExamId);
  const filterGrades = filterStage !== 'All' ? STAGES[filterStage] || [] : [];
  const visibleExams = useMemo(() => exams.filter(e => {
    if (filterStage !== 'All' && e.stage !== filterStage) return false;
    if (filterGrade !== 'All' && e.grade !== filterGrade) return false;
    return true;
  }), [exams, filterStage, filterGrade]);

  // Auto-select first exam when filter changes and current selection is not in visible list
  useEffect(() => {
    if (visibleExams.length > 0) {
      const isCurrentVisible = visibleExams.some(e => e.id === selectedExamId);
      if (!isCurrentVisible) {
        setSelectedExamId(visibleExams[0].id);
      }
    } else {
      setSelectedExamId('');
    }
  }, [visibleExams]);

  const buildScanResultPayload = (omrData, gradePayload, manualMap, fingerprint = '', auditNote = 'initial scan') => {
    const student = findStudentByDetectedId(students, omrData.student_id);
    const idKey = normalizeStudentId(omrData.student_id || '');
    const mapped =
      (fingerprint && manualMap[fingerprint]) ||
      (idKey && manualMap[idKey]) ||
      null;
    const identity = resolveOmrStudentFields({ student, omrData, manualMapEntry: mapped });
    const { score, total, percentage, details } = gradePayload;

    return {
      examId: selectedExamId,
      examTitle: selectedExam?.title || '',
      studentId: identity.studentId,
      nationalId: identity.nationalId,
      seatNumber: identity.seatNumber,
      detectedStudentId: identity.detectedStudentId,
      normalizedDetectedStudentId: identity.normalizedDetectedStudentId,
      studentName: identity.studentName || 'طالب غير معرف',
      studentGrade: identity.studentGrade,
      phone: identity.phone,
      resolvedByManualMap: identity.resolvedByManualMap,
      answers: omrData.answers || {},
      score, total, percentage, details,
      confidence: omrData.confidence || {},
      needsReviewQuestions: omrData.needs_review_questions || [],
      reviewReasons: omrData.review_reasons || {},
      adaptiveThresholds: omrData.adaptive_thresholds || {},
      decisionStatus: omrData.decision_status || 'REVIEW_REQUIRED',
      qualityFlags: omrData.quality_flags || [],
      detectedNumQuestions: omrData.detected_num_questions ?? null,
      qualityScore: omrData.quality_score ?? 0,
      unstableQuestions: omrData.unstable_questions || [],
      averageConfidence: omrData.average_confidence || 0,
      mismatchQuestions: omrData.double_pass_mismatch_questions || [],
      systemViewImage: omrData.system_view_image || '',
      reviewRois: omrData.review_rois || {},
      audit: [{ action: 'scan', at: new Date().toISOString(), note: auditNote }],
      timestamp: new Date().toISOString(),
    };
  };

  /* ── Process a single file through OMR engine ── */
  const processFile = async (file, itemId, extraProps = {}) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, loading: true, error: null } : it));
    try {
      const omrData = await scanImage(file, selectedExam?.template || 'default', selectedExam?.qCount || 30, scanMode);
      const gradePayload = grade(omrData.answers, selectedExam?.keys || {}, selectedExam?.weights || {});
      const manualMap = getManualStudentMap();
      const result = buildScanResultPayload(
        omrData,
        gradePayload,
        manualMap,
        extraProps?.fingerprint || '',
        'initial scan'
      );
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, loading: false, result, ...extraProps } : it));
    } catch (err) {
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, loading: false, error: err.message } : it));
    }
  };

  /* ── Handle file upload (existing) ── */
  const handleFiles = async (files) => {
    if (!selectedExamId) { alert('اختر الاختبار أولاً'); return; }
    const newItems = await Promise.all(Array.from(files).map(async (file) => {
      const fileHash = await hashFileSha256(file);
      return {
        id: nextId.current++,
        file,
        previewUrl: URL.createObjectURL(file),
        loading: true,
        result: null,
        error: null,
        confirmed: false,
        fromScanner: false,
        fingerprint: fileHash ? `upload:${fileHash}` : '',
      };
    }));
    const batchStart = Date.now();
    setBatchTimer({
      running: true,
      startedAt: batchStart,
      elapsedMs: 0,
      lastBatchMs: batchTimer.lastBatchMs,
      lastBatchCount: batchTimer.lastBatchCount,
    });
    setItems(prev => [...prev, ...newItems]);
    await Promise.all(newItems.map(item => processFile(item.file, item.id, { fingerprint: item.fingerprint })));
    const spent = Date.now() - batchStart;
    setBatchTimer({
      running: false,
      startedAt: null,
      elapsedMs: spent,
      lastBatchMs: spent,
      lastBatchCount: newItems.length,
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFiles(files);
  };

  /* ── Handle hardware scanner — STREAMING (results appear one by one) ── */
  const handleHardwareScan = async (pages) => {
    if (!selectedExamId) { alert('اختر الاختبار أولاً'); return; }
    setIsScannerScanning(true);
    let received = 0;

    try {
      const scanTemplate = effectiveOmrScanTemplate(selectedExam?.template || 'default');
      const res = await fetch(
        `${OMR_API_BASE}/scan-from-scanner-stream?template=${scanTemplate}&pages=${pages}&num_questions=${selectedExam?.qCount || 30}&scan_mode=${scanMode}`,
        { method: 'POST' }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'خطأ غير معروف' }));
        alert(`خطأ: ${err.detail}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (NDJSON)
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);

            if (msg.type === 'result') {
              const omrData = msg.data;
              received++;
              const gradePayload = grade(omrData.answers || {}, selectedExam?.keys || {}, selectedExam?.weights || {});
              const manualMap2 = getManualStudentMap();
              const result = buildScanResultPayload(
                omrData,
                gradePayload,
                manualMap2,
                '',
                'scanner stream scan'
              );
              const newItem = {
                id: nextId.current++,
                file: null,
                loading: false,
                fromScanner: true,
                page: omrData.page || received,
                result,
                error: null,
                confirmed: false,
              };
              setItems(prev => [...prev, newItem]);

            } else if (msg.type === 'error') {
              const errItem = {
                id: nextId.current++,
                file: null,
                loading: false,
                fromScanner: true,
                page: null,
                result: null,
                error: msg.msg,
                confirmed: false,
              };
              setItems(prev => [...prev, errItem]);

            } else if (msg.type === 'done') {
              // streaming complete
            }
          } catch {
            // skip malformed line
          }
        }
      }
    } catch (e) {
      alert(`فشل الاتصال بالسكانر: ${e.message}`);
    } finally {
      setIsScannerScanning(false);
    }
  };

  /* ── Confirm / remove / etc. ── */
  const handleConfirm = async (itemId) => {
    const item = items.find(it => it.id === itemId);
    if (!item?.result) return;
    const reviewCount = item.result.needsReviewQuestions?.length || 0;
    if (item.result.decisionStatus === 'REJECTED_QUALITY') {
      alert('لا يمكن اعتماد هذه الورقة: الحالة مرفوضة جودة. أعد المسح أو راجع الصورة الأصلية.');
      return;
    }
    if (reviewCount > 0) {
      const ok = window.confirm(`هذه الورقة تحتوي ${reviewCount} سؤال بحاجة لمراجعة. هل تريد الاعتماد رغم ذلك؟`);
      if (!ok) return;
    }
    const approved = {
      ...item.result,
      approved: true,
      confirmed: true,
      approvedAt: new Date().toISOString(),
      audit: [
        ...(item.result.audit || []),
        { 
          action: 'approve', 
          ts: new Date().toISOString(), 
          user: 'المصحح (مدير الجلسة)',
          details: 'تمت مراجعة الورقة واعتماد درجتها النهائية رسمياً.'
        }
      ],
    };
    const recordKey = normalizeStudentId(approved.nationalId || approved.studentId || 'unknown');
    const stableId = `omr_${approved.examId || 'noexam'}_${recordKey || 'unknown'}`;
    const toSave = {
      ...approved,
      id: approved.id || stableId,
      // نحذف reviewRois (قطع base64 ضخمة لكل سؤال) ونُبقي systemViewImage لعرض
      // الورقة في «كشف المعتمدين» — سيُسلَّمها slimOmrResult كما هي.
      reviewRois: undefined,
    };
    await saveOmrResult(toSave);
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, confirmed: true, result: approved } : it));
  };

  const handleUnconfirm = (itemId) => {
    const reason = window.prompt('سبب إلغاء الاعتماد (إلزامي):');
    if (!reason || !reason.trim()) return;
    setItems(prev => prev.map(it => {
      if (it.id !== itemId || !it.result) return it;
      return {
        ...it,
        confirmed: false,
        result: {
          ...it.result,
          unapprovedAt: new Date().toISOString(),
          unapproveReason: reason.trim(),
          confirmed: false,
          audit: [
            ...(it.result.audit || []),
            { 
              action: 'unapprove', 
              ts: new Date().toISOString(), 
              user: 'المصحح (مدير الجلسة)',
              details: `تم إلغاء الاعتماد. السبب: ${reason.trim()}`
            }
          ]
        }
      };
    }));
  };

  const handleConfirmAll = async () => {
    const toConfirm = items.filter(it =>
      it.result &&
      !it.error &&
      !it.confirmed &&
      (it.result.needsReviewQuestions?.length || 0) === 0 &&
      it.result.decisionStatus !== 'REJECTED_QUALITY'
    );
    const skipped = items.filter(it =>
      it.result &&
      !it.error &&
      !it.confirmed &&
      ((it.result.needsReviewQuestions?.length || 0) > 0 || it.result.decisionStatus === 'REJECTED_QUALITY')
    );
    for (const it of toConfirm) {
      const approved = {
        ...it.result,
        approved: true,
        confirmed: true,
        approvedAt: new Date().toISOString(),
        audit: [...(it.result.audit || []), { action: 'approve', at: new Date().toISOString(), note: 'bulk safe approve' }],
      };
      const recordKey = normalizeStudentId(approved.nationalId || approved.studentId || 'unknown');
      const stableId = `omr_${approved.examId || 'noexam'}_${recordKey || 'unknown'}`;
      const toSave = {
        ...approved,
        id: approved.id || stableId,
        reviewRois: undefined,
      };
      await saveOmrResult(toSave);
    }
    setItems(prev => prev.map(it => (
      toConfirm.some(c => c.id === it.id) ? { ...it, confirmed: true } : it
    )));
    if (skipped.length > 0) {
      alert(`تم اعتماد ${toConfirm.length} ورقة آمنة، وتخطي ${skipped.length} ورقة تحتاج مراجعة.`);
    }
  };

  const handleConfirmReviewed = async () => {
    const toConfirmReviewed = items.filter(it =>
      it.result &&
      !it.error &&
      !it.confirmed &&
      (it.result.needsReviewQuestions?.length || 0) > 0 &&
      it.result.decisionStatus !== 'REJECTED_QUALITY'
    );
    if (toConfirmReviewed.length === 0) return;

    const ok = window.confirm(`سيتم اعتماد ${toConfirmReviewed.length} ورقة تحتاج مراجعة. تأكد أنك راجعتها يدويًا قبل المتابعة.`);
    if (!ok) return;

    for (const it of toConfirmReviewed) {
      const approved = {
        ...it.result,
        approved: true,
        confirmed: true,
        approvedAt: new Date().toISOString(),
        audit: [...(it.result.audit || []), { action: 'approve', at: new Date().toISOString(), note: 'bulk reviewed approve' }],
      };
      const recordKey = normalizeStudentId(approved.nationalId || approved.studentId || 'unknown');
      const stableId = `omr_${approved.examId || 'noexam'}_${recordKey || 'unknown'}`;
      await saveOmrResult({ ...approved, id: approved.id || stableId, reviewRois: undefined });
    }

    setItems(prev => prev.map(it => (
      toConfirmReviewed.some(c => c.id === it.id) ? { ...it, confirmed: true } : it
    )));
  };

  const handleRemove = (itemId) => setItems(prev => prev.filter(it => it.id !== itemId));
  const handleRemoveWithCleanup = (itemId) => {
    setItems(prev => {
      const target = prev.find(it => it.id === itemId);
      if (target?.previewUrl) revokePreviewUrl(target.previewUrl);
      return prev.filter(it => it.id !== itemId);
    });
  };
  const handleClear = () => {
    setItems(prev => {
      prev.forEach(it => revokePreviewUrl(it.previewUrl));
      return [];
    });
  };

  const handleSendWhatsapp = async (item) => {
    try {
      const waBase = await getWhatsAppApiBase();
      const res = await fetch(`${waBase}/send-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: item.result.phone, result: item.result })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال');
      alert(`تم الإرسال لـ ${item.result.studentName} بنجاح ✅`);
    } catch (err) {
      alert(`خطأ: ${err.message}`);
    }
  };

  const handleAnswerEdit = (itemId, qNum, newAnswer) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId || !it.result) return it;
      if (it.confirmed || it.result.decisionStatus === 'REJECTED_QUALITY') return it;
      const details = { ...it.result.details };
      const correct = selectedExam?.keys?.[qNum] || '';
      const oldValue = details[qNum]?.student_answer || '-';
      details[qNum] = { student_answer: newAnswer, correct_option: correct, is_correct: newAnswer === correct };
      const qInt = parseInt(qNum, 10);
      const needsReviewQuestions = (it.result.needsReviewQuestions || []).filter(n => n !== qInt);
      const reviewReasons = { ...(it.result.reviewReasons || {}) };
      for (const k of Object.keys(reviewReasons)) {
        if (parseInt(k, 10) === qInt) delete reviewReasons[k];
      }
      let score = 0;
      Object.values(details).forEach(d => { if (d.is_correct) score++; });
      const total = Object.keys(details).length;
      const percentage = total > 0 ? ((score / total) * 100).toFixed(2) : '0';
      return {
        ...it,
        result: {
          ...it.result,
          score, total, percentage, details,
          needsReviewQuestions,
          reviewReasons,
          audit: [
            ...(it.result.audit || []),
            {
              ts: new Date().toISOString(),
              action: 'edit',
              user: 'المصحح (تعديل يدوي)',
              details: `تعديل السؤال ${qNum}: من (${oldValue}) إلى (${newAnswer || '-'})`
            }
          ],
        },
      };
    }));
  };

  const handleShowAudit = (item) => {
    if (!item.result) return;
    setAuditModal({
      open: true,
      data: item.result.audit || [],
      name: item.result.studentName
    });
  };

  const handleResolveUnknown = (itemId) => {
    const item = items.find(it => it.id === itemId);
    if (!item?.result) return;
    setUnknownStudentModal({
      open: true,
      itemId,
      detectedId: item.result.detectedStudentId || item.result.studentId || '',
      initialValues: {
        studentName: item.result.studentName === 'طالب غير معرف' ? '' : (item.result.studentName || ''),
        studentId: item.result.detectedStudentId || item.result.studentId || '',
        studentGrade: item.result.studentGrade || '',
      },
    });
  };

  const handleSaveUnknownStudent = async ({ studentName, studentId, studentGrade }) => {
    const nationalRaw = String(studentId || '').trim();
    const normalizedInputId = normalizeStudentId(nationalRaw);
    const targetItem = items.find(it => it.id === unknownStudentModal.itemId);

    setItems(prev => prev.map(it => {
      if (it.id !== unknownStudentModal.itemId || !it.result) return it;
      return {
        ...it,
        result: {
          ...it.result,
          studentName,
          nationalId: nationalRaw,
          studentId: nationalRaw,
          studentGrade,
          normalizedDetectedStudentId: normalizedInputId || it.result.normalizedDetectedStudentId || '',
          audit: [
            ...(it.result.audit || []),
            {
              ts: new Date().toISOString(),
              action: 'edit',
              user: 'المصحح (تعيين طالب يدوي)',
              details: `تم تعيين الطالب يدوياً: ${studentName} (هوية: ${nationalRaw}${studentGrade ? `، الصف: ${studentGrade}` : ''})`
            }
          ],
        }
      };
    }));

    const existingStudent = findStudentByDetectedId(students, nationalRaw);

    const studentToPersist = existingStudent
      ? {
          ...existingStudent,
          name: studentName,
          grade: studentGrade || existingStudent.grade || '',
          nationalId: nationalRaw || existingStudent.nationalId || existingStudent.national_id || '',
          national_id: nationalRaw || existingStudent.national_id || existingStudent.nationalId || '',
        }
      : {
          id: `${Date.now()}${Math.floor(Math.random() * 10000)}`,
          name: studentName,
          nationalId: nationalRaw,
          national_id: nationalRaw,
          seatNumber: '',
          seat_number: '',
          grade: studentGrade || '',
          class: '',
          committee: '',
          phone: '',
        };

    try {
      await saveStudent(studentToPersist);
      setStudents(prev => {
        const prevList = Array.isArray(prev) ? prev : [];
        const idx = prevList.findIndex((s) => s.id === studentToPersist.id);
        if (idx >= 0) {
          const updated = [...prevList];
          updated[idx] = { ...updated[idx], ...studentToPersist };
          return updated;
        }
        return [...prevList, studentToPersist];
      });
    } catch (e) {
      console.error('Failed to persist manual student mapping', e);
      alert('تم تعديل الورقة الحالية، لكن تعذر حفظ الطالب في قاعدة البيانات.');
    }

    const currentMap = getManualStudentMap();
    const mapEntry = {
      studentName,
      studentId: nationalRaw,
      nationalId: nationalRaw,
      studentGrade: studentGrade || '',
      seatNumber: studentToPersist.seatNumber || '',
      updatedAt: new Date().toISOString(),
    };
    if (normalizedInputId) currentMap[normalizedInputId] = mapEntry;
    if (targetItem?.fingerprint) currentMap[targetItem.fingerprint] = mapEntry;
    saveManualStudentMap(currentMap);

    setUnknownStudentModal({
      open: false,
      itemId: null,
      initialValues: { studentName: '', studentId: '', studentGrade: '' },
    });
  };

  const pendingCount   = items.filter(it => it.result && !it.error && !it.confirmed).length;
  const reviewPendingCount = items.filter(it => it.result && !it.error && !it.confirmed && (it.result.needsReviewQuestions?.length || 0) > 0).length;
  const safePendingCount = items.filter(it => it.result && !it.error && !it.confirmed && (it.result.needsReviewQuestions?.length || 0) === 0 && it.result.decisionStatus !== 'REJECTED_QUALITY').length;
  const confirmedCount = items.filter(it => it.confirmed).length;
  const errorCount     = items.filter(it => it.error).length;
  const isAnyLoading   = items.some(it => it.loading) || isScannerScanning;
  const formatMs = (ms) => {
    const totalSec = Math.max(0, Math.round((ms || 0) / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const sortedItems = useMemo(() => {
    // Group "needs review" sheets together at the top for faster manual workflow.
    return [...items].sort((a, b) => {
      const aReview = (!a.confirmed && !a.error && (a.result?.needsReviewQuestions?.length || 0) > 0) ? 1 : 0;
      const bReview = (!b.confirmed && !b.error && (b.result?.needsReviewQuestions?.length || 0) > 0) ? 1 : 0;
      if (aReview !== bReview) return bReview - aReview;

      const aPending = (!a.confirmed && !a.error && a.result) ? 1 : 0;
      const bPending = (!b.confirmed && !b.error && b.result) ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;

      return (a.id || 0) - (b.id || 0);
    });
  }, [items]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-24">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div className="flex items-center gap-5">
          <button 
            onClick={() => navigate('/omr-exams')}
            className="p-4 bg-white text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2.5xl transition-all shadow-sm border border-slate-100 flex items-center justify-center group"
          >
            <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <div>
            <h1 className="text-5xl font-black text-slate-900 tracking-tighter font-header leading-tight">
              واجهة <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">التصحيح الذكي</span>
            </h1>
            <div className="text-slate-400 mt-2 font-bold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              ارفع أوراق الإجابات أو امسحها مباشرةً بالسكانر للتصحيح الفوري
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Scanner status pill */}
          <div
            onClick={checkScanner}
            title="اضغط للتحديث"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all border select-none
              ${scannerAvailable === null ? 'bg-gray-50 border-gray-200 text-gray-400 animate-pulse' :
                scannerAvailable ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' :
                'bg-red-50 border-red-100 text-red-500 hover:bg-red-100'}`}>
            {scannerAvailable === null ? <Loader2 size={11} className="animate-spin" /> :
             scannerAvailable ? <Wifi size={11} /> : <WifiOff size={11} />}
            {scannerAvailable === null ? 'جاري الفحص' :
             scannerAvailable ? 'سكانر متصل' : 'لا يوجد سكانر'}
          </div>
          {items.length > 0 && (
            <button type="button" onClick={handleClear} className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl font-bold transition-all border border-gray-200">
              <Trash2 size={15} /> مسح الكل
            </button>
          )}
          <button
            type="button"
            onClick={refreshStudents}
            disabled={isRefreshingStudents}
            title={`قائمة الطلاب الحالية (${students.length}). اضغط لإعادة التحميل وإعادة تطابق النتائج الحالية.`}
            className="flex items-center gap-2 px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 rounded-xl font-bold transition-all border border-emerald-100 disabled:opacity-60"
          >
            {isRefreshingStudents ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
            {isRefreshingStudents ? 'جاري التحديث...' : `تحديث الطلاب (${students.length})`}
          </button>
          <button
            type="button"
            onClick={() => setShowCalibrationModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-xl font-bold transition-all border border-indigo-100"
          >
            <Settings size={15} /> معايرة الطباعة
          </button>
        </div>
      </div>

      <CalibrationModal 
        show={showCalibrationModal} 
        onClose={() => setShowCalibrationModal(false)}
        scannerAvailable={scannerAvailable}
        onRefresh={checkScanner}
        exam={selectedExam}
      />

      {/* ── Exam Selector ── */}
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
          <ListFilter size={16} className="text-indigo-500" /> تحديد الاختبار
        </label>
        <div className="grid grid-cols-3 gap-3">
          <select value={filterStage}
            onChange={e => { setFilterStage(e.target.value); setFilterGrade('All'); }}
            className="p-3 bg-slate-50 border border-gray-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400">
            <option value="All">كل المراحل</option>
            {Object.keys(STAGES).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterGrade}
            onChange={e => { setFilterGrade(e.target.value); }}
            disabled={filterStage === 'All'}
            className="p-3 bg-slate-50 border border-gray-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400 disabled:opacity-40">
            <option value="All">كل الصفوف</option>
            {filterGrades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)}
            className="p-3 bg-slate-50 border border-gray-200 rounded-xl font-bold text-sm focus:ring-2 focus:ring-indigo-400">
            {visibleExams.length === 0
              ? <option disabled value="">لا يوجد اختبارات</option>
              : visibleExams.map(ex => <option key={ex.id} value={ex.id}>{ex.title || ex.subject} ({ex.qCount} س)</option>)
            }
          </select>
        </div>
        {selectedExam && (
          <div className="flex gap-2 flex-wrap">
            {selectedExam.stage && <span className="px-2 py-0.5 bg-violet-50 text-violet-600 text-xs font-bold rounded-lg">{selectedExam.stage}</span>}
            {selectedExam.grade && <span className="px-2 py-0.5 bg-blue-50  text-blue-600  text-xs font-bold rounded-lg">{selectedExam.grade}</span>}
            {selectedExam.subject && <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-lg">{selectedExam.subject}</span>}
            <span className="px-2 py-0.5 bg-slate-50 text-slate-500 text-xs font-bold rounded-lg">{selectedExam.qCount} سؤال</span>
          </div>
        )}
      </div>

      {/* ── Processing Tools ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 anim-slide-up" style={{ animationDelay: '0.1s' }}>
        {/* Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="luxury-card group/upload p-10 bg-white border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all duration-500 cursor-pointer relative overflow-hidden flex flex-col items-center justify-center gap-6"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover/upload:opacity-100 transition-opacity"></div>
          <input ref={inputRef} type="file" className="hidden" accept="image/*" multiple
            onChange={e => e.target.files && handleFiles(e.target.files)} />
          <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-[2rem] flex items-center justify-center shadow-xl shadow-indigo-100/50 group-hover/upload:scale-110 group-hover/upload:rotate-6 transition-all duration-500 border border-white">
            <Upload size={36} />
          </div>
          <div className="text-center relative z-10">
            <h3 className="text-xl font-black text-slate-800 mb-2">رفع صور الماسح</h3>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
              امسح الأوراق بالسكانر ثم ارفع الملفات هنا<br />
              <span className="text-indigo-500">PNG · JPG · BMP — محاذاة تلقائية كالمسح المباشر</span>
            </p>
          </div>
        </div>

        {/* Scanner Zone */}
        <div
          onClick={() => {
            if (!selectedExamId) { alert('اختر الاختبار أولاً'); return; }
            setShowScannerModal(true);
          }}
          className={`luxury-card p-10 border-none transition-all duration-500 group/scan relative overflow-hidden flex flex-col items-center justify-center gap-6
            ${scannerAvailable
              ? 'bg-slate-900 text-white cursor-pointer hover:shadow-2xl hover:shadow-emerald-500/20'
              : 'bg-slate-50 opacity-60 cursor-not-allowed'}`}
        >
          {scannerAvailable && <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent"></div>}
          <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-xl transition-all duration-500 border border-white/10
            ${scannerAvailable 
              ? 'bg-emerald-500 text-white shadow-emerald-500/30 group-hover/scan:scale-110 group-hover/scan:-rotate-6' 
              : 'bg-slate-200 text-slate-400'}`}>
            {isScannerScanning ? <Loader2 size={36} className="animate-spin" /> : <ScanLine size={36} />}
          </div>
          <div className="text-center relative z-10">
            <h3 className={`text-xl font-black mb-2 ${scannerAvailable ? 'text-white' : 'text-slate-400'}`}>
              {isScannerScanning ? 'جاري المسح المباشر...' : 'المسح الضوئي (Scanner)'}
            </h3>
            <div className={`text-[11px] font-bold uppercase tracking-widest ${scannerAvailable ? 'text-emerald-300' : 'text-slate-400'}`}>
              {scannerAvailable
                ? `${scannerNames[0] || 'Hardware Interface'} · متصل وجاهز`
                : 'يُرجى ربط جهاز المسح الضوئي'}
            </div>
            {scannerAvailable && (
              <div className="mt-4 flex items-center justify-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                 <span className="text-[9px] font-black text-emerald-400 tracking-[0.2em] font-header">نظام المعالجة الفورية مُفعل</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Precision Control ── */}
      <div className="luxury-card p-6 bg-slate-50/80 border-none shadow-inner anim-slide-up" style={{ animationDelay: '0.2s' }}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-2xl shadow-sm"><Settings size={20} className="text-slate-400" /></div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">مستوى دقة المعالجة</div>
              <div className="text-sm font-black text-slate-700">تخصيص سرعة وجودة محرك OMR</div>
            </div>
          </div>
          
          <div className="flex p-1.5 bg-white rounded-2.5xl shadow-sm border border-slate-100">
            {[
              { id: 'fast', label: 'سريع', color: 'bg-sky-500', note: 'للفرز الأولي' },
              { id: 'hybrid', label: 'هجين', color: 'bg-emerald-500', note: 'موصى به' },
              { id: 'strict', label: 'دقيق', color: 'bg-indigo-600', note: 'للاعتماد النهائي' }
            ].map(mode => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setScanMode(mode.id)}
                className={`relative px-8 py-3 rounded-2xl text-xs font-black transition-all duration-300 flex flex-col items-center gap-0.5
                  ${scanMode === mode.id ? `${mode.color} text-white shadow-lg scale-105 z-10` : 'text-slate-400 hover:text-slate-600'}`}
              >
                {mode.label}
                <span className={`text-[8px] opacity-60 ${scanMode === mode.id ? 'text-white' : 'text-slate-300'}`}>{mode.note}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Session Quality Dashboard ── */}
      <SessionDashboard 
        items={items} 
        batchTimer={batchTimer}
        onConfirmAll={handleConfirmAll}
        onConfirmReviewed={handleConfirmReviewed}
        onPrintConfirmed={() =>
          printResultSlip(
            dedupeConfirmedForPrint(items.filter((it) => it.confirmed && it.result)),
            selectedExam
          )
        }
        onPrintAggregated={() => {
          const deduped = dedupeConfirmedForPrint(items.filter((it) => it.confirmed && it.result));
          const rows = resultsFromScanItems(deduped);
          const first = rows[0];
          printAggregatedGradesSheet(rows, {
            classGrade: resolveResultClass(first, selectedExam),
            subject: resolveResultSubject(first, selectedExam),
            examTitle: selectedExam?.title || '',
            examStage: selectedExam?.stage || '',
            sheetTitle: 'كشف درجات مجمع',
          });
        }}
        safeCount={safePendingCount}
        reviewCount={reviewPendingCount}
        confirmedCount={confirmedCount}
      />

      {/* ── Sheet Cards ── */}
      <div className="space-y-3">
        {sortedItems.map(item => (
          <SheetCard
            key={item.id}
            item={item}
            exam={selectedExam}
            onConfirm={handleConfirm}
            onUnconfirm={handleUnconfirm}
            onRemove={handleRemoveWithCleanup}
            onAnswerEdit={handleAnswerEdit}
            onSendWhatsapp={handleSendWhatsapp}
            onPrint={(it) => printResultSlip([it], selectedExam)}
            onShowAudit={handleShowAudit}
            onPreview={(it) => setPreviewItem(it)}
            onResolveUnknown={handleResolveUnknown}
          />
        ))}
      </div>

      {/* ── Audit Trail Modal ── */}
      <AuditTrailModal 
        isOpen={auditModal.open}
        onClose={() => setAuditModal(prev => ({ ...prev, open: false }))}
        auditData={auditModal.data}
        studentName={auditModal.name}
      />

      {/* ── Scanner Modal ── */}
      <ScannerModal 
        show={showScannerModal} 
        onClose={() => setShowScannerModal(false)}
        onScan={handleHardwareScan}
        scannerAvailable={scannerAvailable}
        scannerNames={scannerNames}
        onRefresh={checkScanner}
      />

      <UnknownStudentModal
        show={unknownStudentModal.open}
        onClose={() => setUnknownStudentModal(prev => ({ ...prev, open: false }))}
        onSave={handleSaveUnknownStudent}
        initialValues={unknownStudentModal.initialValues}
        students={students}
        detectedId={unknownStudentModal.detectedId || ''}
      />

      {previewItem && (
        <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300" onClick={() => setPreviewItem(null)}>
          <div className="relative w-full max-w-5xl h-[92vh] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
            
            {/* Studio Header */}
            <div className="px-8 py-5 bg-white border-b border-slate-100 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-100">
                     <Eye size={24} />
                  </div>
                  <div>
                     <h3 className="text-xl font-black text-slate-900 font-header leading-tight">استوديو مراجعة الورقة</h3>
                     <p className="text-slate-400 text-xs font-bold mt-1 tracking-wide">الطالب: {previewItem.result?.studentName || '---'}</p>
                  </div>
               </div>
               
               <div className="flex items-center gap-3">
                  <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
                     <button 
                        onClick={() => setPreviewMode('original')}
                        className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${previewMode === 'original' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                        المستند الأصلي
                     </button>
                     <button 
                        onClick={() => setPreviewMode('system')}
                        className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${previewMode === 'system' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                     >
                        رؤية النظام (OMR)
                     </button>
                  </div>
                  <div className="w-px h-6 bg-slate-200 mx-2"></div>
                  <button type="button" onClick={() => setPreviewItem(null)} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all">
                    <X size={20} />
                  </button>
               </div>
            </div>

            {/* Studio Workspace - Focused View */}
            <div className="flex-1 bg-slate-50 flex flex-col items-center justify-center p-6 overflow-hidden relative">
               
               {/* Magic Toggle Float Button */}
               <button 
                  onClick={() => setPreviewMode(previewMode === 'original' ? 'system' : 'original')}
                  className="absolute bottom-8 right-8 z-20 flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2.5xl font-black text-sm shadow-2xl hover:scale-110 active:scale-95 transition-all border border-white/10 group"
               >
                  <RefreshCcw size={20} className="group-hover:rotate-180 transition-transform duration-500" />
                  تبديل الرؤية السحري
               </button>

               <div className="w-full h-full flex items-center justify-center relative">
                  {previewMode === 'original' ? (
                     <div className="h-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">Original Student Copy</div>
                        <img 
                           src={previewItem.previewUrl} 
                           className="max-h-full w-auto object-contain shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-lg border border-slate-200"
                           alt="Original Sheet" 
                        />
                     </div>
                  ) : (
                     <div className="h-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
                        <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3 bg-indigo-50 px-3 py-1 rounded-full shadow-sm border border-indigo-100">System AI Analysis View</div>
                        {previewItem.result?.systemViewImage ? (
                           <img 
                              src={previewItem.result.systemViewImage} 
                              className="max-h-full w-auto object-contain shadow-[0_20px_50px_rgba(79,70,229,0.15)] rounded-lg border-2 border-indigo-400"
                              alt="System Analysis" 
                           />
                        ) : (
                           <div className="flex flex-col items-center justify-center gap-4 text-indigo-400">
                              <Loader2 size={40} className="animate-spin" />
                              <span className="font-black text-xs">جاري تحليل البيانات...</span>
                           </div>
                        )}
                     </div>
                  )}
               </div>
            </div>

            {/* Content Stats Footer */}
            <div className="px-10 py-4 bg-white border-t border-slate-100 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-10">
                  <div className="flex flex-col">
                     <span className="text-[9px] font-black text-slate-400 uppercase mb-1">نسبة الثقة</span>
                     <span className="text-base font-black text-indigo-600 tracking-tight">{(previewItem.result?.averageConfidence * 100 || 0).toFixed(1)}%</span>
                  </div>
                  <div className="flex flex-col">
                     <span className="text-[9px] font-black text-slate-400 uppercase mb-1">موثوقية الشعار</span>
                     <span className="text-base font-black text-emerald-600 tracking-tight">{previewItem.result?.reliability_score || 0}%</span>
                  </div>
               </div>
               <div className="text-xs font-bold text-slate-300 italic">نظام المراجعة الاحترافي - قم بالتبديل للمقارنة اللحظية بين ورقتك وتحليل النظام</div>
            </div>
          </div>
        </div>
      )}

      <CalibrationModal
        show={showCalibrationModal}
        onClose={() => setShowCalibrationModal(false)}
        scannerAvailable={scannerAvailable}
        onRefresh={checkScanner}
      />
    </div>
  );
};

export default OMRScanner;
