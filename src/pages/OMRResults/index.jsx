import React, { useState, useEffect } from 'react';
import { Search, FileText, ChevronDown, ChevronUp, Clock, User, Download } from 'lucide-react';
import { getOmrResults, deleteOmrResult } from '../../utils/dataService';

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
};

function formatReviewReasonTags(tags) {
  if (!tags?.length) return 'يُنصح بمراجعة يدوية';
  return tags.map(t => REVIEW_REASON_AR[t] || t).join(' · ');
}

const OMRResults = () => {
    const [results, setResults] = useState([]);
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadResults();
    }, []);

    const loadResults = async () => {
        setLoading(true);
        const data = await getOmrResults();
        // Sort by timestamp desc
        data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setResults(data);
        setLoading(false);
    };

    const toggleRow = (id) => {
        const next = new Set(expandedRows);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedRows(next);
    };

    const filteredResults = results.filter(r => 
        r.studentId.includes(searchTerm) || 
        r.examTitle.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const exportToCSV = () => {
        if (filteredResults.length === 0) return;
        const headers = ["الرقم الجامعي", "الاختبار", "الدرجة", "الإجمالي", "النسبة", "التاريخ"];
        const rows = filteredResults.map(r => [
            r.studentId,
            r.examTitle,
            r.score,
            r.total,
            r.percentage + "%",
            new Date(r.timestamp).toLocaleString('ar-EG')
        ]);

        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `OMR_Results_${new Date().toLocaleDateString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-20">
            <div className="luxury-card p-10 flex flex-col md:flex-row justify-between items-center gap-6 bg-gradient-to-br from-white to-slate-50 border-none">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 font-header leading-tight tracking-tight">سجل تقارير التصحيح</h1>
                    <p className="text-slate-500 mt-3 font-medium text-sm">استعراض وتصدير جميع نتائج عمليات المسح الضوئي المؤرشفة</p>
                </div>
                <button 
                  onClick={exportToCSV}
                  className="flex items-center gap-3 px-8 py-4 bg-slate-800 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-slate-200 active:scale-95 group"
                >
                    <Download size={20} className="group-hover:translate-y-0.5 transition-transform" />
                    تصدير البيانات Excel
                </button>
            </div>

            <div className="luxury-card overflow-hidden border-none p-2 bg-white">
                <div className="p-8 border-b border-slate-50 bg-slate-50/20 flex flex-col md:flex-row gap-6 justify-between items-center">
                    <div className="relative w-full md:w-[450px]">
                        <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input 
                          type="text" 
                          placeholder="ابحث برقم الطالب التعريفي أو اسم الاختبار..." 
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pr-14 pl-6 py-4 bg-white border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100/50 font-bold text-sm shadow-sm transition-all"
                        />
                    </div>
                    <div className="text-xs font-black text-slate-400 uppercase tracking-widest bg-white px-4 py-2 border border-slate-100 rounded-full">
                       عدد السجلات المؤرشفة: <span className="text-indigo-600">{filteredResults.length}</span>
                    </div>
                </div>

                <div className="overflow-x-auto p-2">
                    <table className="premium-table w-full text-right">
                        <thead>
                            <tr className="border-none text-slate-400 text-xs uppercase tracking-widest font-black">
                                <th className="w-16"></th>
                                <th className="text-right px-6 py-4">الطالب</th>
                                <th className="text-right px-6 py-4">الاختبار / المادة</th>
                                <th className="text-center px-6 py-4">النتيجة</th>
                                <th className="text-center px-6 py-4">الوقت والتاريخ</th>
                                <th className="text-left px-6 py-4">الحالة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-8 divide-transparent">
                            {filteredResults.map((res) => (
                                <React.Fragment key={res.id}>
                                    <tr className="hover:scale-[1.01] transition-transform group cursor-pointer" onClick={() => toggleRow(res.id)}>
                                        <td className="w-16 text-center">
                                            <div className="flex justify-center">
                                              {expandedRows.has(res.id) ? <ChevronUp size={20} className="text-indigo-600" /> : <ChevronDown size={20} className="text-slate-300 group-hover:text-indigo-400" />}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-11 h-11 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center font-black border border-slate-100 shadow-inner">
                                                    <User size={20} />
                                                </div>
                                                <div>
                                                    <div className="font-black text-slate-900 text-sm">{res.studentId}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">رقم الطالب</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-400">
                                                  <FileText size={16} />
                                                </div>
                                                <span className="font-bold text-slate-600 text-sm whitespace-nowrap">{res.examTitle}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <div className="flex flex-col items-center">
                                                <div className="font-header font-black text-slate-900 text-lg">{res.score} <span className="opacity-20 text-xs">/</span> {res.total}</div>
                                                <div className={`text-[10px] font-black px-2 py-0.5 rounded-md mt-1 border ${parseFloat(res.percentage) >= 50 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                    {res.percentage}%
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <div className="flex flex-col items-center gap-1">
                                                <div className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                                                  <Clock size={12} className="text-slate-300" />
                                                  {new Date(res.timestamp).toLocaleDateString('ar-EG')}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-bold">{new Date(res.timestamp).toLocaleTimeString('ar-EG', {hour: '2-digit', minute: '2-digit'})}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex justify-start">
                                            {Array.isArray(res.needsReviewQuestions) && res.needsReviewQuestions.length > 0 ? (
                                                <span className="px-4 py-1.5 rounded-xl text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></div>
                                                    {res.needsReviewQuestions.length} سؤال مراجع
                                                </span>
                                            ) : (
                                                <span className="px-4 py-1.5 rounded-xl text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                                    تقبل تلقائي
                                                </span>
                                            )}
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedRows.has(res.id) && (
                                        <tr>
                                            <td colSpan="6" className="p-0">
                                              <div className="p-10 bg-slate-50/50 border-y border-slate-100 animate-in slide-in-from-top-2">
                                                {res.adaptiveThresholds && (
                                                    <div className="mb-6 flex flex-wrap gap-3">
                                                        <span className="text-[10px] font-black px-3 py-1 bg-white text-indigo-500 rounded-full border border-indigo-100 shadow-sm uppercase tracking-tighter">
                                                            Fill Limit: {res.adaptiveThresholds.fill ?? '-'}
                                                        </span>
                                                        <span className="text-[10px] font-black px-3 py-1 bg-white text-emerald-500 rounded-full border border-emerald-100 shadow-sm uppercase tracking-tighter">
                                                            Darkness Sens: {res.adaptiveThresholds.darkness ?? '-'}
                                                        </span>
                                                        <span className="text-[10px] font-black px-3 py-1 bg-white text-violet-500 rounded-full border border-violet-100 shadow-sm uppercase tracking-tighter">
                                                            Dominance: {res.adaptiveThresholds.dominance_ratio ?? '-'}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-2">
                                                    {Object.entries(res.details || {}).map(([q, detail]) => {
                                                        const needsQ = Array.isArray(res.needsReviewQuestions) && res.needsReviewQuestions.includes(parseInt(q, 10));
                                                        const reviewNote = formatReviewReasonTags(res.reviewReasons?.[q]);
                                                        return (
                                                        <div
                                                            key={q}
                                                            className={`p-3 rounded-2xl border transition-all ${
                                                                needsQ
                                                                    ? 'bg-amber-100/50 border-amber-200 text-amber-700 shadow-md shadow-amber-50'
                                                                    : detail.is_correct
                                                                        ? 'bg-white border-slate-100 text-indigo-600 shadow-sm'
                                                                        : 'bg-white border-rose-100 text-rose-500 shadow-sm'
                                                            }`}
                                                        >
                                                            {needsQ && (
                                                                <div className="text-[9px] font-bold text-amber-800 leading-snug mb-1.5" title={reviewNote}>
                                                                    {reviewNote}
                                                                </div>
                                                            )}
                                                            <div className="text-[10px] font-black opacity-30 mb-1 tracking-tight">Q{q}</div>
                                                            <div className="font-black text-sm flex items-center justify-center gap-1.5">
                                                                {detail.student_answer || '?'}
                                                                {!detail.is_correct && <span className="text-[10px] opacity-40 font-bold">({detail.correct_option})</span>}
                                                            </div>
                                                            {res.confidence && typeof res.confidence[q] === 'number' && (
                                                                <div className="text-[8px] mt-1.5 font-black uppercase opacity-60">
                                                                    {(res.confidence[q] * 100).toFixed(0)}%
                                                                </div>
                                                            )}
                                                            {needsQ && res.reviewRois?.[q] && (
                                                                <div className="mt-2.5 p-1 bg-white rounded-xl border border-amber-200 shadow-inner">
                                                                    <img 
                                                                        src={`data:image/jpeg;base64,${res.reviewRois[q]}`} 
                                                                        alt={`Review Q${q}`}
                                                                        className="w-full h-auto rounded-lg"
                                                                        style={{ imageRendering: 'auto' }}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );})}
                                                </div>
                                              </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                    
                    {filteredResults.length === 0 && (
                        <div className="py-24 luxury-card border-none bg-slate-50/50 m-6 flex flex-col items-center justify-center text-slate-300">
                            <Search size={64} className="mb-6 opacity-20" />
                            <p className="font-black text-xl tracking-tight">لا توجد سجلات مطابقة لمعايير البحث</p>
                            <p className="text-sm font-medium mt-2">جرب البحث بكلمات أخرى أو بمعرف الطالب</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OMRResults;
