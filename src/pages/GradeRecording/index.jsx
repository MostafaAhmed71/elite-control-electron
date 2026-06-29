import React, { useState, useEffect, useMemo } from 'react';
import { Search, Trophy, User, Users as UsersIcon, CheckCircle2, Filter, FileText, Download, TrendingUp, BookOpen, BarChart2, X, Calendar, Clock, Loader2, Trash2, AlertTriangle, Eraser, PieChart } from 'lucide-react';
import {
  getStudents,
  getOmrResultsForGrading,
  getOmrExams,
  saveOmrResult,
  deleteOmrResult,
  getAppSettings,
  isSupabaseQuotaError,
} from '../../utils/dataService';
import { findStudentByDetectedId } from '../../utils/studentIdentity';
import { useToast } from '../../components/Toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const STAGES = {
  'ابتدائي': ['الأول الابتدائي','الثاني الابتدائي','الثالث الابتدائي','الرابع الابتدائي','الخامس الابتدائي','السادس الابتدائي'],
  'متوسط':  ['الأول المتوسط','الثاني المتوسط','الثالث المتوسط'],
  'ثانوي':  ['الأول الثانوي','الثاني الثانوي','الثالث الثانوي'],
};

/* ── Grade Normalizer ──────────────────────────────────────────────────
 * Handles all common Arabic grade formats:
 *   "الثالث الابتدائي" / "ثالث ابتدائي" / "3 ابتدائي" / "3ابتدائي"
 *   "الأول المتوسط"   / "1 متوسط"      / "اول متوسط"
 * Returns a canonical form like "الثالث الابتدائي" for comparison.
 * ─────────────────────────────────────────────────────────────────── */
const NUM_WORDS = {
  '1': 'الأول', 'أولى': 'الأول', 'اول': 'الأول', 'أول': 'الأول', 'الاول': 'الأول', 'الأولى': 'الأول',
  '2': 'الثاني', 'ثاني': 'الثاني', 'ثانى': 'الثاني', 'الثانى': 'الثاني',
  '3': 'الثالث', 'ثالث': 'الثالث',
  '4': 'الرابع', 'رابع': 'الرابع',
  '5': 'الخامس', 'خامس': 'الخامس',
  '6': 'السادس', 'سادس': 'الخامس',
};
const STAGE_WORDS = {
  'ابتدائي': 'الابتدائي', 'ابتدائى': 'الابتدائي', 'الابتدائى': 'الابتدائي',
  'متوسط': 'المتوسط', 'المتوسط': 'المتوسط',
  'ثانوي': 'الثانوي', 'ثانوى': 'الثانوي', 'الثانوى': 'الثانوي',
};

const normalizeGrade = (raw = '') => {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';

  // Extract parts: number/ordinal word + stage word
  // Pattern examples: "3 ابتدائي", "ثالث ابتدائي", "الثالث الابتدائي"
  const parts = s.split(' ');
  let numPart = '', stagePart = '';

  for (const p of parts) {
    const pClean = p.replace(/^ال/, ''); // strip ال prefix
    if (NUM_WORDS[p] || NUM_WORDS[pClean]) {
      numPart = NUM_WORDS[p] || NUM_WORDS[pClean];
    } else if (STAGE_WORDS[p] || STAGE_WORDS[pClean]) {
      stagePart = STAGE_WORDS[p] || STAGE_WORDS[pClean] || `ال${pClean}`;
    }
  }

  if (numPart && stagePart) return `${numPart} ${stagePart}`;
  // If no match found, return cleaned original
  return s;
};

/* Checks if a student's grade matches the selected filter grade */
const gradeMatches = (studentGrade, filterGrade) => {
  if (!filterGrade || filterGrade === 'All') return true;
  if (!studentGrade) return false;
  // Exact match first
  if (studentGrade === filterGrade) return true;
  // Normalized comparison
  return normalizeGrade(studentGrade) === normalizeGrade(filterGrade);
};

/** تسمية المادة الموحّدة (عنوان الاختبار أو حقل subject) */
const examSubjectLabel = (examOrResult) => {
  if (!examOrResult) return '';
  return (
    examOrResult.title ||
    examOrResult.subject ||
    examOrResult.examTitle ||
    ''
  ).toString().trim();
};

const getSchoolNameByStage = (stage = '') => {
  const s = String(stage || '').trim();
  if (s === 'ابتدائي' || s === 'الابتدائي') return 'مدارس نخبة الشمال الأهلية والعالمية';
  if (s === 'متوسط' || s === 'المتوسط' || s === 'ثانوي' || s === 'الثانوي') return 'متوسطة وثانوية نخبة الشمال الأهلية';
  return 'مدارس نخبة الشمال الأهلية والعالمية';
};

const slugifyFilename = (text = '') =>
  String(text)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[\\/:*?"<>|]/g, '')
    .slice(0, 80) || 'عام';

/** دقة منخفضة = تصدير أسرع وأقل تجميداً للمتصفح */
const PDF_CAPTURE_SCALE = 1;
const PDF_ITEMS_PER_PAGE = 18;
/** عدد أعمدة المواد في صفحة واحدة عند “تصدير مجمّع كل المواد” (لتفادي ضيق العرض) */
const PDF_SUBJECTS_PER_SECTION = 6;
/** عدد الطلاب في كل صفحة عند “تصدير مجمّع كل المواد” */
const PDF_ITEMS_PER_PAGE_ALL_SUBJECTS = 10;

const waitForPaint = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFrames = async (frames = 2) => {
  for (let i = 0; i < frames; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  await waitForPaint(60);
};

/** صفحة طباعة واحدة — تُعرض فقط أثناء التصدير لتجنّب آلاف العقد في DOM */
const PrintableGradePage = ({
  schoolName,
  examTitle,
  sheetTitle,
  subjectLabel,
  gradeLabel,
  academicYear,
  pageStudents,
  pageIndex,
  totalPages,
  resultIndex,
}) => (
  <div
    id="grade-recording-print-page"
    className="printable-page bg-white p-12 text-black relative"
    style={{
      width: '210mm',
      height: '297mm',
      fontFamily: 'Tahoma, Arial, sans-serif',
      direction: 'rtl',
      backgroundColor: '#ffffff',
      color: '#000000',
    }}
  >
    <div className="text-center mb-8 space-y-3">
      <h1 style={{ fontSize: '22px', fontWeight: 700 }}>{schoolName}</h1>
      <h2 style={{ fontSize: '18px', fontWeight: 700, borderBottom: '2px solid black', display: 'inline-block', paddingBottom: 8 }}>
        {examTitle ||
          (subjectLabel === 'اختبار مجمع'
            ? 'اختبار محاكي اختبار نافس (اختبار مجمع)'
            : `اختبار نهاية الدور الأول - الفصل الدراسي الثاني العام الدراسي ${academicYear}`)}
      </h2>
      <div style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, padding: '10px 24px', border: '2px solid black', display: 'inline-block' }}>
          {sheetTitle || 'كشف رصد الدرجات'}
        </h3>
        {subjectLabel && (
          <p style={{ fontSize: '15px', fontWeight: 700, marginTop: 8 }}>
            المادة: {subjectLabel}
            {gradeLabel && gradeLabel !== 'All' ? ` | الصف: ${gradeLabel}` : ''}
          </p>
        )}
      </div>
    </div>

    <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black', marginTop: 16 }}>
      <thead>
        <tr style={{ backgroundColor: '#f3f4f6' }}>
          <th style={{ border: '1px solid black', padding: 8, width: 40 }}>م</th>
          <th style={{ border: '1px solid black', padding: 8 }}>اسم الطالب</th>
          <th style={{ border: '1px solid black', padding: 8, width: 90 }}>
            {subjectLabel === 'اختبار مجمع' ? 'الدرجة' : subjectLabel || 'الدرجة'}
          </th>
        </tr>
      </thead>
      <tbody>
        {pageStudents.map((s, idx) => {
          const sResults = resultIndex[s.id] || {};
          const res = subjectLabel ? sResults[subjectLabel] : null;
          const globalIdx = pageIndex * PDF_ITEMS_PER_PAGE + idx + 1;
          return (
            <tr key={s.id}>
              <td style={{ border: '1px solid black', padding: 8, textAlign: 'center' }}>{globalIdx}</td>
              <td style={{ border: '1px solid black', padding: 8, textAlign: 'center', fontWeight: 700 }}>
                {s.name || '—'}
              </td>
              <td style={{ border: '1px solid black', padding: 8, textAlign: 'center', fontWeight: 700 }}>
                {res ? `${res.score} / ${res.total}` : '-'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>

    <div style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: '#6b7280' }}>
      صفحة {pageIndex + 1} من {totalPages}
    </div>

    {pageIndex === totalPages - 1 && (
      <div style={{ marginTop: 40, textAlign: 'left', paddingLeft: 48, fontSize: 13, fontWeight: 700 }}>
        <div style={{ textAlign: 'center', display: 'inline-block' }}>
          <div style={{ marginBottom: 8 }}>يعتمد مدير المدرسة</div>
          <div>......................................</div>
        </div>
      </div>
    )}
  </div>
);

/** صفحة طباعة “مجمّع كل المواد” — (اسم الطالب + أعمدة المواد) */
const PrintableAllSubjectsPage = ({
  schoolName,
  examTitle,
  sheetTitle,
  gradeLabel,
  academicYear,
  pageStudents,
  pageIndex,
  totalPages,
  subjects,
  sectionIndex,
  sectionTotal,
  resultIndex,
}) => (
  <div
    id="grade-recording-print-page-multi"
    className="printable-page bg-white text-black relative"
    style={{
      width: '297mm',
      height: '210mm',
      fontFamily: 'Tahoma, Arial, sans-serif',
      direction: 'rtl',
      backgroundColor: '#ffffff',
      color: '#000000',
    }}
  >
    {/* تصميم “رسمي”: جدول فقط — بلا ترويسة/ألوان/شعارات */}
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        border: '1px solid #000',
        margin: '12mm',
      }}
    >
      <thead>
        <tr>
          <th style={{ border: '1px solid #000', padding: 6, width: 34, textAlign: 'center' }}>م</th>
          <th style={{ border: '1px solid #000', padding: 6, width: 210, textAlign: 'right' }}>اسم الطالب</th>
          {subjects.map((sub) => (
            <th
              key={sub}
              style={{
                border: '1px solid #000',
                padding: 6,
                textAlign: 'center',
                minWidth: 92,
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {sub}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pageStudents.map((s, idx) => {
          const sResults = resultIndex[s.id] || {};
          const globalIdx = pageIndex * PDF_ITEMS_PER_PAGE + idx + 1;
          return (
            <tr key={s.id}>
              <td style={{ border: '1px solid #000', padding: 6, textAlign: 'center', fontSize: 12 }}>{globalIdx}</td>
              <td style={{ border: '1px solid #000', padding: 6, textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                {s.name || '—'}
              </td>
              {subjects.map((sub) => {
                const res = sResults[sub];
                const v = res ? `${res.score}/${res.total}` : '-';
                return (
                  <td
                    key={sub}
                    style={{
                      border: '1px solid #000',
                      padding: 6,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const GradeRecording = () => {
  const toast = useToast();
  const [students,   setStudents]   = useState([]);
  const [results,    setResults]    = useState([]);
  const [exams,      setExams]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [academicYear, setAcademicYear] = useState('1447');

  /* Filters */
  const [searchTerm,     setSearchTerm]     = useState('');
  const [filterStage,    setFilterStage]    = useState('All');
  const [filterGrade,    setFilterGrade]    = useState('All');
  const [filterSubject,  setFilterSubject]  = useState('All'); 
  const [filterDate,     setFilterDate]     = useState('All');
  const [filterExamId,   setFilterExamId]   = useState('All');
  const [showOnlyTested, setShowOnlyTested] = useState(false);

  /* Statistics */
  const [showStats, setShowStats] = useState(false);

  /* Export Modal & Metadata */
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDay,         setExportDay]         = useState('الأحد');
  const [exportDate,        setExportDate]        = useState(new Date().toLocaleDateString('ar-SA'));
  const [exportExamTitle,   setExportExamTitle]   = useState('');
  const [exportSheetTitle,  setExportSheetTitle]  = useState('كشف رصد الدرجات');
  const [isExporting,       setIsExporting]       = useState(false);
  const [isExportingStats,  setIsExportingStats]  = useState(false);
  const [isZeroing,         setIsZeroing]         = useState(false);
  /** صفحة واحدة للتصدير: { subjectLabel, pageIndex, totalPages } */
  const [exportPageRender, setExportPageRender] = useState(null);
  /** صفحة واحدة للتصدير المجمّع: { subjects, sectionIndex, sectionTotal, pageIndex, totalPages } */
  const [exportAllSubjectsRender, setExportAllSubjectsRender] = useState(null);
  const [exportStatsRender, setExportStatsRender] = useState(false);
  const [exportProgress, setExportProgress] = useState({
    subjectIdx: 0,
    subjectTotal: 0,
    label: '',
    page: 0,
    pageTotal: 0,
  });

  useEffect(() => { loadData(); }, []);

  /* إن أُرشف الاختبار المحدد في الفلتر، أعد الفلتر إلى «الكل» */
  useEffect(() => {
    if (filterExamId === 'All') return;
    if (!exams.some((e) => e.id === filterExamId)) setFilterExamId('All');
  }, [exams, filterExamId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // الطلاب أولاً — لا نربط ظهور القائمة بنجاح جلب نتائج OMR (قد تفشل أو تتأخر)
      const sd = await getStudents();
      setStudents(sd);

      const [ed, cfg] = await Promise.all([getOmrExams(), getAppSettings()]);
      setExams(ed);
      if (cfg?.academicWeight) {
        const yr = String(cfg.academicWeight).match(/(\d{4})/);
        setAcademicYear(yr ? yr[1] : cfg.academicWeight);
      }

      try {
        const rd = await getOmrResultsForGrading();
        setResults(rd);
        if (rd._partialFetch) {
          toast.error(
            `تم تحميل ${rd.length} نتيجة فقط ثم انقطع الاتصال. أعد تحميل الصفحة أو تحقق من الشبكة لعرض الباقي.`,
            'تحميل جزئي للنتائج'
          );
        }
      } catch (resultsErr) {
        console.error('GradeRecording OMR results load error:', resultsErr);
        setResults([]);
        if (isSupabaseQuotaError(resultsErr)) {
          toast.error(
            'تجاوزت مشروع Supabase حد نقل البيانات (Egress). نفّذ migration الجلب الخفيف في SQL Editor، أو رقِّ الخطة، أو انتظر بعد 17 يونيو 2026.',
            'حصة Supabase'
          );
        } else {
          toast.error(
            'تم تحميل الطلاب لكن تعذّر جلب نتائج الاختبارات. تحقق من الاتصال أو حجم البيانات.',
            'تحذير — نتائج OMR'
          );
        }
      }
    } catch (err) {
      toast.error('فشل تحميل بيانات الطلاب من قاعدة البيانات.', 'خطأ في التحميل');
      console.error('GradeRecording load error:', err);
    } finally {
      setLoading(false);
    }
  };

  /* All unique labels (title || subject) that appear in exams */
  const resolveExamForResult = (r) => (r?.examId ? exams.find((e) => e.id === r.examId) : null);

  const allSubjects = useMemo(() => {
    const subs = new Set();
    exams.forEach((e) => {
      const label = examSubjectLabel(e);
      if (label) subs.add(label);
    });
    results.forEach((r) => {
      if (r.examId && !resolveExamForResult(r)) return;
      const exam = resolveExamForResult(r);
      const label = examSubjectLabel(exam) || examSubjectLabel(r);
      if (label) subs.add(label);
    });
    return [...subs].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [exams, results]);
  /* Grades for filter */
  const filterGrades = filterStage !== 'All' ? STAGES[filterStage] || [] : [];
  const printSchoolName = getSchoolNameByStage(filterStage);

  /* Available Dates (from results) */
  const availableDates = useMemo(() => {
    const dateMap = {}; // 'ar-EG string' -> timestamp
    results.forEach((r) => {
      const exam = resolveExamForResult(r);
      if (!exam) return;
      const ts = r.timestamp || r.scannedAt;
      if (!ts) return;
      const d = new Date(ts);
      const str = d.toLocaleDateString('ar-EG');
      if (!dateMap[str] || new Date(ts) > new Date(dateMap[str])) {
        dateMap[str] = ts;
      }
    });
    
    return Object.keys(dateMap).sort((a, b) => new Date(dateMap[b]) - new Date(dateMap[a]));
  }, [results, exams]);

  /* Available Exams (Tests) */
  const availableExams = useMemo(() => {
    return exams.filter(e => {
      if (filterStage !== 'All' && e.stage !== filterStage) return false;
      if (filterGrade !== 'All' && e.grade !== filterGrade) return false;
      if (filterSubject !== 'All' && examSubjectLabel(e) !== filterSubject) return false;
      return true;
    });
  }, [exams, filterStage, filterGrade, filterSubject]);

  /* فهرس النتائج: مفتاح = students.id ← مادة ← أفضل نتيجة */
  const resultIndex = useMemo(() => {
    const idx = {};

    const resultTimestamp = (r) => {
      const t = r.timestamp || r.scannedAt || r.approvedAt || r.createdAt;
      const d = t ? new Date(t) : null;
      return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
    };

    const resolveStudentForResult = (r) => {
      const candidates = [
        r.studentId,
        r.detectedStudentId,
        r.normalizedDetectedStudentId,
        r.nationalId,
        r.national_id,
      ];
      for (const c of candidates) {
        const hit = findStudentByDetectedId(students, c);
        if (hit) return hit;
      }
      return null;
    };

    results.forEach((r) => {
      if (filterDate !== 'All') {
        const rDate = new Date(r.timestamp || r.scannedAt).toLocaleDateString('ar-EG');
        if (rDate !== filterDate) return;
      }
      if (filterExamId !== 'All' && r.examId !== filterExamId) return;

      const exam = resolveExamForResult(r);
      if (r.examId && !exam) return;

      const matchedStudent = resolveStudentForResult(r);
      if (!matchedStudent?.id) return;

      const canonicalKey = matchedStudent.id;
      const subject = examSubjectLabel(exam) || examSubjectLabel(r) || '؟';
      if (!subject || subject === '؟') return;

      if (!idx[canonicalKey]) idx[canonicalKey] = {};

      const prev = idx[canonicalKey][subject];
      if (!prev || filterExamId !== 'All' || resultTimestamp(r) >= resultTimestamp(prev)) {
        idx[canonicalKey][subject] = r;
      }
    });

    return idx;
  }, [students, results, exams, filterDate, filterExamId]);

  const studentGradeLabel = (s) =>
    (s.grade || s.classroom || s.class || '').trim();

  /* Filtered students */
  const filteredStudents = useMemo(() => students.filter(s => {
    const sGrade = studentGradeLabel(s);
    const sStage = (s.stage || '').trim();

    // ── Stage filter ──
    if (filterStage !== 'All') {
      const stageGrades = STAGES[filterStage] || [];
      const normStage = sStage.replace(/^ال/, '').trim();
      const stageFieldMatch =
        normStage === filterStage
        || sStage === filterStage
        || sStage === `ال${filterStage}`;
      const gradeInStage = stageGrades.some((sg) => gradeMatches(sGrade, sg));
      if (!stageFieldMatch && !gradeInStage) return false;
    }

    // ── Grade filter ──
    if (filterGrade !== 'All') {
      if (!gradeMatches(sGrade, filterGrade)) return false;
    }

    // ── Tested-only filter ──
    if (showOnlyTested) {
      const hasResult = resultIndex[s.id] && Object.keys(resultIndex[s.id]).length > 0;
      if (!hasResult) return false;
    }

    // ── Search filter ──
    const name = (s.name || '').toString();
    const seat = (s.seatNumber || s.seat_number || '').toString();
    const nat = (s.nationalId || s.national_id || '').toString();
    const q = searchTerm.toLowerCase();
    const matchSearch =
      !searchTerm
      || name.toLowerCase().includes(q)
      || (s.id || '').includes(searchTerm)
      || seat.includes(searchTerm)
      || nat.includes(searchTerm);
    return matchSearch;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')), [students, filterStage, filterGrade, searchTerm, showOnlyTested, resultIndex]);

  const testedCount = useMemo(() => {
    return filteredStudents.filter(s => resultIndex[s.id] && Object.keys(resultIndex[s.id]).length > 0).length;
  }, [filteredStudents, resultIndex]);

  const pendingCount = filteredStudents.length - testedCount;

  /* Subjects to display in columns */
  const displaySubjects = filterSubject === 'All' ? allSubjects : [filterSubject];

  /** مواد الصف الحالي للتصدير المتعدد (ملف PDF لكل مادة) */
  const subjectsForBatchExport = useMemo(() => {
    if (filterSubject !== 'All') return [filterSubject];

    const subs = new Set();
    exams.forEach((e) => {
      if (filterStage !== 'All' && e.stage !== filterStage) return;
      if (filterGrade !== 'All' && e.grade !== filterGrade) return;
      if (filterSubject !== 'All') {
        const label = e.title || e.subject;
        if (label && label === filterSubject) subs.add(label);
        return;
      }
      const label = e.title || e.subject;
      if (label) subs.add(label);
    });

    filteredStudents.forEach((s) => {
      const sr = resultIndex[s.id] || {};
      Object.keys(sr).forEach((k) => subs.add(k));
    });

    return [...subs].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [exams, filterStage, filterGrade, filterSubject, filteredStudents, resultIndex]);

  const isMultiSubjectExport = filterSubject === 'All' && subjectsForBatchExport.length > 1;

  const exportPageSlice = useMemo(() => {
    if (!exportPageRender) return null;
    const { subjectLabel, pageIndex, totalPages } = exportPageRender;
    const start = pageIndex * PDF_ITEMS_PER_PAGE;
    return {
      subjectLabel,
      pageIndex,
      totalPages,
      students: filteredStudents.slice(start, start + PDF_ITEMS_PER_PAGE),
    };
  }, [exportPageRender, filteredStudents]);

  const exportAllSubjectsSlice = useMemo(() => {
    if (!exportAllSubjectsRender) return null;
    const { subjects, sectionIndex, sectionTotal, pageIndex, totalPages } = exportAllSubjectsRender;
    const start = pageIndex * PDF_ITEMS_PER_PAGE_ALL_SUBJECTS;
    return {
      subjects,
      sectionIndex,
      sectionTotal,
      pageIndex,
      totalPages,
      students: filteredStudents.slice(start, start + PDF_ITEMS_PER_PAGE_ALL_SUBJECTS),
    };
  }, [exportAllSubjectsRender, filteredStudents]);

  /* ── Performance Statistics ── */
  const performanceStats = useMemo(() => {
    const stats = { excellent: 0, veryGood: 0, good: 0, pass: 0, weak: 0, total: 0 };
    filteredStudents.forEach(s => {
      const sResults = resultIndex[s.id] || {};
      const subjectScores = displaySubjects.map(sub => sResults[sub] || null).filter(Boolean);
      
      if (subjectScores.length > 0) {
        const avgPct = subjectScores.reduce((sum, r) => sum + parseFloat(r.percentage), 0) / subjectScores.length;
        stats.total++;
        if (avgPct >= 90) stats.excellent++;
        else if (avgPct >= 80) stats.veryGood++;
        else if (avgPct >= 65) stats.good++;
        else if (avgPct >= 50) stats.pass++;
        else stats.weak++;
      }
    });
    return stats;
  }, [filteredStudents, resultIndex, displaySubjects]);

  const captureElementToCanvas = async (element) => {
    if (!element) throw new Error('عنصر التصدير غير موجود');
    return html2canvas(element, {
      scale: PDF_CAPTURE_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      foreignObjectRendering: false,
      width: element.offsetWidth,
      height: element.offsetHeight,
      onclone: (_doc, node) => {
        if (node) {
          node.setAttribute('dir', 'rtl');
          node.style.direction = 'rtl';
          node.style.fontFamily = 'Tahoma, Arial, sans-serif';
        }
      },
    });
  };

  const buildSubjectGradePdf = async (subjectLabel, onProgress) => {
    const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PDF_ITEMS_PER_PAGE));
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      onProgress?.(pageIdx + 1, totalPages);
      setExportPageRender({ subjectLabel, pageIndex: pageIdx, totalPages });
      await waitFrames(3);

      const el = document.getElementById('grade-recording-print-page');
      const canvas = await captureElementToCanvas(el);
      const imgData = canvas.toDataURL('image/jpeg', 0.82);
      if (pageIdx > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      await waitForPaint(30);
    }

    setExportPageRender(null);
    return pdf;
  };

  /** ملف واحد: أسماء الطلاب + درجاتهم في كل المواد (مقسّم إلى “أجزاء مواد” إن كثرت) */
  const buildAllSubjectsPdf = async (subjects, onProgress) => {
    const listSubjects = (subjects || []).filter(Boolean);
    if (listSubjects.length === 0) throw new Error('لا توجد مواد للتصدير');

    const subjectSections = [];
    for (let i = 0; i < listSubjects.length; i += PDF_SUBJECTS_PER_SECTION) {
      subjectSections.push(listSubjects.slice(i, i + PDF_SUBJECTS_PER_SECTION));
    }

    const totalPagesPerSection = Math.max(
      1,
      Math.ceil(filteredStudents.length / PDF_ITEMS_PER_PAGE_ALL_SUBJECTS)
    );
    const totalPagesAll = totalPagesPerSection * subjectSections.length;

    const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });

    let pageCounter = 0;
    for (let secIdx = 0; secIdx < subjectSections.length; secIdx++) {
      const subjectsSlice = subjectSections[secIdx];
      for (let pageIdx = 0; pageIdx < totalPagesPerSection; pageIdx++) {
        pageCounter++;
        onProgress?.(pageCounter, totalPagesAll, secIdx + 1, subjectSections.length);

        setExportAllSubjectsRender({
          subjects: subjectsSlice,
          sectionIndex: secIdx,
          sectionTotal: subjectSections.length,
          pageIndex: pageIdx,
          totalPages: totalPagesPerSection,
        });
        await waitFrames(3);

        const el = document.getElementById('grade-recording-print-page-multi');
        const canvas = await captureElementToCanvas(el);
        const imgData = canvas.toDataURL('image/jpeg', 0.82);
        if (pageCounter > 1) pdf.addPage();
        // Landscape A4: 297 × 210
        pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
        await waitForPaint(30);
      }
    }

    setExportAllSubjectsRender(null);
    return pdf;
  };

  const handleExportStatisticsPDF = async () => {
    if (performanceStats.total === 0) {
      alert('لا توجد إحصائيات لتصديرها.');
      return;
    }
    setIsExportingStats(true);
    setExportStatsRender(true);

    try {
      await waitFrames(3);
      const element = document.querySelector('.printable-statistics-page');
      if (!element) {
        alert('خطأ في الوصول إلى التقرير.');
        return;
      }

      const canvas = await captureElementToCanvas(element);
      const imgData = canvas.toDataURL('image/jpeg', 0.82);
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`إحصائيات_النتائج_${filterSubject === 'All' ? 'عام' : filterSubject}.pdf`);
    } catch (error) {
      console.error('Stats PDF Generation Error:', error);
      alert('حدث خطأ أثناء تصدير الإحصائيات');
    } finally {
      setExportStatsRender(false);
      setIsExportingStats(false);
    }
  };

  const handleExportPDF = async () => {
    if (filteredStudents.length === 0) {
      toast.error('لا يوجد طلاب في التصفية الحالية للتصدير.', 'تصدير PDF');
      return;
    }

    const subjectsToExport =
      filterSubject === 'All' ? subjectsForBatchExport : [filterSubject];

    if (subjectsToExport.length === 0) {
      toast.error('لا توجد مواد متاحة للتصدير ضمن الصف والفلاتر المحددة.', 'تصدير PDF');
      return;
    }

    if (isMultiSubjectExport && filterGrade === 'All') {
      toast.error('اختر صفاً محدداً أولاً لتصدير كشوف الرصد لكل المواد دفعة واحدة.', 'تصدير PDF');
      return;
    }

    setIsExporting(true);
    setShowExportModal(false);

    const gradeLabel = filterGrade === 'All' ? 'عام' : filterGrade;

    try {
      for (let sIdx = 0; sIdx < subjectsToExport.length; sIdx++) {
        const subject = subjectsToExport[sIdx];
        const pdf = await buildSubjectGradePdf(subject, (page, pageTotal) => {
          setExportProgress({
            subjectIdx: sIdx + 1,
            subjectTotal: subjectsToExport.length,
            label: subject,
            page,
            pageTotal,
          });
        });

        const fileSubject = slugifyFilename(subject);
        const fileGrade = slugifyFilename(gradeLabel);
        pdf.save(`كشف_رصد_${fileGrade}_${fileSubject}.pdf`);
        await waitForPaint(120);
      }

      if (subjectsToExport.length > 1) {
        toast.success(
          `تم تنزيل ${subjectsToExport.length} ملفات PDF (ملف لكل مادة) للصف: ${gradeLabel}`,
          'تصدير كشوف الرصد'
        );
      } else {
        toast.success('تم تصدير كشف الرصد بنجاح', 'تصدير PDF');
      }
    } catch (error) {
      console.error('PDF Generation Error:', error);
      toast.error('حدث خطأ أثناء توليد ملفات PDF', 'تصدير PDF');
    } finally {
      setExportPageRender(null);
      setExportProgress({ subjectIdx: 0, subjectTotal: 0, label: '', page: 0, pageTotal: 0 });
      setIsExporting(false);
    }
  };

  const handleExportAllSubjectsPDF = async () => {
    if (filteredStudents.length === 0) {
      toast.error('لا يوجد طلاب في التصفية الحالية للتصدير.', 'تصدير PDF');
      return;
    }
    if (allSubjects.length === 0) {
      toast.error('لا توجد مواد متاحة للتصدير حالياً.', 'تصدير PDF');
      return;
    }

    setIsExporting(true);
    setShowExportModal(false);

    const gradeLabel = filterGrade === 'All' ? 'عام' : filterGrade;
    const safeGrade = slugifyFilename(gradeLabel);

    try {
      const pdf = await buildAllSubjectsPdf(allSubjects, (page, pageTotal, sec, secTotal) => {
        setExportProgress({
          subjectIdx: sec,
          subjectTotal: secTotal,
          label: 'كشف مجمّع (كل المواد)',
          page,
          pageTotal,
        });
      });

      pdf.save(`كشف_رصد_مجمّع_${safeGrade}_كل_المواد.pdf`);
      toast.success('تم تصدير الكشف المجمّع (كل المواد) بنجاح', 'تصدير PDF');
    } catch (error) {
      console.error('All-subjects PDF Generation Error:', error);
      toast.error('حدث خطأ أثناء توليد ملف PDF المجمّع', 'تصدير PDF');
    } finally {
      setExportAllSubjectsRender(null);
      setExportProgress({ subjectIdx: 0, subjectTotal: 0, label: '', page: 0, pageTotal: 0 });
      setIsExporting(false);
    }
  };

  /* CSV Export */
  const handleExportCSV = () => {
    const subjectCols = filterSubject === 'All' ? allSubjects : [filterSubject];
const headers = ['رقم الطالب','اسم الطالب','الصف', ...subjectCols.map(s=>`${s} - الدرجة`), ...subjectCols.map(s=>`${s} - النسبة`)];
    const rows = filteredStudents.map(s => {
      const sResults = resultIndex[s.id] || {};
      const scoresCols = subjectCols.map(sub => sResults[sub] ? `${sResults[sub].score}/${sResults[sub].total}` : '-');
      const pctCols    = subjectCols.map(sub => sResults[sub] ? `${sResults[sub].percentage}%` : '-');
      return [s.id, s.name, s.grade||s.classroom||'-', ...scoresCols, ...pctCols];
    });
    const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = encodeURI(csv); a.download = 'GradeReport.csv';
    document.body.appendChild(a); a.click();
  };

  const handleClearGrades = async () => {
    const msg = filterSubject === 'All' 
      ? `هل أنت متأكد من مسح جميع درجات الطلاب المعروضين (${filteredStudents.length} طالب) لجميع المواد؟ لا يمكن التراجع عن هذه الخطوة.`
      : `هل أنت متأكد من مسح درجات مادة (${filterSubject}) لجميع الطلاب المعروضين (${filteredStudents.length} طالب)؟`;
    
    if (!window.confirm(msg)) return;

    setIsZeroing(true);
    try {
      const deletions = [];
      filteredStudents.forEach(student => {
        const sResults = resultIndex[student.id] || {};
        const subjectsToClear = filterSubject === 'All' ? Object.keys(sResults) : (sResults[filterSubject] ? [filterSubject] : []);
        
        subjectsToClear.forEach(sub => {
          const res = sResults[sub];
          if (res && res.id) {
            deletions.push(deleteOmrResult(res.id));
          }
        });
      });

      if (deletions.length > 0) {
        await Promise.all(deletions);
        await loadData();
        alert('تم مسح الدرجات بنجاح ✅');
      } else {
        alert('لا توجد درجات مرصودة لمسحها لهؤلاء الطلاب حالياً.');
      }
    } catch (error) {
      console.error('Error clearing grades:', error);
      alert('حدث خطأ أثناء مسح الدرجات.');
    } finally {
      setIsZeroing(false);
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-700">

      {/* ── Top Summary Statistics ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="luxury-card p-8 bg-white border-none shadow-2xl flex items-center gap-6 group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-bl-[100px] transition-all group-hover:w-full group-hover:h-full group-hover:rounded-none duration-700"></div>
          <div className="w-16 h-16 bg-indigo-50 rounded-2.5xl flex items-center justify-center text-indigo-600 transition-transform group-hover:rotate-12 duration-500">
            <UsersIcon size={32} />
          </div>
          <div className="relative z-10">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">إجمالي الطلاب</span>
            <span className="text-4xl font-black text-slate-900 font-header">{filteredStudents.length} <span className="text-sm font-bold text-slate-400">طالب</span></span>
          </div>
        </div>

        <div className="luxury-card p-8 bg-white border-none shadow-2xl flex items-center gap-6 group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-[100px] transition-all group-hover:w-full group-hover:h-full group-hover:rounded-none duration-700"></div>
          <div className="w-16 h-16 bg-emerald-50 rounded-2.5xl flex items-center justify-center text-emerald-600 transition-transform group-hover:rotate-12 duration-500">
            <CheckCircle2 size={32} />
          </div>
          <div className="relative z-10">
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block mb-1">تم رصد درجاتهم</span>
            <span className="text-4xl font-black text-slate-900 font-header">{testedCount} <span className="text-sm font-bold text-slate-400">طالب</span></span>
          </div>
        </div>

        <div className="luxury-card p-8 bg-white border-none shadow-2xl flex items-center gap-6 group overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-[100px] transition-all group-hover:w-full group-hover:h-full group-hover:rounded-none duration-700"></div>
          <div className="w-16 h-16 bg-amber-50 rounded-2.5xl flex items-center justify-center text-amber-600 transition-transform group-hover:rotate-12 duration-500">
            <Clock size={32} />
          </div>
          <div className="relative z-10">
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-1">في انتظار الرصد</span>
            <span className="text-4xl font-black text-slate-900 font-header">{pendingCount} <span className="text-sm font-bold text-slate-400">طالب</span></span>
          </div>
        </div>
      </div>

      {/* ── Filter & Action Bar ── */}
      <div className="luxury-card p-8 border-none bg-white shadow-2xl ring-1 ring-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-12 gap-6 items-center">
          <div className="relative lg:col-span-3 group">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 transition-colors group-focus-within:text-indigo-500" size={20}/>
            <input type="text" placeholder="ابحث باسم الطالب..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pr-12 pl-4 py-4 bg-slate-50 border-none rounded-2.5xl focus:bg-white focus:ring-4 focus:ring-indigo-50/50 font-bold text-sm transition-all shadow-inner"/>
          </div>
          <div className="lg:col-span-2">
            <select value={filterStage} onChange={e => { setFilterStage(e.target.value); setFilterGrade('All'); setFilterExamId('All'); }}
              className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:bg-white transition-all appearance-none cursor-pointer shadow-sm">
              <option value="All">كل المراحل</option>
              {Object.keys(STAGES).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <select value={filterGrade} onChange={e => { setFilterGrade(e.target.value); setFilterExamId('All'); }}
              disabled={filterStage === 'All'}
              className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:bg-white disabled:opacity-30 transition-all appearance-none cursor-pointer shadow-sm">
              <option value="All">كل الصفوف</option>
              {filterGrades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <select value={filterSubject} onChange={e => { setFilterSubject(e.target.value); setFilterExamId('All'); }}
              className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:bg-white transition-all appearance-none cursor-pointer shadow-sm">
              <option value="All">جميع المواد</option>
              {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="lg:col-span-3 flex items-center justify-end gap-3">
            <button onClick={() => setShowOnlyTested(!showOnlyTested)}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 rounded-2.5xl text-xs font-black transition-all border
                ${showOnlyTested 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-100 scale-105' 
                  : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50 hover:border-slate-200 shadow-sm'}`}>
              <Filter size={18} />
              {showOnlyTested ? 'عرض الكل' : 'المختبرين فقط'}
            </button>
            <button onClick={() => setShowStats(!showStats)}
              title="تحليل البيانات"
              className={`p-4 rounded-2.5xl transition-all border
                ${showStats 
                  ? 'bg-amber-500 text-white border-amber-500 shadow-xl shadow-amber-100 scale-105' 
                  : 'bg-white text-slate-500 border-slate-100 hover:bg-slate-50 shadow-sm'}`}>
              <PieChart size={24} />
            </button>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-50 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block px-1">ربط النتائج باختبار محدد</label>
              <select value={filterExamId} onChange={e => setFilterExamId(e.target.value)}
                className="w-full p-4 bg-indigo-50/50 border border-indigo-100 text-indigo-700 rounded-2.5xl font-black text-sm focus:ring-4 focus:ring-indigo-100 transition-all appearance-none cursor-pointer">
                <option value="All">جميع اختبارات المادة المنفذة</option>
                {availableExams.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.title} ({new Date(ex.updatedAt || ex.createdAt).toLocaleDateString('ar-EG')})</option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-4 flex items-center gap-4 pt-6 lg:pt-0">
               <button onClick={() => setShowExportModal(true)}
                className="flex-1 flex items-center justify-center gap-3 px-8 py-5 bg-slate-900 text-white rounded-2.5xl font-black hover:bg-slate-800 transition-all shadow-2xl shadow-slate-200 active:scale-95">
                <Download size={20} />
                {filterSubject === 'All' && filterGrade !== 'All'
                  ? 'تصدير كشوف PDF (ملف لكل مادة)'
                  : 'تصدير الكشوف PDF'}
              </button>
              <button onClick={handleExportCSV} title="تصدير Excel/CSV"
                className="p-5 bg-white text-slate-600 border border-slate-100 rounded-2.5xl hover:bg-slate-50 transition-all shadow-sm active:scale-95">
                <FileText size={24} />
              </button>
            </div>
            <div className="lg:col-span-3 flex justify-end pt-6 lg:pt-0">
               <button onClick={handleClearGrades} disabled={isZeroing || filteredStudents.length === 0}
                className="w-full lg:w-auto px-8 py-5 bg-rose-50 text-rose-600 border border-rose-100 rounded-2.5xl font-black hover:bg-rose-600 hover:text-white transition-all disabled:opacity-40 flex items-center justify-center gap-3 shadow-sm active:scale-95">
                {isZeroing ? <Loader2 size={20} className="animate-spin" /> : <Eraser size={20} />}
                تصفير الكشف
              </button>
            </div>
        </div>
      </div>

      {/* ── Intelligent Statistics ── */}
      {showStats && (
        <div className="space-y-8 animate-in slide-in-from-top-6 duration-700">
          {performanceStats.total > 0 ? (
            <>
              <div className="luxury-card p-10 bg-white border-none shadow-2xl flex flex-col xl:flex-row gap-12 items-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-violet-500"></div>
                <div className="w-full xl:w-1/2">
                  <h4 className="text-2xl font-black text-slate-800 mb-8 flex items-center gap-4 leading-tight">
                    <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600"><BarChart2 size={24}/></div>
                    الخارطة البيانية للأداء التحصيلي
                  </h4>
                  <PerformanceChart stats={performanceStats} />
                </div>
                <div className="w-full xl:w-1/2 space-y-8">
                  <div className="bg-slate-50/50 p-8 rounded-3xl border border-slate-100 relative group overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 -mr-16 -mt-16 rounded-full transition-transform group-hover:scale-150 duration-700"></div>
                    <h5 className="text-sm font-black text-slate-500 mb-4 flex items-center gap-3 italic relative z-10">
                      <TrendingUp size={18} className="text-indigo-400"/> رؤى ذكية (Insights)
                    </h5>
                    <p className="text-base text-slate-600 leading-relaxed font-bold relative z-10">
                      تشير البيانات إلى أن <span className="text-emerald-600 font-black">{( (performanceStats.excellent / performanceStats.total) * 100 ).toFixed(1)}%</span> من الطلاب في فئة الامتياز، 
                      بينما يحتاج <span className="text-rose-600 font-black">{( (performanceStats.weak / performanceStats.total) * 100 ).toFixed(1)}%</span> إلى خطط علاجية عاجلة.
                      <br/><br/>
                      <span className="text-xs text-slate-400 opacity-60">* تم التحليل بناءً على النتائج المرصودة حالياً.</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 flex flex-col items-center justify-center shadow-lg shadow-emerald-50/50 group transition-all hover:bg-emerald-50/30">
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 opacity-60">معدل الإتقان</span>
                        <span className="text-4xl font-black text-emerald-600 group-hover:scale-110 transition-transform">{( ((performanceStats.excellent + performanceStats.veryGood) / performanceStats.total) * 100 ).toFixed(0)}%</span>
                    </div>
                    <div className="bg-white p-6 rounded-3xl border border-slate-100 flex flex-col items-center justify-center shadow-lg shadow-indigo-50/50 group transition-all hover:bg-indigo-50/30">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 opacity-60">المتوسط العام</span>
                        <span className="text-4xl font-black text-indigo-600 group-hover:scale-110 transition-transform">
                          {( 
                            (filteredStudents.reduce((sum, s) => {
                              const r = resultIndex[s.id];
                              const scored = displaySubjects.map(sub => r?.[sub]).filter(Boolean);
                              if (scored.length === 0) return sum;
                              return sum + (scored.reduce((t, x) => t + parseFloat(x.percentage), 0) / scored.length);
                            }, 0) / performanceStats.total).toFixed(1)
                          )}<span className="text-sm">%</span>
                        </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
                <StatCard label="ممتاز (90-100)" count={performanceStats.excellent} total={performanceStats.total} color="emerald" icon={<Trophy size={20}/>} />
                <StatCard label="جيد جداً (80-89)" count={performanceStats.veryGood} total={performanceStats.total} color="blue" icon={<TrendingUp size={20}/>} />
                <StatCard label="جيد (65-79)" count={performanceStats.good} total={performanceStats.total} color="indigo" icon={<BookOpen size={20}/>} />
                <StatCard label="مقبول (50-64)" count={performanceStats.pass} total={performanceStats.total} color="amber" icon={<BarChart2 size={20}/>} />
                <StatCard label="ضعيف (< 50)" count={performanceStats.weak} total={performanceStats.total} color="rose" icon={<TrendingUp size={20} className="rotate-180"/>} />
              </div>
            </>
          ) : (
            <div className="luxury-card p-20 bg-white border-none flex flex-col items-center justify-center text-center shadow-2xl">
              <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 mb-6 shadow-inner">
                <BarChart2 size={48}/>
              </div>
              <h4 className="text-2xl font-black text-slate-400">لا تتوفر إحصائيات كافية حالياً</h4>
              <p className="text-slate-400 text-sm mt-3 max-w-md font-medium">بمجرد رصد درجات لبعض الطلاب في الصف المختار، سيتم توليد تقارير أداء ذكية تلقائياً.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Main Results Table ── */}
      <div className="luxury-card border-none bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 delay-500 duration-1000">
        {loading && (
          <div className="py-24 flex flex-col items-center justify-center gap-4 text-slate-500">
            <Loader2 size={40} className="animate-spin text-indigo-500" />
            <p className="font-black text-sm">جاري تحميل الطلاب والنتائج...</p>
          </div>
        )}
        <div className={`overflow-x-auto custom-scrollbar ${loading ? 'hidden' : ''}`}>
          <table className="w-full text-right border-collapse" dir="rtl">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-10 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-20">ت</th>
                <th className="px-10 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky right-0 bg-slate-50/50 z-20">سجل الطالب</th>
                <th className="px-8 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">حالة الرصد</th>
                {displaySubjects.map(sub => (
                  <th key={sub} className="px-8 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-400 border border-slate-100 mb-1">
                        <BookOpen size={18}/>
                      </div>
                      <span className="whitespace-nowrap">{sub}</span>
                    </div>
                  </th>
                ))}
                {displaySubjects.length > 1 && (
                  <th className="px-10 py-10 text-[11px] font-black text-indigo-600 uppercase tracking-widest text-center bg-indigo-50/30">المعدل النهائي</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredStudents.map((s, idx) => {
                const sResults = resultIndex[s.id] || {};
                const subjectScores = displaySubjects.map((sub) => sResults[sub] || null);
                const allScored = Object.values(sResults).filter(Boolean);
                const hasAnyResult = allScored.length > 0;
                const avgPct = hasAnyResult
                  ? (
                      allScored.reduce((sum, r) => sum + parseFloat(r.percentage || 0), 0) /
                      allScored.length
                    ).toFixed(1)
                  : null;

                return (
                  <tr key={s.id} className="group hover:bg-slate-50/50 transition-all duration-300">
                    <td className="px-10 py-10 text-center text-xs font-black text-slate-300 group-hover:text-indigo-400 transition-colors">
                      {idx + 1}
                    </td>
                    <td className="px-10 py-10 sticky right-0 bg-white group-hover:bg-slate-50/50 z-10 transition-colors shadow-[15px_0_30px_-15px_rgba(0,0,0,0.03)]">
                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 bg-white border border-slate-100 rounded-[2rem] flex items-center justify-center text-slate-300 shadow-sm group-hover:border-indigo-100 group-hover:text-indigo-500 group-hover:shadow-indigo-50 group-hover:rotate-6 transition-all duration-500">
                          <User size={28}/>
                        </div>
                        <div>
                          <div className="font-black text-slate-800 text-lg mb-1 leading-none tracking-tight">{s.name}</div>
                          <div className="flex items-center gap-2 mt-2">
                             <span className="text-[10px] bg-slate-100 text-slate-500 px-3 py-1 rounded-lg font-black tracking-widest uppercase">{s.id}</span>
                             <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                             <span className="text-[11px] text-slate-400 font-bold">{studentGradeLabel(s)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-10 text-center">
                      {hasAnyResult ? (
                        <div className="flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                          <div className="px-5 py-2 bg-emerald-50 text-emerald-600 rounded-2xl text-[11px] font-black border border-emerald-100 flex items-center gap-2 shadow-sm shadow-emerald-50">
                             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> تم الرصد بنجاح
                          </div>
                        </div>
                      ) : (
                        <div className="px-5 py-2 bg-slate-100/50 text-slate-400 rounded-2xl text-[11px] font-black border border-slate-200/50 opacity-60">
                           في انتظار الاختبار
                        </div>
                      )}
                    </td>
                    
                    {subjectScores.map((res, i) => (
                      <td key={i} className="px-8 py-10">
                        {res ? (
                          <div className="flex flex-col items-center group/score">
                            <div className={`text-2xl font-black font-header transition-all duration-500 group-hover/score:scale-110 group-hover/score:tracking-widest
                              ${parseFloat(res.percentage) >= 90 ? 'text-emerald-600' : parseFloat(res.percentage) >= 50 ? 'text-indigo-600' : 'text-rose-500'}`}>
                              {res.score}<span className="text-xs opacity-30 mx-0.5">/</span>{res.total}
                            </div>
                            <div className="w-20 bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden p-0 relative shadow-inner">
                              <div className={`h-full rounded-full transition-all duration-1000 ease-out ${parseFloat(res.percentage) >= 90 ? 'bg-emerald-500' : parseFloat(res.percentage) >= 50 ? 'bg-indigo-500' : 'bg-rose-500'}`}
                                style={{ width: `${res.percentage}%`, boxShadow: `0 0 8px ${parseFloat(res.percentage) >= 50 ? '#6366f144' : '#f43f5e44'}` }}/>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-2.5 font-black tracking-tight opacity-60">{res.percentage}%</div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center opacity-10">
                            <Eraser size={24} className="text-slate-400" />
                          </div>
                        )}
                      </td>
                    ))}
                    
                    {displaySubjects.length > 1 && (
                      <td className="px-10 py-10 text-center bg-indigo-50/5 transition-colors group-hover:bg-indigo-50/20">
                        {avgPct !== null ? (
                          <div className={`text-3xl font-black font-header ${parseFloat(avgPct) >= 90 ? 'text-emerald-600' : parseFloat(avgPct) >= 50 ? 'text-indigo-600' : 'text-rose-600'}`}>
                            {avgPct}<span className="text-sm opacity-30 mr-1">%</span>
                          </div>
                        ) : <div className="w-12 h-1.5 bg-indigo-100/30 rounded-full mx-auto shadow-inner" />}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {filteredStudents.length === 0 && !loading && (
            <div className="py-40 flex flex-col items-center justify-center text-center">
              <div className="w-32 h-32 bg-slate-50/50 rounded-[3rem] flex items-center justify-center text-slate-100 mb-8 shadow-inner ring-1 ring-slate-100">
                <Search size={64} className="animate-pulse opacity-50"/>
              </div>
              <h3 className="text-2xl font-black text-slate-400">
                {students.length === 0 ? 'لا يوجد طلاب مسجلون' : 'لم نعثر على طلاب مطابقين'}
              </h3>
              <p className="text-slate-400 text-sm mt-3 max-w-md font-medium leading-relaxed">
                {students.length === 0 ? (
                  <>
                    قاعدة البيانات لا تحتوي طلاباً بعد. انتقل إلى{' '}
                    <strong className="text-indigo-600">قائمة الطلاب</strong> لاستيراد أو إضافة الطلاب، ثم ارجع هنا.
                  </>
                ) : (
                  <>
                    يوجد <strong>{students.length}</strong> طالب في النظام، لكن الفلاتر الحالية لا تعرض أحداً.
                    جرّب «كل المراحل» و«كل الصفوف»، أو أوقف «المختبرين فقط».
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>

  {/* ── Export Modal ── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">تصدير التقرير (PDF)</h3>
                <p className="text-indigo-100 text-xs mt-0.5">أدخل بيانات الجدول للطباعة</p>
              </div>
              <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-white/10 rounded-xl"><X size={22}/></button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Exam Title */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                  <FileText size={12}/> عنوان الاختبار
                </label>
                <input
                  type="text"
                  value={exportExamTitle}
                  onChange={e => setExportExamTitle(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl font-bold text-sm text-right"
                  placeholder={filterSubject === 'اختبار مجمع' ? 'اختبار محاكي اختبار نافس (اختبار مجمع)' : `اختبار نهاية الدور الأول - الفصل الدراسي الثاني العام الدراسي ${academicYear}`}
                />
                <p className="text-[10px] text-gray-400 mt-1">اتركه فارغاً لاستخدام العنوان الافتراضي</p>
              </div>

              {/* Sheet Title */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                  <BookOpen size={12}/> عنوان الكشف
                </label>
                <input
                  type="text"
                  value={exportSheetTitle}
                  onChange={e => setExportSheetTitle(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl font-bold text-sm text-right"
                  placeholder="كشف رصد الدرجات"
                />
              </div>

              {/* Date & Day */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                    <Calendar size={12}/> تاريخ الاختبار
                  </label>
                  <input type="text" value={exportDate} onChange={e => setExportDate(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl font-bold text-sm text-right" placeholder="15 / 09 / 1446"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1">
                    <Clock size={12}/> اليوم
                  </label>
                  <input type="text" value={exportDay} onChange={e => setExportDay(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-gray-200 rounded-xl font-bold text-sm text-right" placeholder="الأحد"/>
                </div>
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-100">
                <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                  * سيتم توليد التقرير بناءً على التصفية الحالية:
                  <br />
                  المادة:{' '}
                  <span className="text-black">
                    {filterSubject === 'All' ? 'جميع المواد' : filterSubject}
                  </span>{' '}
                  | الصف:{' '}
                  <span className="text-black">
                    {filterGrade === 'All' ? 'جميع الصفوف' : filterGrade}
                  </span>
                  {isMultiSubjectExport && (
                    <>
                      <br />
                      <span className="text-indigo-800">
                        سيتم تنزيل {subjectsForBatchExport.length} ملف PDF — ملف مستقل لكل مادة (
                        {subjectsForBatchExport.join('، ')})
                      </span>
                    </>
                  )}
                  {filterSubject === 'All' && filterGrade === 'All' && (
                    <>
                      <br />
                      <span className="text-rose-700">
                        يجب اختيار صف محدد لتصدير كشوف متعددة المواد دفعة واحدة.
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="p-6 border-t bg-slate-50 flex flex-col gap-3">
              <button
                onClick={handleExportPDF}
                disabled={
                  isExporting ||
                  isExportingStats ||
                  (isMultiSubjectExport && filterGrade === 'All') ||
                  subjectsForBatchExport.length === 0
                }
                className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg
                  ${(isExporting || isExportingStats) ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}
              >
                {isExporting ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    جاري التصدير...
                  </>
                ) : (
                  <>
                    <FileText size={18} />
                    {isMultiSubjectExport
                      ? `تصدير ${subjectsForBatchExport.length} كشوف (ملف لكل مادة)`
                      : 'تصدير كشف الدرجات للطلاب'}
                  </>
                )}
              </button>

              {filterSubject === 'All' && (
                <button
                  onClick={handleExportAllSubjectsPDF}
                  disabled={isExporting || isExportingStats || filteredStudents.length === 0 || allSubjects.length === 0}
                  className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all border-2
                    ${(isExporting || isExportingStats || filteredStudents.length === 0 || allSubjects.length === 0)
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'}`}
                >
                  <FileText size={18} />
                  تصدير PDF مجمّع (كل المواد — ملف واحد)
                </button>
              )}
              
              <button onClick={handleExportStatisticsPDF} disabled={isExporting || isExportingStats || performanceStats.total === 0}
                className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all border-2
                  ${(isExporting || isExportingStats || performanceStats.total === 0) 
                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600'}`}>
                {isExportingStats ? <><Loader2 size={18} className="animate-spin"/> جاري التحميل...</> : <><PieChart size={18}/> تصدير الإحصائيات والرسم البياني</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* شاشة تقدم التصدير — تمنع التفاعل وتشرح سبب البطء */}
      {(isExporting || isExportingStats) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-6">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center space-y-4">
            <Loader2 size={48} className="animate-spin text-indigo-600 mx-auto" />
            <h3 className="text-xl font-black text-slate-900">
              {isExportingStats ? 'جاري تصدير الإحصائيات...' : 'جاري تصدير كشوف الرصد'}
            </h3>
            {isExporting && exportProgress.pageTotal > 0 && (
              <p className="text-sm font-bold text-slate-600 leading-relaxed">
                {exportProgress.subjectTotal > 1 && (
                  <>مادة {exportProgress.subjectIdx} من {exportProgress.subjectTotal}: {exportProgress.label}<br /></>
                )}
                صفحة {exportProgress.page} من {exportProgress.pageTotal}
              </p>
            )}
            <p className="text-xs text-slate-400 font-medium">
              لا تغلق النافذة — يتم إنشاء الملف صفحة بصفحة لتجنّب تجميد النظام
            </p>
          </div>
        </div>
      )}

      {/* قالب طباعة واحد فقط أثناء التصدير */}
      <div className="fixed left-[-9999px] top-0 pointer-events-none" style={{ zIndex: -100 }} aria-hidden>
        {exportPageSlice && (
          <PrintableGradePage
            schoolName={printSchoolName}
            examTitle={exportExamTitle}
            sheetTitle={exportSheetTitle}
            subjectLabel={exportPageSlice.subjectLabel}
            gradeLabel={filterGrade}
            academicYear={academicYear}
            pageStudents={exportPageSlice.students}
            pageIndex={exportPageSlice.pageIndex}
            totalPages={exportPageSlice.totalPages}
            resultIndex={resultIndex}
          />
        )}

        {exportAllSubjectsSlice && (
          <PrintableAllSubjectsPage
            schoolName={printSchoolName}
            examTitle={exportExamTitle}
            sheetTitle={exportSheetTitle}
            gradeLabel={filterGrade}
            academicYear={academicYear}
            pageStudents={exportAllSubjectsSlice.students}
            pageIndex={exportAllSubjectsSlice.pageIndex}
            totalPages={exportAllSubjectsSlice.totalPages}
            subjects={exportAllSubjectsSlice.subjects}
            sectionIndex={exportAllSubjectsSlice.sectionIndex}
            sectionTotal={exportAllSubjectsSlice.sectionTotal}
            resultIndex={resultIndex}
          />
        )}

        {exportStatsRender && performanceStats.total > 0 && (
          <div className="printable-statistics-page bg-white p-12 text-black" style={{ width: '210mm', minHeight: '297mm', fontFamily: 'Arial, sans-serif', direction: 'rtl', backgroundColor: '#ffffff', color: '#000000' }}>
            <style dangerouslySetInnerHTML={{__html: `
              .printable-statistics-page { background-color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
              .printable-statistics-page .bg-colored { background-color: #f8fafc !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            `}} />
            <div className="text-center mb-10 space-y-4 border-b-2 border-black pb-8 mt-10">
              <h1 className="text-4xl font-bold">{printSchoolName}</h1>
              <h2 className="text-3xl font-bold mt-4">تقرير تفصيلي للإحصائيات ومستويات الأداء</h2>
              <div className="mt-8 text-xl font-bold p-4 border-2 border-black inline-block rounded-xl">
                المادة: {filterSubject === 'All' ? 'جميع المواد' : filterSubject} | الصف: {filterGrade === 'All' ? 'جميع الصفوف' : filterGrade}
              </div>
            </div>
            
            <div className="mb-12 p-8 border-2 border-black rounded-3xl bg-colored mt-12">
              <h4 className="text-2xl font-black mb-10 text-center border-b-2 border-black pb-4">التمثيل البياني لمستويات الطلاب</h4>
              <div className="h-80 flex items-end justify-between gap-8 px-6">
                {[
                  { label: 'ممتاز', count: performanceStats.excellent, color: '#10b981' },
                  { label: 'جيد جداً', count: performanceStats.veryGood, color: '#3b82f6' },
                  { label: 'جيد', count: performanceStats.good, color: '#6366f1' },
                  { label: 'مقبول', count: performanceStats.pass, color: '#f59e0b' },
                  { label: 'ضعيف', count: performanceStats.weak, color: '#f43f5e' }
                ].map((l, i) => {
                  const maxVal = Math.max(performanceStats.excellent, performanceStats.veryGood, performanceStats.good, performanceStats.pass, performanceStats.weak, 1);
                  const height = Math.max((l.count / maxVal) * 100, 2); 
                  return (
                    <div key={i} className="flex-1 h-full flex flex-col justify-end items-center">
                      <div className="text-xl font-black mb-3">{l.count} طالب</div>
                      <div className="w-20 mx-auto transition-all" style={{ height: `${height}%`, backgroundColor: 'black', border: '2px solid black' }} />
                      <div className="text-xl font-black mt-4 whitespace-nowrap">{l.label}</div>
                      <div className="text-lg font-bold mt-2 text-gray-800">
                        {performanceStats.total > 0 ? ((l.count / performanceStats.total) * 100).toFixed(1) : 0}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mt-12">
              <div className="border-2 border-black p-8 rounded-3xl text-center bg-colored flex flex-col items-center justify-center min-h-[160px]">
                <div className="text-2xl font-bold mb-4">إجمالي المختبرين</div>
                <div className="text-6xl font-black">{performanceStats.total}</div>
              </div>
              <div className="border-2 border-black p-8 rounded-3xl text-center bg-colored flex flex-col items-center justify-center min-h-[160px]">
                <div className="text-2xl font-bold mb-4">نسبة الإتقان العامة</div>
                <div className="text-6xl font-black">
                  {performanceStats.total > 0 ? (((performanceStats.excellent + performanceStats.veryGood) / performanceStats.total) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
            
            <div className="mt-20 flex justify-end px-20 text-lg font-bold">
              <div className="text-center">
                <div className="mb-4">يعتمد مدير المدرسة</div>
                <div>......................................</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const StatCard = ({ label, count, total, color, icon }) => {
  const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
  
  // Mapping color names to Tailwind color classes for background/border/text
  const themeMap = {
    emerald: { bg: 'bg-emerald-500', lightBg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', accent: 'border-emerald-500', shadow: 'shadow-emerald-100' },
    blue:    { bg: 'bg-blue-500',    lightBg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    accent: 'border-blue-500', shadow: 'shadow-blue-100' },
    indigo:  { bg: 'bg-indigo-500',  lightBg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  accent: 'border-indigo-500', shadow: 'shadow-indigo-100' },
    amber:   { bg: 'bg-amber-500',   lightBg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   accent: 'border-amber-500', shadow: 'shadow-amber-100' },
    rose:    { bg: 'bg-rose-500',    lightBg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    accent: 'border-rose-500', shadow: 'shadow-rose-100' },
  };
  const theme = themeMap[color] || themeMap['indigo'];

  return (
    <div className={`bg-white p-6 rounded-[2.5rem] border ${theme.border} border-b-4 ${theme.accent} shadow-xl shadow-gray-100 transition-all duration-400 hover:scale-[1.02] hover:-translate-y-1 relative overflow-hidden group`}>
      <div className={`absolute top-0 right-0 w-24 h-24 ${theme.bg} opacity-[0.03] rounded-bl-[80px] transition-all group-hover:w-full group-hover:h-full group-hover:opacity-[0.05] group-hover:rounded-none`}/>
      
      <div className="flex justify-between items-start mb-6 relative z-10">
        <div className={`w-14 h-14 ${theme.bg} text-white rounded-2xl flex items-center justify-center shadow-lg ${theme.shadow} rotate-0 group-hover:rotate-6 transition-transform duration-300`}>
          {React.cloneElement(icon, { size: 28 })}
        </div>
        <div className="text-right">
          <span className={`block text-[11px] font-black opacity-60 uppercase tracking-widest mb-1 ${theme.text}`}>{label}</span>
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-4xl font-black text-slate-800 tracking-tighter leading-none">{count}</span>
            <span className="text-xs font-bold text-slate-400">طالب</span>
          </div>
        </div>
      </div>
      
      <div className="space-y-3 relative z-10">
        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
          <span className="text-slate-400">نسبة التحصيل</span>
          <span className={`${theme.text}`}>{percentage}%</span>
        </div>
        <div className="w-full bg-slate-50 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-100">
          <div className={`${theme.bg} h-full rounded-full transition-all duration-1000 ease-out`} 
               style={{ width: `${percentage}%`, boxShadow: `0 0 10px ${theme.bg}44` }}/>
        </div>
      </div>
    </div>
  );
};

const PerformanceChart = ({ stats }) => {
  const levels = [
    { label: 'ممتاز', count: stats.excellent, color: 'bg-emerald-500', hoverColor: 'bg-emerald-600', textColor: 'text-emerald-700' },
    { label: 'جيد جداً', count: stats.veryGood, color: 'bg-blue-500', hoverColor: 'bg-blue-600', textColor: 'text-blue-700' },
    { label: 'جيد', count: stats.good, color: 'bg-indigo-500', hoverColor: 'bg-indigo-600', textColor: 'text-indigo-700' },
    { label: 'مقبول', count: stats.pass, color: 'bg-amber-500', hoverColor: 'bg-amber-600', textColor: 'text-amber-700' },
    { label: 'ضعيف', count: stats.weak, color: 'bg-rose-500', hoverColor: 'bg-rose-600', textColor: 'text-rose-700' }
  ];

  const maxCount = Math.max(...levels.map(l => l.count), 1);

  return (
    <div className="h-64 flex items-end justify-between gap-4 px-2">
      {levels.map((l, i) => {
        const heightPct = (l.count / maxCount) * 100;
        return (
          <div key={i} className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-help">
            {/* Tooltip on hover */}
            <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] py-1 px-2 rounded-lg font-black z-20 pointer-events-none whitespace-nowrap">
              {l.count} طالب ({stats.total > 0 ? ((l.count / stats.total) * 100).toFixed(1) : 0}%)
            </div>
            
            {/* The Bar Wrapper */}
            <div className="flex-1 w-full flex items-end relative overflow-hidden rounded-t-xl">
              <div className={`w-full ${l.color} rounded-t-xl transition-all duration-700 ease-out group-hover:${l.hoverColor} group-hover:scale-x-105 shadow-inner`}
                   style={{ height: `${Math.max(heightPct, 3)}%` }}>
                   <div className="w-full h-full bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"/>
              </div>
            </div>
            
            {/* Label */}
            <div className="mt-3 text-center flex flex-col justify-end h-10">
              <span className={`text-[10px] font-black ${l.textColor} tracking-tight`}>{l.label}</span>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5">{l.count} طالب</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GradeRecording;
