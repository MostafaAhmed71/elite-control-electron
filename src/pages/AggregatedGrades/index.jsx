import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Table2,
  Printer,
  RefreshCcw,
  Filter,
  ClipboardCheck,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { getOmrResults, getOmrExams } from '../../utils/dataService';
import {
  printAggregatedGradesSheet,
  resolveResultClass,
  resolveResultSubject,
} from '../../utils/aggregatedGradesPrint';

const isApproved = (r) =>
  r?.approved === true ||
  r?.confirmed === true ||
  r?.approvedAt != null ||
  (r?.studentId && r?.score != null);

const AggregatedGrades = () => {
  const [allResults, setAllResults] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    setLoading(true);
    const [results, examList] = await Promise.all([getOmrResults(), getOmrExams()]);
    setAllResults((results || []).filter(isApproved));
    setExams(examList || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const examById = useMemo(() => {
    const m = new Map();
    exams.forEach((e) => {
      if (e?.id) m.set(String(e.id), e);
    });
    return m;
  }, [exams]);

  const getExamForResult = (r) =>
    examById.get(String(r.examId || '')) ||
    exams.find((e) => e?.title && e.title === r.examTitle) ||
    null;

  const classOptions = useMemo(() => {
    const set = new Set();
    allResults.forEach((r) => {
      const ex = getExamForResult(r);
      const c = resolveResultClass(r, ex);
      if (c && c !== '—') set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [allResults, exams]);

  const subjectOptions = useMemo(() => {
    const set = new Set();
    allResults.forEach((r) => {
      const ex = getExamForResult(r);
      const s = resolveResultSubject(r, ex);
      if (s && s !== '—') set.add(s);
    });
    exams.forEach((e) => {
      if (e?.subject) set.add(String(e.subject).trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [allResults, exams]);

  const filteredResults = useMemo(() => {
    return allResults.filter((r) => {
      if (selectedExamId) {
        const sel = examById.get(selectedExamId);
        const ok = r.examId === selectedExamId || (sel && r.examTitle === sel.title);
        if (!ok) return false;
      }
      const ex = getExamForResult(r);
      if (classFilter !== 'all' && resolveResultClass(r, ex) !== classFilter) return false;
      if (subjectFilter !== 'all' && resolveResultSubject(r, ex) !== subjectFilter) return false;
      const q = searchTerm.trim();
      if (!q) return true;
      return (
        (r.studentName || '').includes(q) ||
        (r.studentId || '').includes(q)
      );
    });
  }, [allResults, selectedExamId, classFilter, subjectFilter, searchTerm, examById, exams]);

  const selectedExam = selectedExamId ? examById.get(selectedExamId) : null;

  const displayClass =
    classFilter !== 'all'
      ? classFilter
      : selectedExam?.grade ||
        (Array.isArray(selectedExam?.grades) ? selectedExam.grades[0] : '') ||
        'جميع الصفوف';

  const displaySubject =
    subjectFilter !== 'all'
      ? subjectFilter
      : selectedExam?.subject || selectedExam?.title || 'جميع المواد';

  const handlePrint = () => {
    printAggregatedGradesSheet(filteredResults, {
      classGrade: displayClass,
      subject: displaySubject,
      examTitle: selectedExam?.title || '',
      examStage: selectedExam?.stage || '',
      sheetTitle: 'كشف درجات مجمع',
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 size={40} className="animate-spin text-indigo-500 mb-4" />
        <p className="font-black text-slate-600">جاري تحميل النتائج المعتمدة...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in pb-20 font-alexandria">
      <div className="luxury-card p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-none bg-gradient-to-br from-white to-emerald-50/30">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <Table2 size={24} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 font-header">كشف درجات مجمع</h1>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Aggregated Grades Sheet</p>
            </div>
          </div>
          <p className="text-slate-500 text-sm font-medium max-w-lg">
            جدول بسيط: الصف والمادة في الترويسة، ثم أسماء الطلاب ودرجاتهم — للنتائج المعتمدة فقط.
          </p>
          <Link
            to="/approved-results"
            className="inline-flex items-center gap-2 mt-3 text-xs font-black text-indigo-600 hover:text-indigo-800"
          >
            <ClipboardCheck size={14} />
            كشف المعتمدين (تفاصيل كاملة)
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:border-indigo-300"
          >
            <RefreshCcw size={16} />
            تحديث
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!filteredResults.length}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-black hover:bg-emerald-700 disabled:opacity-40 shadow-lg shadow-emerald-100"
          >
            <Printer size={18} />
            طباعة الكشف ({filteredResults.length})
          </button>
        </div>
      </div>

      <div className="luxury-card p-6 border-none space-y-4">
        <div className="flex items-center gap-2 text-sm font-black text-slate-700">
          <Filter size={16} className="text-indigo-500" />
          فلاتر الكشف
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">الاختبار</label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">كل الاختبارات</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title || ex.subject}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">الصف</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">كل الصفوف</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">المادة</label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="all">كل المواد</option>
              {subjectOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">بحث</label>
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="اسم أو رقم..."
                className="w-full pr-9 pl-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
        </div>
        {(selectedExamId || classFilter !== 'all' || subjectFilter !== 'all' || searchTerm) && (
          <button
            type="button"
            onClick={() => {
              setSelectedExamId('');
              setClassFilter('all');
              setSubjectFilter('all');
              setSearchTerm('');
            }}
            className="text-xs font-black text-rose-600 flex items-center gap-1"
          >
            <X size={14} />
            مسح الفلاتر
          </button>
        )}
      </div>

      <div className="luxury-card overflow-hidden border-none">
        <div className="bg-slate-900 text-white px-6 py-4 text-center">
          <div className="text-lg font-black">{displayClass}</div>
          <div className="text-sm opacity-90 mt-1">
            المادة: <span className="font-black">{displaySubject}</span>
            {selectedExam?.title ? (
              <span className="opacity-70"> — {selectedExam.title}</span>
            ) : null}
          </div>
        </div>
        {filteredResults.length === 0 ? (
          <div className="p-16 text-center text-slate-500 font-bold">
            لا توجد نتائج معتمدة مطابقة. اعتمد الأوراق من{' '}
            <Link to="/omr-scanner" className="text-indigo-600 underline">
              تصحيح OMR
            </Link>{' '}
            أو راجع{' '}
            <Link to="/approved-results" className="text-indigo-600 underline">
              كشف المعتمدين
            </Link>
            .
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="py-3 px-4 text-center font-black w-12">م</th>
                  <th className="py-3 px-4 text-right font-black">اسم الطالب</th>
                  <th className="py-3 px-4 text-center font-black w-32">الدرجة</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredResults]
                  .sort((a, b) =>
                    String(a.studentName || '').localeCompare(String(b.studentName || ''), 'ar')
                  )
                  .map((r, idx) => (
                    <tr key={r.id || idx} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="py-3 px-4 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-3 px-4 font-black text-slate-800">
                        {r.studentName || r.studentId}
                      </td>
                      <td className="py-3 px-4 text-center font-black text-indigo-700">
                        {r.score != null && r.total != null ? `${r.score} / ${r.total}` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AggregatedGrades;
