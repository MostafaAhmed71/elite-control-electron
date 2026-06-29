import React, { useState, useEffect } from 'react';
import { getOmrResults, getOmrExams, getAppSettings, getStudents } from '../../utils/dataService';
import { Search, Printer, CheckCircle, AlertCircle } from 'lucide-react';

const getGradeLabel = (pct) => {
  if (pct >= 90) return { label: 'ممتاز', color: '#16a34a', bg: '#dcfce7' };
  if (pct >= 80) return { label: 'جيد جداً', color: '#2563eb', bg: '#dbeafe' };
  if (pct >= 70) return { label: 'جيد', color: '#7c3aed', bg: '#ede9fe' };
  if (pct >= 50) return { label: 'مقبول', color: '#d97706', bg: '#fef3c7' };
  return { label: 'ضعيف', color: '#dc2626', bg: '#fee2e2' };
};

const getLetterAr = (l) => ({ A: 'أ', B: 'ب', C: 'ج', D: 'د', E: 'هـ' }[l] || l || '—');

const ResultSlip = ({ result, schoolName }) => {
  const g = getGradeLabel(result.percentage);
  const gradeHexColor = g.color;

  const details = result.details || {};
  const qs = Object.keys(details).sort((a, b) => parseInt(a) - parseInt(b));

  // Split questions into two columns (Q1-15 right, Q16-30 left — RTL)
  const col1 = qs.filter(q => parseInt(q) <= 15);
  const col2 = qs.filter(q => parseInt(q) > 15);
  const maxRows = Math.max(col1.length, col2.length, 1);

  const rows = Array.from({ length: maxRows }, (_, i) => {
    const q1 = col1[i]; const q2 = col2[i];
    return { q1, d1: q1 ? details[q1] : null, q2, d2: q2 ? details[q2] : null };
  });

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 mb-8 max-w-3xl mx-auto print:shadow-none print:border-none print:w-full">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-900 text-white p-6 md:p-8 flex justify-between items-center print:bg-slate-900 print:text-black">
        <div>
          <h2 className="text-2xl font-black tracking-tight">{schoolName}</h2>
          <p className="text-indigo-200 text-sm mt-1 font-medium">نظام التصحيح الآلي OMR — نتيجة الاختبار</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 px-5 text-center border border-white/20">
          <div className="text-3xl font-black">{result.score}<span className="text-lg opacity-70">/{result.total}</span></div>
          <div className="text-sm font-bold text-indigo-100">{parseFloat(result.percentage).toFixed(1)}%</div>
        </div>
      </div>

      <div className="p-6 md:p-8">
        {/* Student Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 print:bg-transparent">
          <div>
            <span className="block text-slate-500 text-xs font-bold mb-1">اسم الطالب</span>
            <strong className="text-slate-900 text-lg">{result.studentName || result.studentId}</strong>
          </div>
          <div>
            <span className="block text-slate-500 text-xs font-bold mb-1">الصف</span>
            <strong className="text-slate-900">{result.studentGrade || '—'}</strong>
          </div>
          <div>
            <span className="block text-slate-500 text-xs font-bold mb-1">الاختبار</span>
            <strong className="text-slate-900">{result.examTitle || '—'}</strong>
          </div>
          <div>
            <span className="block text-slate-500 text-xs font-bold mb-1">رقم الهوية</span>
            <strong className="text-slate-700 font-mono tracking-wider">{result.studentId}</strong>
          </div>
        </div>

        {/* Score Visual */}
        <div 
          className="flex flex-col md:flex-row items-center gap-6 mb-8 bg-white border-2 rounded-xl p-5"
          style={{ borderColor: `${gradeHexColor}33` }}
        >
          <div className="text-5xl font-black leading-none" style={{ color: gradeHexColor }}>
            {result.score}<span className="text-2xl text-slate-400">/{result.total}</span>
          </div>
          <div className="flex-1 w-full">
            <div className="bg-slate-100 rounded-full h-3 overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-1000" 
                style={{ width: `${result.percentage}%`, backgroundColor: gradeHexColor }}
              ></div>
            </div>
            <div className="mt-2 text-sm font-bold flex justify-between" style={{ color: gradeHexColor }}>
              <span>{g.label}</span>
              <span>{parseFloat(result.percentage).toFixed(1)}%</span>
            </div>
          </div>
          <div 
            className="text-2xl font-black px-6 py-3 rounded-lg border-2"
            style={{ backgroundColor: `${gradeHexColor}15`, color: gradeHexColor, borderColor: `${gradeHexColor}30` }}
          >
            {g.label}
          </div>
        </div>

        {/* Answers Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm text-center">
            <thead>
              <tr className="bg-slate-800 text-white print:bg-slate-200 print:text-black">
                <th className="p-3 border border-slate-700 w-12">النتيجة</th>
                <th className="p-3 border border-slate-700 w-12">الصواب</th>
                <th className="p-3 border border-slate-700 w-12">إجابتك</th>
                <th className="p-3 border border-slate-700 bg-slate-900 print:bg-slate-300">السؤال</th>
                <th className="w-4 bg-slate-100 print:bg-transparent"></th>
                <th className="p-3 border border-slate-700 w-12">النتيجة</th>
                <th className="p-3 border border-slate-700 w-12">الصواب</th>
                <th className="p-3 border border-slate-700 w-12">إجابتك</th>
                <th className="p-3 border border-slate-700 bg-slate-900 print:bg-slate-300">السؤال</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ q1, d1, q2, d2 }, idx) => (
                <tr key={idx} className="border-b border-slate-200 last:border-0 hover:bg-slate-50">
                  {/* Left Column (Q16-30 originally) */}
                  {q2 ? (
                    <>
                      <td className={`p-2 border border-slate-200 font-bold ${d2.is_correct ? 'text-emerald-600' : 'text-red-500'}`}>
                        {d2.is_correct ? `+${d2.weight}` : '✗'}
                      </td>
                      <td className="p-2 border border-slate-200">{getLetterAr(d2.correct_option)}</td>
                      <td className="p-2 border border-slate-200 font-bold">{getLetterAr(d2.student_answer)}</td>
                      <td className="p-2 border border-slate-200 bg-slate-50 font-bold text-slate-800">
                        {q2} <span className="text-[10px] text-slate-400 font-normal">({d2.weight}ن)</span>
                      </td>
                    </>
                  ) : <td colSpan="4" className="border border-slate-200"></td>}
                  
                  <td className="bg-slate-100 border-x border-slate-200"></td>
                  
                  {/* Right Column (Q1-15 originally) */}
                  {q1 ? (
                    <>
                      <td className={`p-2 border border-slate-200 font-bold ${d1.is_correct ? 'text-emerald-600' : 'text-red-500'}`}>
                        {d1.is_correct ? `+${d1.weight}` : '✗'}
                      </td>
                      <td className="p-2 border border-slate-200">{getLetterAr(d1.correct_option)}</td>
                      <td className="p-2 border border-slate-200 font-bold">{getLetterAr(d1.student_answer)}</td>
                      <td className="p-2 border border-slate-200 bg-slate-50 font-bold text-slate-800">
                        {q1} <span className="text-[10px] text-slate-400 font-normal">({d1.weight}ن)</span>
                      </td>
                    </>
                  ) : <td colSpan="4" className="border border-slate-200"></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t-2 border-dashed border-slate-200 flex justify-between items-center text-sm">
          <div className="text-slate-400">تاريخ التصحيح: {new Date(result.timestamp || Date.now()).toLocaleDateString('ar-SA')}</div>
           <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg border border-emerald-200 font-bold">
            <CheckCircle size={16} />
            <span>نتيجة معتمدة رسمياً</span>
          </div>
        </div>
      </div>
    </div>
  );
};

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

const studentNationalIdNorms = (s) =>
  [s?.nationalId, s?.national_id, s?.id, s?.studentId, s?.student_id]
    .map((v) => normalizeNationalId(String(v ?? '')))
    .filter(Boolean);

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

const isApprovedOmrResult = (r) => {
  const t = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  if (t(r?.approved) || t(r?.confirmed)) return true;
  if (r?.approvedAt != null && String(r.approvedAt).trim() !== '') return true;
  const sid = r?.studentId != null ? String(r.studentId).trim() : '';
  if (sid && r?.score != null) return true;
  return false;
};

export default function StudentPortal() {
  const [studentId, setStudentId] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState(null);

  useEffect(() => {
    getAppSettings().then(setConfig);
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!studentId.trim()) return;

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const allResults = await getOmrResults();
      const allStudents = await getStudents();
      
      const inputNorm = normalizeNationalId(studentId);
      if (!inputNorm) {
        setError('يرجى إدخال رقم هوية صالح.');
        setLoading(false);
        return;
      }

      const bySeatMap = buildSeatStudentMap(allStudents);

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

      const matching = allResults.filter(natMatchesResult);

      if (matching.length > 0) {
        setResults(matching);
      } else {
        setError('عذراً، لم نتمكن من العثور على أي نتائج معتمدة لرقم الهوية هذا.');
      }
    } catch (err) {
      console.error(err);
      setError('حدث خطأ أثناء البحث عن النتيجة.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans" dir="rtl">
      {/* Hide search UI when printing */}
      <div className="print:hidden h-full">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 h-20 px-8 flex items-center justify-between sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-blue-600 rounded-full"></div>
              <div className="w-2.5 h-2.5 bg-slate-300 rounded-full"></div>
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">
              بوابة الطالب — <span className="text-blue-600">الاستعلام عن النتائج</span>
            </h1>
          </div>
          <div className="text-slate-500 font-bold text-sm hidden md:block">
            {config?.schoolName || 'نظام الرصد الذكي'}
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-12 md:py-20">
          {/* Search Box */}
          <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 border border-slate-100 max-w-2xl mx-auto mb-12 text-center relative overflow-hidden">
             
             {/* Decorative Background */}
             <div className="absolute -top-32 -right-32 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-60"></div>
             <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-indigo-50 rounded-full blur-3xl opacity-60"></div>

             <div className="relative z-10">
                <h2 className="text-3xl font-black mb-4">احصل على نتيجتك</h2>
                <p className="text-slate-500 font-medium mb-8">أدخل رقم الهوية الخاص بك في الخانة أدناه لعرض نتيجة الاختبارات المعتمدة.</p>

                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400" size={22} />
                    <input 
                      type="text" 
                      placeholder="أدخل رقم الهوية ..." 
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 pr-14 pl-6 text-xl font-bold focus:border-blue-500 focus:bg-white outline-none transition-all shadow-inner"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={loading || !studentId.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                  >
                    {loading ? 'جاري البحث...' : 'عــرض النـتـيـجـة'}
                  </button>
                </form>

                {error && (
                  <div className="mt-6 flex items-center justify-center gap-2 text-rose-600 bg-rose-50 px-6 py-4 rounded-xl border border-rose-100 font-bold animate-fade-in">
                    <AlertCircle size={20} />
                    <span>{error}</span>
                  </div>
                )}
             </div>
          </div>

          {/* Results Action Bar */}
          {results && results.length > 0 && (
             <div className="flex justify-between items-center mb-8 bg-blue-50/50 p-4 rounded-xl border border-blue-100 animate-fade-in">
                <div className="font-bold text-blue-900">
                  تم العثور على <span className="text-blue-600 bg-white px-3 py-1 rounded-lg border border-blue-200 mx-1">{results.length}</span> اختبارات معتمدة لهذا الطالب:
                </div>
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-2 bg-slate-900 border-2 border-transparent text-white px-6 py-2.5 rounded-xl hover:bg-slate-800 transition-all font-bold shadow-lg shadow-slate-200 active:scale-95"
                >
                  <Printer size={18} />
                  <span>تحميل كـ PDF / طباعة</span>
                </button>
             </div>
          )}
        </main>
      </div>

      {/* Actual Results Rendering (Visible normally and when printing) */}
      {results && results.length > 0 && (
        <div className="max-w-4xl mx-auto px-4 pb-20 animate-fade-in print:p-0 print:m-0">
          {results.map((r, i) => (
             <div key={i} className="print:break-inside-avoid print:mb-10">
                <ResultSlip result={r} schoolName={config?.schoolName || 'منصة التصحيح الذكي'} />
             </div>
          ))}
        </div>
      )}
    </div>
  );
}
