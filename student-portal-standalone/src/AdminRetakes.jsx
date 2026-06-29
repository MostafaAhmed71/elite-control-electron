import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RotateCcw, RefreshCw, Trash2, Search, Calendar, BookOpen,
  User, Hash, School, X, AlertCircle, FileDown
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getAllRetakeRequests, deleteRetakeRequest, getAppSettings } from './dataService';

const PASS_KEY = 'mo_admin_passed';

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const toDateOnly = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

export default function AdminRetakes() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(PASS_KEY) === '1');
  const [pwd, setPwd] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  const [config, setConfig] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterExam, setFilterExam] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [pdfExporting, setPdfExporting] = useState(false);
  const pdfRef = useRef(null);

  useEffect(() => { getAppSettings().then(setConfig); }, []);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await getAllRetakeRequests();
      setItems(data);
    } catch (e) {
      setError('تعذر تحميل الطلبات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authed) load();
  }, [authed]);

  const handleLogin = (e) => {
    e.preventDefault();
    const adminPass = config?.moAdminPassword || 'mo2025';
    if (pwd === adminPass) {
      sessionStorage.setItem(PASS_KEY, '1');
      setAuthed(true);
      setPwdErr('');
    } else {
      setPwdErr('كلمة المرور غير صحيحة.');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(PASS_KEY);
    setAuthed(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل تريد حذف هذا الطلب نهائياً؟')) return;
    try {
      await deleteRetakeRequest(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      alert('تعذر الحذف.');
    }
  };

  const availableGrades = useMemo(() => {
    const set = new Set();
    items.forEach((it) => { if (it.studentGrade) set.add(it.studentGrade); });
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [items]);

  const availableExams = useMemo(() => {
    const set = new Set();
    items.forEach((it) => { if (it.examTitle) set.add(it.examTitle); });
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [items]);

  const availableDates = useMemo(() => {
    const set = new Set();
    items.forEach((it) => {
      const d = toDateOnly(it.scheduledDate);
      if (d) set.add(d);
    });
    return [...set].sort().reverse();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filterGrade && (it.studentGrade || '') !== filterGrade) return false;
      if (filterExam && (it.examTitle || '') !== filterExam) return false;
      if (filterDate && toDateOnly(it.scheduledDate) !== filterDate) return false;
      if (q) {
        const blob = [
          it.studentName, it.studentId, it.nationalId, it.seatNumber, it.studentGrade,
          it.examTitle,
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, filterDate, filterExam, filterGrade]);

  const handleExportPdf = async () => {
    if (!pdfRef.current || filtered.length === 0) return;
    setPdfExporting(true);
    try {
      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pageW, imgH);
      heightLeft -= pageH;

      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pageW, imgH);
        heightLeft -= pageH;
      }

      const parts = ['طلبات_اعادة_الاختبار'];
      if (filterGrade) parts.push(filterGrade.replace(/\s+/g, '_'));
      if (filterExam) parts.push(filterExam.replace(/\s+/g, '_').slice(0, 30));
      pdf.save(`${parts.join('_')}.pdf`);
    } catch {
      alert('تعذر إنشاء ملف PDF. حاول مرة أخرى.');
    } finally {
      setPdfExporting(false);
    }
  };

  const pdfFilterSummary = [
    filterGrade && `الصف: ${filterGrade}`,
    filterExam && `المادة: ${filterExam}`,
    filterDate && `الموعد: ${new Date(filterDate).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    search.trim() && `بحث: ${search.trim()}`,
  ].filter(Boolean).join(' · ');

  const schoolName = config?.schoolName || 'متوسطة وثانوية نخبة الشمال الأهلية';

  /* ── Login Screen ── */
  if (!authed) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4" dir="rtl">
        <form onSubmit={handleLogin} className="luxury-card w-full max-w-md p-8 space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 mx-auto bg-indigo-900 rounded-2xl flex items-center justify-center mb-3 shadow-lg">
              <RotateCcw className="text-white w-7 h-7" />
            </div>
            <h1 className="text-xl font-black text-slate-800">دخول الإدارة</h1>
            <p className="text-xs font-bold text-slate-500 mt-1">إدارة طلبات إعادة الاختبار</p>
          </div>
          <div className="relative">
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="كلمة المرور"
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl py-3 px-4 text-base font-bold focus:border-indigo-600 focus:bg-white outline-none transition-all"
              autoFocus
            />
          </div>
          {pwdErr && (
            <div className="flex items-center gap-2 text-rose-600 bg-rose-50 px-4 py-2.5 rounded-xl font-bold text-sm">
              <AlertCircle className="w-4 h-4" /> {pwdErr}
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-indigo-950 text-white py-3 rounded-xl font-black hover:bg-indigo-900 transition-all active:scale-[0.98]"
          >
            دخول
          </button>
          <p className="text-[10px] text-slate-400 font-bold text-center">
            يمكن تغيير كلمة المرور من إعدادات النظام (settings.moAdminPassword).
          </p>
        </form>
      </div>
    );
  }

  /* ── Admin Dashboard ── */
  return (
    <div className="min-h-screen bg-[#f8fafc] text-indigo-950 font-sans" dir="rtl">
      <div className="p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {/* Top bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-xl shadow-md border border-slate-100 flex items-center justify-center overflow-hidden p-1">
                <img src="/school_logo.jpeg" alt="logo" className="w-full h-full object-contain"
                  onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=A&background=1e1b4b&color=fff'; }} />
              </div>
              <div className="text-right">
                <h1 className="text-base sm:text-xl font-black text-slate-800 leading-tight">طلبات إعادة الاختبار</h1>
                <p className="text-[11px] font-bold text-slate-500">{schoolName}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={pdfExporting || filtered.length === 0}
                className="flex items-center gap-2 bg-indigo-950 text-white hover:bg-indigo-900 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 rounded-xl font-bold text-sm shadow-sm transition-all"
              >
                <FileDown className={`w-4 h-4 ${pdfExporting ? 'animate-pulse' : ''}`} />
                {pdfExporting ? 'جاري التصدير...' : 'تصدير PDF'}
              </button>
              <button onClick={load}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-xl font-bold text-sm shadow-sm transition-all">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
              </button>
              <button onClick={handleLogout}
                className="flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-600 hover:bg-rose-100 px-3 py-2 rounded-xl font-bold text-sm transition-all">
                خروج
              </button>
            </div>
          </div>

          {/* Stats + Filters */}
          <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-white shadow-xl p-4 sm:p-6 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Stat label="إجمالي الطلبات" value={items.length} color="indigo" />
              <Stat label="الظاهر" value={filtered.length} color="emerald" />
              <Stat label="عدد الصفوف" value={availableGrades.length} color="amber" />
              <Stat label="عدد المواد" value={availableExams.length} color="slate" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Search className="w-3 h-3" /> بحث
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="اسم الطالب، الهوية، رقم الجلوس..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all text-right pr-9"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Grade */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <School className="w-3 h-3" /> الصف
                </label>
                <select
                  value={filterGrade}
                  onChange={(e) => setFilterGrade(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
                >
                  <option value="">— كل الصفوف —</option>
                  {availableGrades.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> المادة
                </label>
                <select
                  value={filterExam}
                  onChange={(e) => setFilterExam(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
                >
                  <option value="">— كل المواد —</option>
                  {availableExams.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> الموعد
                </label>
                <select
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-all"
                >
                  <option value="">— كل المواعيد —</option>
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {new Date(d).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(search || filterDate || filterExam || filterGrade) && (
              <button
                type="button"
                onClick={() => { setSearch(''); setFilterDate(''); setFilterExam(''); setFilterGrade(''); }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
              >
                <X className="w-3 h-3" /> مسح الفلتر
              </button>
            )}
          </div>

          {/* Content */}
          {error && (
            <div className="mb-4 flex items-center gap-2 text-rose-600 bg-rose-50 px-4 py-3 rounded-xl font-bold text-sm border border-rose-100">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {loading ? (
            <div className="luxury-card p-16 text-center text-slate-400 font-bold">
              جاري التحميل...
            </div>
          ) : filtered.length === 0 ? (
            <div className="luxury-card p-16 text-center bg-slate-50/50 border-2 border-dashed border-slate-200">
              <RotateCcw className="mx-auto text-slate-200 mb-4 w-12 h-12" />
              <h3 className="text-xl font-black text-slate-400">لا توجد طلبات</h3>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block luxury-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-indigo-950 text-white">
                      <th className="p-3 text-right">الطالب</th>
                      <th className="p-3 text-right">الصف</th>
                      <th className="p-3 text-right">الهوية / الجلوس</th>
                      <th className="p-3 text-right">المادة</th>
                      <th className="p-3 text-right">النتيجة السابقة</th>
                      <th className="p-3 text-right">موعد الإعادة</th>
                      <th className="p-3 text-right">تاريخ الطلب</th>
                      <th className="p-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((it) => (
                      <tr key={it.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-800">{it.studentName || '—'}</td>
                        <td className="p-3 text-slate-600">{it.studentGrade || '—'}</td>
                        <td className="p-3 text-slate-600 font-mono text-xs">
                          {it.nationalId || it.seatNumber || it.studentId || '—'}
                        </td>
                        <td className="p-3 text-slate-700">{it.examTitle || '—'}</td>
                        <td className="p-3">
                          <span className="font-bold text-slate-700">
                            {it.originalScore ?? '—'}/{it.originalTotal ?? '—'}
                          </span>
                          {typeof it.originalPercentage === 'number' && (
                            <span className="text-slate-400 text-xs mr-2">({it.originalPercentage}%)</span>
                          )}
                        </td>
                        <td className="p-3 text-emerald-700 font-bold">{fmtDate(it.scheduledDate)}</td>
                        <td className="p-3 text-slate-500 text-xs">{fmtDate(it.requestedAt || it._rowCreatedAt)}</td>
                        <td className="p-3">
                          <button onClick={() => handleDelete(it.id)}
                            className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {filtered.map((it) => (
                  <div key={it.id} className="luxury-card p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-slate-800 text-sm truncate">{it.studentName || '—'}</div>
                          <div className="text-[11px] text-slate-500 font-bold">{it.studentGrade || '—'}</div>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(it.id)}
                        className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-all shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <Row icon={<Hash className="w-3.5 h-3.5" />} label="الهوية/الجلوس" value={it.nationalId || it.seatNumber || it.studentId} mono />
                    <Row icon={<BookOpen className="w-3.5 h-3.5" />} label="المادة" value={it.examTitle} />
                    <Row icon={<School className="w-3.5 h-3.5" />} label="النتيجة السابقة"
                      value={`${it.originalScore ?? '—'}/${it.originalTotal ?? '—'}${typeof it.originalPercentage === 'number' ? `  (${it.originalPercentage}%)` : ''}`} />
                    <Row icon={<Calendar className="w-3.5 h-3.5" />} label="موعد الإعادة" value={fmtDate(it.scheduledDate)} highlight />
                    <Row icon={<Calendar className="w-3.5 h-3.5" />} label="تاريخ الطلب" value={fmtDate(it.requestedAt || it._rowCreatedAt)} muted />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden PDF export layout */}
      <div
        ref={pdfRef}
        dir="rtl"
        className="fixed left-[-10000px] top-0 w-[1100px] bg-white p-8 text-slate-900"
        aria-hidden="true"
      >
        <div className="text-center border-b-2 border-indigo-900 pb-4 mb-4">
          <h2 className="text-2xl font-black text-indigo-950">{schoolName}</h2>
          <h3 className="text-lg font-bold text-slate-700 mt-1">طلبات إعادة الاختبار</h3>
          <p className="text-sm text-slate-500 mt-2">
            تاريخ التصدير: {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}عدد الطلبات: {filtered.length}
          </p>
          {pdfFilterSummary && (
            <p className="text-xs text-indigo-700 font-bold mt-1">الفلاتر: {pdfFilterSummary}</p>
          )}
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-indigo-950 text-white">
              <th className="border border-indigo-800 p-2 text-right">#</th>
              <th className="border border-indigo-800 p-2 text-right">الطالب</th>
              <th className="border border-indigo-800 p-2 text-right">الصف</th>
              <th className="border border-indigo-800 p-2 text-right">الهوية / الجلوس</th>
              <th className="border border-indigo-800 p-2 text-right">المادة</th>
              <th className="border border-indigo-800 p-2 text-right">النتيجة السابقة</th>
              <th className="border border-indigo-800 p-2 text-right">موعد الإعادة</th>
              <th className="border border-indigo-800 p-2 text-right">تاريخ الطلب</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it, idx) => (
              <tr key={it.id} className={idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                <td className="border border-slate-200 p-2 text-center font-bold">{idx + 1}</td>
                <td className="border border-slate-200 p-2 font-bold">{it.studentName || '—'}</td>
                <td className="border border-slate-200 p-2">{it.studentGrade || '—'}</td>
                <td className="border border-slate-200 p-2 font-mono text-xs">
                  {it.nationalId || it.seatNumber || it.studentId || '—'}
                </td>
                <td className="border border-slate-200 p-2">{it.examTitle || '—'}</td>
                <td className="border border-slate-200 p-2">
                  {it.originalScore ?? '—'}/{it.originalTotal ?? '—'}
                  {typeof it.originalPercentage === 'number' ? ` (${it.originalPercentage}%)` : ''}
                </td>
                <td className="border border-slate-200 p-2 text-emerald-800 font-bold">{fmtDate(it.scheduledDate)}</td>
                <td className="border border-slate-200 p-2 text-xs">{fmtDate(it.requestedAt || it._rowCreatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Stat = ({ label, value, color }) => (
  <div className={`bg-${color}-50 border border-${color}-100 rounded-2xl px-4 py-3 text-center`}>
    <div className={`text-[10px] font-black text-${color}-500 uppercase tracking-widest`}>{label}</div>
    <div className={`text-${color}-900 font-black text-2xl`}>{value}</div>
  </div>
);

const Row = ({ icon, label, value, mono, highlight, muted }) => (
  <div className="flex items-center justify-between gap-2 py-1.5 border-t border-slate-100 first:border-t-0">
    <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-bold">
      {icon} <span>{label}</span>
    </div>
    <div className={`text-right text-[12px] font-black ${highlight ? 'text-emerald-700' : muted ? 'text-slate-400' : 'text-slate-800'} ${mono ? 'font-mono text-[11px]' : ''}`}>
      {value || '—'}
    </div>
  </div>
);
