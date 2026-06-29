import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, FileText, CheckCircle2, XCircle, Download, Users, X, Loader2, Search, CheckSquare, Square, ScanLine, Wifi, WifiOff, AlertCircle, ChevronRight, ChevronDown, Check, Edit2, Settings, Layout, BookOpen, Clock, Calendar, Image as ImageIcon, Layers, FileStack, Printer, RefreshCw, BarChart2, Trophy, Flag, ShieldCheck, Languages, Archive, ArchiveRestore, Folder, Tag, ScrollText, KeyRound } from 'lucide-react';
import { getOmrExams, saveOmrExam, deleteOmrExam, getStudents, saveOmrResult, getOmrResults, getOmrSubjects, saveOmrSubjects, getCommittees, OMR_API_BASE, syncOmrResultsForStudentNationalIdChange } from '../../utils/dataService';
import { enrichOmrResultForSave, getStudentNationalId, getStudentSeatNumber } from '../../utils/studentIdentity';
import { regradeResultWithExam } from '../../utils/omrGrading';
import { committeesForGrade, committeeLabelWithStage, committeeNumberOnly, getStudentsInCommittee } from '../../utils/committeeUtils';
import { committeeHeaderNumber } from '../../utils/committeeRosterPrint';
import { compareStudentsBySeatNumber } from '../../utils/seatNumberGenerator';
import { useToast } from '../../components/Toast';

/* ── Constants ── */
const STAGES = {
  'ابتدائي': ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي'],
  'متوسط': ['الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'],
  'ثانوي': ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'],
};
const SUBJECTS_KEY = 'omr_subjects';
const CUSTOM_TEMPLATES_KEY = 'omr_custom_templates';
const CUSTOM_TEMPLATE_PREFIX = 'custom:';
const DEFAULT_SUBJECTS = [
  { id: '1', name: 'لغة عربية', grades: ['All'] },
  { id: '2', name: 'رياضيات', grades: ['All'] },
  { id: '3', name: 'علوم', grades: ['All'] },
  { id: '4', name: 'دراسات اجتماعية', grades: ['All'] },
  { id: '5', name: 'تربية إسلامية', grades: ['All'] },
  { id: '6', name: 'لغة إنجليزية', grades: ['All'] },
  { id: '7', name: 'حاسب آلي', grades: ['All'] },
  { id: '8', name: 'تربية وطنية', grades: ['All'] },
  { id: '9', name: 'تربية بدنية', grades: ['All'] },
  { id: '10', name: 'تربية فنية', grades: ['All'] },
];

// Robust grade key extractor — works regardless of "ال" prefix or shorthand
const toGradeKey = (text = '') => {
  if (!text) return '';

  // 1. Basic normalization
  let s = String(text)
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/١/g, '1').replace(/٢/g, '2').replace(/٣/g, '3')
    .replace(/٤/g, '4').replace(/٥/g, '5').replace(/٦/g, '6')
    .replace(/٧/g, '7').replace(/٨/g, '8').replace(/٩/g, '9').replace(/٠/g, '0')
    .replace(/\s+/g, ' ').trim();

  // 2. Handle pure shorthand (1م, 2ث, 3ب etc.)
  const noSpace = s.replace(/\s/g, '');
  const shorthandMap = {
    '1م': '1متوسط', '2م': '2متوسط', '3م': '3متوسط',
    '1ث': '1ثانوي',  '2ث': '2ثانوي',  '3ث': '3ثانوي',
    '1ب': '1ابتدائي','2ب': '2ابتدائي','3ب': '3ابتدائي',
    '4ب': '4ابتدائي','5ب': '5ابتدائي','6ب': '6ابتدائي',
  };
  if (shorthandMap[noSpace]) return shorthandMap[noSpace];

  // 3. Word-level analysis — remove "ال" from the start of each word
  const words = s.split(' ').map(w => w.startsWith('ال') ? w.slice(2) : w).filter(Boolean);

  // 4. Map ordinal words → number
  const ordinalMap = {
    'اول': 1, 'اولى': 1, '1': 1,
    'ثاني': 2, 'ثانيه': 2, 'ثان': 2, '2': 2,
    'ثالث': 3, 'ثالثه': 3, '3': 3,
    'رابع': 4, 'رابعه': 4, '4': 4,
    'خامس': 5, 'خامسه': 5, '5': 5,
    'سادس': 6, 'سادسه': 6, '6': 6,
  };

  // 5. Map stage words → canonical stage name
  const stageMap = {
    'ابتدائي': 'ابتدائي', 'ابتدائيه': 'ابتدائي',
    'متوسط': 'متوسط', 'متوسطه': 'متوسط',
    'ثانوي': 'ثانوي', 'ثانويه': 'ثانوي',
  };

  let num = null;
  let stage = null;

  for (const w of words) {
    if (ordinalMap[w] !== undefined && num === null) num = ordinalMap[w];
    if (stageMap[w] && !stage) stage = stageMap[w];
  }

  // Also try numeric prefix directly in the original (for "3م"-style missed above)
  if (num === null) {
    const numMatch = noSpace.match(/^([1-6])/);
    if (numMatch) num = parseInt(numMatch[1]);
  }

  if (num !== null && stage) return `${num}${stage}`;

  // 6. Fallback: just return cleaned no-space lowercase
  return noSpace.toLowerCase();
};

const normalizeText = toGradeKey; // backward-compat alias

const isLevelMatch = (v1, v2) => {
  if (!v1 || !v2) return false;
  if (v1 === 'All' || v2 === 'All') return true;
  return toGradeKey(v1) === toGradeKey(v2);
};

const isApprovedOmrResult = (r) => {
  const t = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  return (
    t(r?.approved) ||
    t(r?.confirmed) ||
    (r?.approvedAt != null && String(r.approvedAt).trim() !== '')
  );
};

const normalizeStage = (s = '') => {
  const v = normalizeText(s);
  if (v.includes('ابتدائي')) return 'ابتدائي';
  if (v.includes('متوسط')) return 'متوسط';
  if (v.includes('ثانوي')) return 'ثانوي';
  return v;
};

const templateOptionsByStage = (stage, customTemplates = []) => {
  return [
    { value: 'nafs', label: 'قالب نافس (موحد لجميع المراحل)' },
    { value: 'custom', label: 'قالب مخصص (نسخة نافس)' },
    ...customTemplates.map(t => ({
      value: `${CUSTOM_TEMPLATE_PREFIX}${t.id}`,
      label: `📌 ${t.name}`,
    })),
  ];
};

/** يتعامل مع archived كقيمة منطقية أو نصاً من JSON القديم */
const examArchived = (e) => {
  const v = e?.archived;
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
};

const normalizeArchiveFolder = (v) => {
  if (v == null || v === undefined) return '';
  return String(v).trim();
};

const examGrades = (e) => {
  if (!e || typeof e !== 'object') return [];
  if (Array.isArray(e.grades) && e.grades.length) return e.grades.filter(Boolean);
  if (e.grade) return [e.grade];
  return [];
};

const escapeHtmlSticker = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** نص الصف/الصفوف لعرضه على الملصق */
const stickerGradeLabel = (exam) => {
  const arr = examGrades(exam);
  if (arr.length) return arr.join('، ');
  return String(exam?.grade || '').trim() || '—';
};

/**
 * اسم الفصل الدراسي على ورقة التعريف.
 * opts.selectedClassroom: من فلتر «فصل» في نافذة الطباعة إن وُجد.
 */
const resolveExamClassLabel = (exam, opts = {}) => {
  const sel = opts.selectedClassroom;
  if (sel && sel !== 'All') {
    return String(sel)
      .replace(/^فصل:\s*/i, '')
      .trim();
  }
  if (opts.classLabelOverride != null && String(opts.classLabelOverride).trim()) {
    return String(opts.classLabelOverride).trim();
  }
  return String(exam?.classroom || '').trim() || '—';
};

/** نص الصف المعروض في رأس ورقة الطباعة — من الاختبار */
const derivePrintHeaderClassFromExam = (exam) => {
  if (!exam || typeof exam !== 'object') return '';
  const g = stickerGradeLabel(exam);
  return g === '—' ? '' : g;
};
const derivePrintHeaderSubjectFromExam = (exam) => String(exam?.subject || '').trim();

const getStudentQRNationalId = (s) =>
  (s.nationalId || s.national_id || '').toString().trim();

const sanitizePdfFilenamePart = (text, maxLen = 56) => {
  const s = String(text ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[،,;|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!s || s === '—') return '';
  return s.slice(0, maxLen);
};

const safeOmrPdfFilename = (exam, opts = {}) => {
  const subject =
    sanitizePdfFilenamePart(opts.subjectOverride || exam?.subject || exam?.title, 48) ||
    'مادة';
  const grade =
    sanitizePdfFilenamePart(opts.gradeOverride || stickerGradeLabel(exam), 48) || 'صف';
  return `${subject}_${grade}.pdf`;
};

const safeCommitteeOmrPdfFilename = (exam, committee, opts = {}) => {
  const comm =
    sanitizePdfFilenamePart(committeeNumberOnly(committee) || committee?.name, 24) ||
    'لجنة';
  const subject =
    sanitizePdfFilenamePart(
      opts.subjectOverride || exam?.subject || exam?.title,
      48
    ) || 'مادة';
  const grade =
    sanitizePdfFilenamePart(
      opts.gradeOverride || committee?.grade || stickerGradeLabel(exam),
      48
    ) || 'صف';
  return `لجنة_${comm}_${subject}_${grade}.pdf`;
};

/** طلاب يطابقون مرحلة وصفوف الاختبار */
const studentsMatchingExam = (exam, allStudents) => {
  const stageKey = normalizeStage(exam?.stage || '');
  const allowed = examGrades(exam);
  return allStudents.filter((s) => {
    if (stageKey && stageKey !== 'All') {
      if (s.stage && !isLevelMatch(s.stage, stageKey)) return false;
    }
    if (!allowed.length) return true;
    return allowed.some(
      (g) =>
        isLevelMatch(s.grade, g) ||
        isLevelMatch(s.classroom, g) ||
        isLevelMatch(s.stage, g)
    );
  });
};

async function streamOmrPdfBase64(res, onProgress) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pdfB64 = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        if (evt.type === 'progress' && onProgress) onProgress(evt);
        else if (evt.type === 'done') pdfB64 = evt.pdf;
        else if (evt.type === 'error') throw new Error(evt.msg || 'خطأ في التوليد');
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  return pdfB64;
}

function downloadPdfBase64(pdfB64, filename) {
  const byteChars = atob(pdfB64);
  const byteArr = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: 'application/pdf' });
  const a = document.createElement('a');
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

const AR_WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const formatExamPrintDate = (dateStr, type = 'gregorian') => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr).trim();
  if (type === 'hijri') {
    return d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: '2-digit', year: 'numeric' });
};

/** تاريخ ويوم الطباعة من بيانات الاختبار */
const resolveExamPrintTiming = (exam, dateType = 'gregorian') => {
  const raw = exam?.date;
  if (!raw) {
    return { dateStr: '', dayStr: '', hasDate: false, label: 'بدون تاريخ' };
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    const text = String(raw).trim();
    return { dateStr: text, dayStr: '', hasDate: Boolean(text), label: text || 'بدون تاريخ' };
  }
  const dateStr = formatExamPrintDate(raw, dateType);
  const dayStr = AR_WEEKDAYS[d.getDay()] || '';
  const label = dayStr ? `${dayStr} — ${dateStr}` : dateStr;
  return { dateStr, dayStr, hasDate: true, label };
};

const getSubjectIcon = (subject = '', size = 24) => {
  const s = String(subject).toLowerCase();
  if (s.includes('رياضيات')) return <BarChart2 size={size} />;
  if (s.includes('علوم')) return <Layers size={size} />;
  if (s.includes('إسلامية') || s.includes('قرآن')) return <BookOpen size={size} />;
  if (s.includes('انجليزي') || s.includes('english')) return <Languages size={size} />;
  if (s.includes('عربي') || s.includes('لغتي')) return <FileText size={size} />;
  if (s.includes('اجتماعيات') || s.includes('تاريخ')) return <Layout size={size} />;
  if (s.includes('حاسب') || s.includes('رقمي')) return <ScanLine size={size} />;
  if (s.includes('بدنية') || s.includes('رياضة')) return <Trophy size={size} />;
  if (s.includes('وطنية')) return <Flag size={size} />;
  if (s.includes('فنية')) return <ImageIcon size={size} />;
  if (s.includes('نافس') || s.includes('مجمع')) return <ShieldCheck size={size} />;
  return <BookOpen size={size} />;
};

const OMRExams = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingExam, setEditingExam] = useState(null);
  const [regradingExamId, setRegradingExamId] = useState(null);
  const [backfillingPortal, setBackfillingPortal] = useState(false);
  const [students, setStudents] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [activeTab, setActiveTab] = useState('exams'); // 'exams' | 'subjects'
  const [scannerAvailable, setScannerAvailable] = useState(false);

  /* Filter bar */
  const [filterStage, setFilterStage] = useState('All');
  const [filterGrade, setFilterGrade] = useState('All');
  const [filterSubject, setFilterSubject] = useState('All');
  /** 'active' = الاختبارات الجارية، 'archive' = المؤرشفة */
  const [examArchiveTab, setExamArchiveTab] = useState('active');
  /** نافذة: اختيار مجلد داخل الأرشيف قبل التأكيد */
  const [archiveTargetModal, setArchiveTargetModal] = useState(null);
  const [archiveTargetFolderInput, setArchiveTargetFolderInput] = useState('');
  /** طي/فتح أقسام المجلدات في الأرشيف — المفتاح غائب = مفتوح */
  const [archiveFolderOpen, setArchiveFolderOpen] = useState({});

  /* New exam form */
  /* New exam form */
  const [newExam, setNewExam] = useState({ stage: '', grade: '', grades: [], subject: '', qCount: 30, template: 'nafs', title: '', classroom: '', date: '' });

  /* Dynamic subjects list (persisted in Supabase) */
  const [subjects, setSubjects] = useState([...DEFAULT_SUBJECTS]);
  const [newSubjectInput, setNewSubjectInput] = useState('');
  const [newSubjectGrades, setNewSubjectGrades] = useState(['All']);

  const saveSubjects = async (list) => {
    setSubjects(list);
    try {
      await saveOmrSubjects(list);
    } catch (err) {
      toast.error('فشل حفظ المواد في قاعدة البيانات.', 'خطأ');
    }
  };
  const handleAddSubject = () => {
    const trimmed = newSubjectInput.trim();
    if (!trimmed || subjects.find(s => s.name === trimmed)) return;
    const newSub = {
      id: Date.now().toString(),
      name: trimmed,
      grades: [...newSubjectGrades]
    };
    saveSubjects([...subjects, newSub]);
    setNewSubjectInput('');
    setNewSubjectGrades(['All']);
  };
  const handleDeleteSubject = (id) => {
    const sub = subjects.find(s => s.id === id);
    if (!sub) return;
    if (!window.confirm(`حذف مادة "‏${sub.name}"؟`)) return;
    saveSubjects(subjects.filter(s => s.id !== id));
  };

  /* Custom template config */
  const defaultCustomConfig = {
    school_name: 'مدارس نخبة الشمال الأهلية والعالمية',
    exam_name: 'الأختبار المحاكي لاختبار نافس 2026 (اختبار مجمع)',
    year: 'العام الدراسي ١٤٤٧ هــ',
    principal: 'مدير المدرسة : محمد نصر الدين',
    footer: 'نظام التصحيح الآلي بمدارس نخبة الشمال الأهلية والعالمية',
    show_class_row: true,
    show_subject_row: true,
    /** نص حقل «الصف» على الورقة عند الطباعة مع هذا القالب (اختياري) */
    header_class_text: '',
    /** نص حقل «المادة» على الورقة (اختياري) */
    header_subject_text: '',
    logoDataUrl: '',
  };
  const [customConfig, setCustomConfig] = useState({ ...defaultCustomConfig });
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [customTemplates, setCustomTemplates] = useState([]);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [selectedCustomTemplateId, setSelectedCustomTemplateId] = useState('');

  const persistCustomTemplates = (list) => {
    setCustomTemplates(list);
    try { localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(list)); } catch (_) {}
  };
  /* Bulk print modal */
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedBulkExam, setSelectedBulkExam] = useState(null);
  const [selectedClass, setSelectedClass] = useState('All');
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [studentGroupFilter, setStudentGroupFilter] = useState('all'); // 'all' | 'school' | 'guest'
  const [modalStage, setModalStage] = useState('All');
  const [modalGrade, setModalGrade] = useState('All'); // فلتر الصف داخل نافذة الطباعة
  const [examDate, setExamDate] = useState(() => new Date().toLocaleDateString('ar-SA'));
  const [examDay, setExamDay] = useState(() => {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return days[new Date().getDay()];
  });
  const [dateType, setDateType] = useState('gregorian'); // 'gregorian' or 'hijri'
  const [dateInputValue, setDateInputValue] = useState(() => new Date().toISOString().split('T')[0]);

  const formatDate = (dateStr, type) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (type === 'hijri') {
        return d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: '2-digit', year: 'numeric' });
  };

  const handleDateChange = (val, type = dateType) => {
    setDateInputValue(val);
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      setExamDate(formatDate(val, type));
      const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      setExamDay(days[d.getDay()]);
    }
  };

  const handleDateTypeChange = (type) => {
    setDateType(type);
    handleDateChange(dateInputValue, type);
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [printProgress, setPrintProgress] = useState({ done: 0, total: 0, currentName: '' });
  const [printElapsed, setPrintElapsed] = useState(0);          // seconds ticking up
  const [printTotalTime, setPrintTotalTime] = useState(null);   // final duration in seconds
  const printStartRef = React.useRef(null);                     // Date.now() when print started
  const timerRef = React.useRef(null);                          // setInterval handle
  const [selectedTemplate, setSelectedTemplate] = useState('nafs');
  /** بعد تنزيل ملف الأوراق، فتح طباعة ورقة تعريف (مادة + فصل) */
  const [printCoverWithBulk, setPrintCoverWithBulk] = useState(true);
  /** حقول الرأس على الأوراق (قالب مخصص — نفس واحد لكل الطلاب إن وُجد نصاً) */
  const [printHeaderClass, setPrintHeaderClass] = useState('');
  const [printHeaderSubject, setPrintHeaderSubject] = useState('');
  /** طباعة نافذة واحدة: حسب الطلاب أو حسب اللجنة (ملف PDF لكل لجنة) */
  const [bulkPrintMode, setBulkPrintMode] = useState('students');
  const [selectedCommitteeIds, setSelectedCommitteeIds] = useState(() => new Set());
  /** تحديد عدة اختبارات — ملف PDF منفصل لكل اختبار */
  const [selectedExamIds, setSelectedExamIds] = useState(() => new Set());
  const [showMultiPrintModal, setShowMultiPrintModal] = useState(false);
  const [multiPrintTemplate, setMultiPrintTemplate] = useState('nafs');
  /** طباعة متعددة: ملف لكل اختبار، أو ملف لكل لجنة داخل كل اختبار */
  const [multiPrintMode, setMultiPrintMode] = useState('exam');
  const [multiPrintProgress, setMultiPrintProgress] = useState({
    examIndex: 0,
    examTotal: 0,
    examTitle: '',
    done: 0,
    total: 0,
    currentName: '',
  });
  const [committeeBulkProgress, setCommitteeBulkProgress] = useState({
    committeeIndex: 0,
    committeeTotal: 0,
    committeeLabel: '',
  });

  // Helper: format seconds → "MM:SS"
  const fmtTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    load();
    checkScanner();
    // Restore saved custom templates from localStorage
    try {
      const saved = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
      if (saved) setCustomTemplates(JSON.parse(saved));
    } catch (_) {}
  }, []);

  useEffect(() => {
    setSelectedExamIds(new Set());
  }, [examArchiveTab, filterStage, filterGrade, filterSubject]);

  const load = async () => {
    setLoading(true);
    try {
      const [ed, sd, subs, comm] = await Promise.all([
        getOmrExams({ includeArchived: true }),
        getStudents(),
        getOmrSubjects(),
        getCommittees(),
      ]);
      setExams(ed);
      setStudents(sd);
      setSubjects(subs);
      setCommittees(comm);
    } catch (err) {
      toast.error('فشل تحميل بيانات الاختبارات.', 'خطأ في التحميل');
      console.error('OMRExams load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const isTemplateCustom = (value) => String(value || '').startsWith(CUSTOM_TEMPLATE_PREFIX) || value === 'custom';
  const getCustomTemplateIdFromValue = (value) => String(value || '').startsWith(CUSTOM_TEMPLATE_PREFIX) ? String(value).slice(CUSTOM_TEMPLATE_PREFIX.length) : '';

  const handleSaveNamedCustomTemplate = () => {
    const name = customTemplateName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const existing = customTemplates.find(t => t.name === name);
    if (existing) {
      const updated = customTemplates.map(t => t.id === existing.id ? { ...t, config: { ...customConfig }, updatedAt: now } : t);
      persistCustomTemplates(updated);
      return;
    }
    const id = Date.now().toString();
    const next = [...customTemplates, { id, name, config: { ...customConfig }, createdAt: now, updatedAt: now }];
    persistCustomTemplates(next);
    setSelectedCustomTemplateId(id);
    setSelectedTemplate(`${CUSTOM_TEMPLATE_PREFIX}${id}`);
  };

  const handleLoadNamedCustomTemplate = (id) => {
    setSelectedCustomTemplateId(id);
    const tpl = customTemplates.find(t => t.id === id);
    if (!tpl) return;
    setCustomTemplateName(tpl.name);
    setCustomConfig({ ...defaultCustomConfig, ...(tpl.config || {}) });
  };

  const handleTemplateSelectChange = (value) => {
    setSelectedTemplate(value);
    const exam = selectedBulkExam;

    if (!isTemplateCustom(value)) {
      setSelectedCustomTemplateId('');
      if (exam) {
        setPrintHeaderClass(derivePrintHeaderClassFromExam(exam));
        setPrintHeaderSubject(derivePrintHeaderSubjectFromExam(exam));
      }
      return;
    }

    const id = getCustomTemplateIdFromValue(value);
    if (id) {
      const tpl = customTemplates.find((t) => t.id === id);
      handleLoadNamedCustomTemplate(id);
      const cfg = { ...defaultCustomConfig, ...(tpl?.config || {}) };
      if (exam) {
        setPrintHeaderClass(
          String(cfg.header_class_text ?? '').trim() !== ''
            ? String(cfg.header_class_text).trim()
            : derivePrintHeaderClassFromExam(exam)
        );
        setPrintHeaderSubject(
          String(cfg.header_subject_text ?? '').trim() !== ''
            ? String(cfg.header_subject_text).trim()
            : derivePrintHeaderSubjectFromExam(exam)
        );
      }
      return;
    }

    /* قالب مخصص عام (نسخة نافس) بدون اسم محفوظ */
    setSelectedCustomTemplateId('');
    const cfgMerged = { ...defaultCustomConfig, ...customConfig };
    if (exam) {
      setPrintHeaderClass(
        String(cfgMerged.header_class_text ?? '').trim() !== ''
          ? String(cfgMerged.header_class_text).trim()
          : derivePrintHeaderClassFromExam(exam)
      );
      setPrintHeaderSubject(
        String(cfgMerged.header_subject_text ?? '').trim() !== ''
          ? String(cfgMerged.header_subject_text).trim()
          : derivePrintHeaderSubjectFromExam(exam)
      );
    }
  };

  const openCustomEditorForCurrentTemplate = () => {
    const id = getCustomTemplateIdFromValue(selectedTemplate);
    if (id) handleLoadNamedCustomTemplate(id);
    setShowCustomEditor(true);
  };

  const handleCustomLogoChange = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setCustomConfig(prev => ({ ...prev, logoDataUrl: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const handleApplyCustomEditor = () => {
    const name = customTemplateName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    if (selectedCustomTemplateId) {
      const updated = customTemplates.map(t =>
        t.id === selectedCustomTemplateId
          ? { ...t, name, config: { ...customConfig }, updatedAt: now }
          : t
      );
      persistCustomTemplates(updated);
      toast.success(`تم تحديث القالب "${name}" بنجاح ✓`, 'حفظ القالب');
    } else {
      handleSaveNamedCustomTemplate();
      toast.success(`تم حفظ القالب "${name}" في القائمة ✓`, 'حفظ القالب');
    }
    if (showBulkModal && selectedBulkExam && isTemplateCustom(selectedTemplate)) {
      const hc = String(customConfig.header_class_text ?? '').trim();
      const hs = String(customConfig.header_subject_text ?? '').trim();
      setPrintHeaderClass(hc || derivePrintHeaderClassFromExam(selectedBulkExam));
      setPrintHeaderSubject(hs || derivePrintHeaderSubjectFromExam(selectedBulkExam));
    }
    setShowCustomEditor(false);
  };

  const checkScanner = async () => {
    try {
      const res = await fetch(`${OMR_API_BASE}/scanner-status`);
      if (res.ok) {
        const data = await res.json();
        setScannerAvailable(data.available);
      } else { setScannerAvailable(false); }
    } catch { setScannerAvailable(false); }
  };

  const visibleExams = useMemo(() => exams.filter(e => {
    const archived = examArchived(e);
    if (examArchiveTab === 'active' && archived) return false;
    if (examArchiveTab === 'archive' && !archived) return false;
    if (filterStage !== 'All' && e.stage !== filterStage) return false;
    if (filterGrade !== 'All' && !examGrades(e).some(g => g === filterGrade)) return false;
    if (filterSubject !== 'All' && e.subject !== filterSubject) return false;
    return true;
  }), [exams, examArchiveTab, filterStage, filterGrade, filterSubject]);

  const selectedExamsForMultiPrint = useMemo(
    () => visibleExams.filter((e) => selectedExamIds.has(e.id)),
    [visibleExams, selectedExamIds]
  );

  const allVisibleExamsSelected =
    visibleExams.length > 0 && visibleExams.every((e) => selectedExamIds.has(e.id));

  const toggleExamSelection = (examId) => {
    setSelectedExamIds((prev) => {
      const next = new Set(prev);
      if (next.has(examId)) next.delete(examId);
      else next.add(examId);
      return next;
    });
  };

  const toggleSelectAllVisibleExams = () => {
    setSelectedExamIds((prev) => {
      const next = new Set(prev);
      if (allVisibleExamsSelected) {
        visibleExams.forEach((e) => next.delete(e.id));
      } else {
        visibleExams.forEach((e) => next.add(e.id));
      }
      return next;
    });
  };

  const openMultiPrintModal = () => {
    if (selectedExamIds.size === 0) {
      toast.warning('حدّد اختباراً واحداً على الأقل.', 'طباعة متعددة');
      return;
    }
    setMultiPrintTemplate('nafs');
    setMultiPrintMode('exam');
    setShowMultiPrintModal(true);
  };

  /** لجان مطابقة لاختبار معيّن ولديها طلاب قابلون للطباعة */
  const resolveExamCommittees = useCallback(
    (exam) => {
      if (!exam) return [];
      const stageKey = normalizeStage(exam.stage || '');
      const grades = examGrades(exam);

      let list = committees || [];
      if (stageKey && stageKey !== 'All') {
        list = list.filter((c) => !c.stage || c.stage === stageKey);
      }
      if (grades.length === 1) {
        list = committeesForGrade(list, students, grades[0], stageKey !== 'All' ? stageKey : null);
      } else if (grades.length > 1) {
        list = list.filter((c) => {
          if (!c.grade) return true;
          return grades.some((g) => isLevelMatch(c.grade, g));
        });
      }

      const printableInCommittee = (committee) => {
        let roster = getStudentsInCommittee(committee, students, false);
        if (grades.length) {
          roster = roster.filter((s) =>
            grades.some(
              (g) => isLevelMatch(s.grade, g) || isLevelMatch(s.classroom, g) || isLevelMatch(s.stage, g)
            )
          );
        }
        return roster.filter((s) => getStudentQRNationalId(s));
      };

      return list
        .filter((c) => printableInCommittee(c).length > 0)
        .sort((a, b) =>
          committeeHeaderNumber(a).localeCompare(committeeHeaderNumber(b), 'ar', { numeric: true })
        );
    },
    [committees, students]
  );

  const multiPrintEstimatedFiles = useMemo(() => {
    if (multiPrintMode === 'exam') return selectedExamsForMultiPrint.length;
    return selectedExamsForMultiPrint.reduce(
      (sum, ex) => sum + resolveExamCommittees(ex).length,
      0
    );
  }, [multiPrintMode, selectedExamsForMultiPrint, resolveExamCommittees]);

  const resolveEffectiveCustomConfig = useCallback(
    (templateValue) => {
      let cfg = { ...customConfig };
      if (String(templateValue).startsWith(CUSTOM_TEMPLATE_PREFIX)) {
        const id = getCustomTemplateIdFromValue(templateValue);
        const tpl = customTemplates.find((t) => t.id === id);
        if (tpl?.config) cfg = { ...defaultCustomConfig, ...tpl.config };
      }
      return cfg;
    },
    [customConfig, customTemplates, defaultCustomConfig]
  );

  const buildExamPrintPayload = useCallback(
    (exam, targetStudents, { templateValue, headerClass, headerSubject, dateStr, dayStr, committeeNumber }) => {
      const sheetSubject = (headerSubject || '').trim() || exam.subject || '';
      const fixedClass = (headerClass || '').trim();
      const commFallback = committeeNumberOnly(committeeNumber);
      const studentPayload = targetStudents.map((s) => ({
        id: getStudentQRNationalId(s),
        name: s.name,
        class_name: fixedClass || (s.grade || s.classroom || exam.grade || ''),
        subject: sheetSubject,
        date: dateStr,
        day: dayStr,
        seat_number: String(s.seatNumber ?? s.seat_number ?? '').trim(),
        committee_number: commFallback || committeeNumberOnly(s.committee),
      }));

      if (isTemplateCustom(templateValue)) {
        const effectiveCustomConfig = resolveEffectiveCustomConfig(templateValue);
        return {
          url: `${OMR_API_BASE}/generate-custom-batch-stream`,
          body: JSON.stringify({
            subject: sheetSubject,
            template_config: {
              ...effectiveCustomConfig,
              header_class_text: fixedClass,
              header_subject_text: (headerSubject || '').trim(),
            },
            num_questions: exam.qCount || 30,
            students: studentPayload,
          }),
        };
      }

      return {
        url: `${OMR_API_BASE}/generate-batch-stream`,
        body: JSON.stringify({
          subject: sheetSubject,
          template: templateValue,
          num_questions: exam.qCount || 30,
          students: studentPayload,
        }),
      };
    },
    [resolveEffectiveCustomConfig]
  );

  const existingArchiveFolders = useMemo(() => {
    const set = new Set();
    for (const e of exams) {
      if (!examArchived(e)) continue;
      const f = normalizeArchiveFolder(e.archiveFolder);
      if (f) set.add(f);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [exams]);

  const archivedFolderGroups = useMemo(() => {
    if (examArchiveTab !== 'archive') return [];
    const map = new Map();
    for (const e of visibleExams) {
      const key = normalizeArchiveFolder(e.archiveFolder);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    const pairs = [...map.entries()];
    pairs.sort((a, b) => {
      if (a[0] === '') return 1;
      if (b[0] === '') return -1;
      return a[0].localeCompare(b[0], 'ar');
    });
    return pairs.map(([folder, list]) => ({
      folder,
      label: folder === '' ? 'بدون مجلد' : folder,
      exams: list,
    }));
  }, [visibleExams, examArchiveTab]);

  const isArchiveFolderSectionOpen = (key) => archiveFolderOpen[key] !== false;
  const toggleArchiveFolderSection = (key) => {
    setArchiveFolderOpen((p) => ({ ...p, [key]: p[key] === false ? true : false }));
  };

  const filterGrades = filterStage !== 'All' ? STAGES[filterStage] || [] : [];

  const handleAddExam = async () => {
    const selectedGrades = Array.isArray(newExam.grades) && newExam.grades.length ? newExam.grades : (newExam.grade ? [newExam.grade] : []);
    if (!newExam.stage || selectedGrades.length === 0 || !newExam.subject) return;
    
    // Use manually entered title if provided, otherwise generate it
    const isNafs = newExam.template === 'nafs';
    // Use chosen subject if provided, default to 'اختبار مجمع' ONLY if template is nafs and no subject chosen
    const finalSubject = newExam.subject || (isNafs ? 'اختبار مجمع' : '');
    const gradeLabel = selectedGrades.length === 1 ? selectedGrades[0] : `(${selectedGrades.length} صفوف)`;
    const generatedTitle = isNafs ? `اختبار نافس - ${gradeLabel}` : `${finalSubject || 'اختبار'} - ${gradeLabel}`;
    const title = newExam.title || generatedTitle;

    const payload = { 
      ...newExam,
      grades: selectedGrades,
      grade: selectedGrades[0] || newExam.grade || '',
      subject: finalSubject, 
      title, 
      classroom: newExam.classroom || '',
      qCount: parseInt(newExam.qCount) || 30,
      updatedAt: new Date().toISOString() 
    };

    if (!newExam.id) { 
      payload.createdAt = new Date().toISOString(); 
      payload.keys = {}; 
    }
    
    await saveOmrExam(payload);
    setIsAdding(false);
    setNewExam({ stage: '', grade: '', grades: [], subject: '', qCount: 30, template: 'nafs', title: '', classroom: '', date: '' });
    load();
  };

  const openEditModal = (exam) => {
    const eg = examGrades(exam);
    setNewExam({ ...exam, grades: eg, grade: eg[0] || exam.grade || '' });
    setIsAdding(true);
  };

  const openArchiveFolderModal = (exam) => {
    if (!exam?.id) return;
    setArchiveTargetModal(exam);
    setArchiveTargetFolderInput('');
  };

  const closeArchiveFolderModal = () => {
    setArchiveTargetModal(null);
    setArchiveTargetFolderInput('');
  };

  const confirmArchiveToFolder = async () => {
    if (!archiveTargetModal?.id) return;
    const folder = normalizeArchiveFolder(archiveTargetFolderInput);
    await saveOmrExam({
      ...archiveTargetModal,
      archived: true,
      archivedAt: new Date().toISOString(),
      archiveFolder: folder || undefined,
      updatedAt: new Date().toISOString(),
    });
    closeArchiveFolderModal();
    load();
    toast.success(folder ? `تمت الأرشفة داخل المجلد «${folder}».` : 'تمت أرشفة الاختبار (بدون مجلد).', 'أرشيف');
  };

  const handleMoveArchivedExamFolder = async (exam, folderRaw) => {
    if (!exam?.id) return;
    const folder = normalizeArchiveFolder(folderRaw);
    if (folder === normalizeArchiveFolder(exam.archiveFolder)) return;
    await saveOmrExam({
      ...exam,
      archiveFolder: folder || undefined,
      updatedAt: new Date().toISOString(),
    });
    load();
    toast.success('تم نقل الاختبار بين المجلدات.', 'أرشيف');
  };

  const handleRenameArchiveFolderGroup = async (oldFolderKey) => {
    const oldK = normalizeArchiveFolder(oldFolderKey);
    const suggested = oldK || '';
    const next = window.prompt('اسم المجلد الجديد (فارغ = بدون مجلد):', suggested);
    if (next === null) return;
    const newF = normalizeArchiveFolder(next);
    if (newF === oldK) return;
    const list = exams.filter((e) => examArchived(e) && normalizeArchiveFolder(e.archiveFolder) === oldK);
    if (list.length === 0) return;
    if (!window.confirm(`سيتم نقل ${list.length} اختبار إلى «${newF || 'بدون مجلد'}». متابعة؟`)) return;
    const now = new Date().toISOString();
    for (const e of list) {
      await saveOmrExam({ ...e, archiveFolder: newF || undefined, updatedAt: now });
    }
    load();
    toast.success('تمت إعادة تسمية المجلد.', 'أرشيف');
  };

  const handleRestoreExam = async (exam) => {
    if (!exam?.id) return;
    await saveOmrExam({
      ...exam,
      archived: false,
      archivedAt: null,
      archiveFolder: undefined,
      updatedAt: new Date().toISOString(),
    });
    load();
    toast.success('تمت استعادة الاختبار إلى القائمة النشطة.', 'استعادة');
  };

  const handlePermanentDelete = async (examOrId) => {
    const exam =
      typeof examOrId === 'object' && examOrId != null
        ? examOrId
        : exams.find((e) => e.id === examOrId);
    const id = exam?.id ?? examOrId;
    if (!id) return;

    const title = exam?.title || exam?.subject || id;
    if (
      !window.confirm(
        `حذف الاختبار «${title}» نهائياً من قاعدة البيانات؟\n\nلا يمكن التراجع — النتائج المرتبطة قد تبقى في السجل.`
      )
    ) {
      return;
    }

    try {
      await deleteOmrExam(id);
      setSelectedExamIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (selectedBulkExam?.id === id) setShowBulkModal(false);
      await load();
      toast.success('تم حذف الاختبار.', 'حذف');
    } catch (err) {
      console.error('delete exam:', err);
      toast.error(err.message || 'تعذّر حذف الاختبار.', 'خطأ');
    }
  };

  const handleKeyChange = (q, v) => setEditingExam(p => ({ ...p, keys: { ...(p.keys || {}), [String(q)]: v } }));
  
  const openExamKeys = (exam) => {
    const existingWeights = exam.weights || {};
    const count = parseInt(exam.qCount) || 30;
    const initialWeights = {};
    for (let i = 1; i <= count; i++) {
        // Convert existing weights to strings for the input fields
        const w = existingWeights[String(i)];
        initialWeights[String(i)] = (w !== undefined && w !== null) ? String(w) : "1";
    }
    setEditingExam({ ...exam, weights: initialWeights });
  };

  const handleWeightChange = (q, v) => {
    setEditingExam(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        weights: {
          ...(prev.weights || {}),
          [String(q)]: v
        }
      };
    });
  };

  const resetWeights = () => {
    setEditingExam(prev => {
      if (!prev) return prev;
      const newWeights = {};
      const count = parseInt(prev.qCount) || 30;
      for (let i = 1; i <= count; i++) newWeights[String(i)] = "1";
      return { ...prev, weights: newWeights };
    });
  };

  const regradeApprovedResultsForExam = async (exam, { forceSave = false } = {}) => {
    if (!exam?.id) return { total: 0, updated: 0 };
    if (!exam?.keys || Object.keys(exam.keys).length === 0) {
      throw new Error('لا يوجد مفتاح إجابة لهذا الاختبار.');
    }

    const allResults = await getOmrResults();
    const forExam = allResults.filter(
      (r) => String(r.examId ?? '') === String(exam.id) && isApprovedOmrResult(r)
    );

    const versionAt = exam.keysUpdatedAt || new Date().toISOString();
    let updated = 0;

    for (const row of forExam) {
      const { changed, result: reg } = regradeResultWithExam(row, exam);
      if (forceSave || changed) {
        await saveOmrResult({
          ...reg,
          keysVersionAt: versionAt,
        });
        updated++;
      }
    }

    return { total: forExam.length, updated };
  };

  const handleBackfillPortalNationalIds = async () => {
    const ok = window.confirm(
      'مزامنة هوية الطالب لبوابة النتائج\n\n' +
        'يربط النتائج المعتمدة برقم الهوية الحالي في سجل كل طالب (بما فيها من تُعرف برقم الجلوس فقط).\n' +
        'لا يغيّر الدرجات.\n\n' +
        'قد يستغرق وقتاً حسب عدد الطلاب والنتائج. هل تريد المتابعة؟'
    );
    if (!ok) return;

    setBackfillingPortal(true);
    try {
      const students = await getStudents();
      let updated = 0;
      let scanned = 0;
      for (const st of students) {
        const nat = getStudentNationalId(st);
        if (!nat) continue;
        const { updated: u, scanned: s } = await syncOmrResultsForStudentNationalIdChange({
          previousNationalId: '',
          nextNationalId: nat,
          seatNumber: getStudentSeatNumber(st),
        });
        updated += u;
        scanned += s;
      }

      const all = await getOmrResults();
      const approved = all.filter(isApprovedOmrResult);
      for (const row of approved) {
        const enriched = enrichOmrResultForSave(row);
        const prevNat = String(row.nationalId || row.national_id || '').trim();
        const newNat = String(enriched.nationalId || enriched.national_id || '').trim();
        if (newNat && newNat !== prevNat) {
          await saveOmrResult({ ...enriched, id: row.id });
          updated++;
        }
      }

      if (updated === 0) {
        toast.info('لا توجد نتائج تحتاج تحديث هوية (أو الهوية مضبوطة مسبقاً).', 'مزامنة البوابة');
      } else {
        toast.success(
          `تم ربط/تحديث هوية ${updated} نتيجة (فُحص ${scanned} سجلًا عبر الجلوس والهوية).`,
          'مزامنة البوابة'
        );
      }
    } catch (e) {
      console.error('backfill portal national:', e);
      toast.error(e.message || 'تعذّرت المزامنة. تحقق من الاتصال.', 'خطأ');
    } finally {
      setBackfillingPortal(false);
    }
  };

  const handleRegradeApproved = async (exam) => {
    if (!exam?.keys || Object.keys(exam.keys).length === 0) {
      toast.warning('أضف مفتاح الإجابة للاختبار أولاً من زر «المفتاح».', 'تنبيه');
      return;
    }

    const ok = window.confirm(
      `إعادة تصحيح النتائج المعتمدة سابقاً\n\n` +
        `الاختبار: ${exam.title || exam.id}\n` +
        `سيتم تحديث الدرجات وتفاصيل الإجابات في قاعدة البيانات والبوابة وفق المفتاح الحالي.\n\n` +
        `هل تريد المتابعة؟`
    );
    if (!ok) return;

    setRegradingExamId(exam.id);
    try {
      const { total, updated } = await regradeApprovedResultsForExam(exam, { forceSave: true });
      if (total === 0) {
        toast.info('لا توجد نتائج معتمدة مسجلة لهذا الاختبار.', 'إعادة التصحيح');
      } else {
        toast.success(`تم تحديث ${updated} من ${total} نتيجة معتمدة (سابقة وجديدة).`, 'إعادة التصحيح');
      }
    } catch (e) {
      console.error('regrade approved:', e);
      toast.error(e.message || 'تعذّر إعادة التصحيح. تحقق من الاتصال.', 'خطأ');
    } finally {
      setRegradingExamId(null);
    }
  };

  const saveKeys = async () => {
    if (!editingExam) return;
    const finalWeights = {};
    const count = parseInt(editingExam.qCount) || 30;

    for (let i = 1; i <= count; i++) {
      const rawVal = editingExam.weights?.[String(i)];
      const parsed = parseFloat(rawVal);
      finalWeights[String(i)] = isNaN(parsed) ? 1 : parsed;
    }

    const examToSave = {
      ...editingExam,
      weights: finalWeights,
      keysUpdatedAt: new Date().toISOString(),
    };
    await saveOmrExam(examToSave);

    try {
      const { total, updated } = await regradeApprovedResultsForExam(examToSave, { forceSave: true });
      if (updated > 0) {
        toast.success(
          `تم حفظ المفتاح وتحديث ${updated} من ${total} نتيجة معتمدة.`,
          'تم التحديث'
        );
      } else if (total > 0) {
        toast.info('تم حفظ المفتاح. لم يتغير محتوى النتائج المعتمدة.', 'حفظ المفتاح');
      } else {
        toast.success('تم حفظ مفتاح الإجابة بنجاح.', 'تم الحفظ');
      }
    } catch (e) {
      console.error('regrade after keys save:', e);
      toast.warning(
        'تم حفظ المفتاح، لكن تعذّر إعادة تصحيح النتائج المعتمدة. استخدم «إعادة تصحيح المعتمدة».',
        'تنبيه'
      );
    }

    setEditingExam(null);
    load();
  };

  const stageStudents = useMemo(() => {
    if (!selectedBulkExam) return students;
    return students.filter(s => {
      if (modalStage === 'All') return true;
      if (!s.stage) return true; // Don't hide students with missing stage data
      return isLevelMatch(s.stage, modalStage);
    });
  }, [students, selectedBulkExam, modalStage]);

  const modalGrades = useMemo(() => {
    const set = new Set();
    stageStudents.forEach((s) => {
      const g = String(s.grade || s.classroom || '').trim();
      if (g) set.add(g);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [stageStudents]);

  const allowedExamGrades = useMemo(() => {
    if (!selectedBulkExam) return [];
    const eg = examGrades(selectedBulkExam);
    return eg.length ? eg : [];
  }, [selectedBulkExam]);

  /** لجان مطابقة للاختبار ولديها طلاب قابلون للطباعة */
  const examCommittees = useMemo(
    () => resolveExamCommittees(selectedBulkExam),
    [selectedBulkExam, resolveExamCommittees]
  );

  const committeePrintableCount = useCallback(
    (committee, exam = selectedBulkExam) => {
      if (!exam || !committee) return 0;
      const grades = examGrades(exam);
      let roster = getStudentsInCommittee(committee, students, false);
      if (grades.length) {
        roster = roster.filter((s) =>
          grades.some(
            (g) => isLevelMatch(s.grade, g) || isLevelMatch(s.classroom, g) || isLevelMatch(s.stage, g)
          )
        );
      }
      return roster.filter((s) => getStudentQRNationalId(s)).length;
    },
    [selectedBulkExam, students]
  );

  useEffect(() => {
    if (!showBulkModal || !selectedBulkExam) return;
    setSelectedCommitteeIds(new Set(examCommittees.map((c) => c.id)));
  }, [showBulkModal, selectedBulkExam?.id, examCommittees]);

  const isGuestStudent = useCallback((s) => {
    const cls = String(s?.classroom ?? s?.class ?? '').trim().toLowerCase();
    const stage = String(s?.stage ?? '').trim().toLowerCase();
    const grade = String(s?.grade ?? '').trim().toLowerCase();
    // Keywords for visiting students only (as requested)
    const guestKeywords = ['زائر', 'زوار', 'visitor'];
    const hay = `${cls} ${stage} ${grade}`;
    return guestKeywords.some(k => hay.includes(String(k).toLowerCase()));
  }, []);

  const filteredModalStudents = useMemo(() => {
    const raw = (studentSearch || '').trim();
    const needle = raw.toLowerCase();
    return stageStudents.filter(s => {
      // 1. Grade Match (Primary) — restrict to grades chosen in the exam (multi-grade supported)
      const baseGradeMatch = allowedExamGrades.length === 0
        ? true
        : allowedExamGrades.some(g => isLevelMatch(s.grade, g) || isLevelMatch(s.classroom, g) || isLevelMatch(s.stage, g));

      // Optional narrowing by a specific grade
      const gradeMatch =
        modalGrade === 'All'
          ? baseGradeMatch
          : (baseGradeMatch && (isLevelMatch(s.grade, modalGrade) || isLevelMatch(s.classroom, modalGrade) || isLevelMatch(s.stage, modalGrade)));
      
      // 2. Room/Class Match (Optional Filter)
      const roomMatch = selectedClass === 'All' || 
                        isLevelMatch(s.classroom, selectedClass) || 
                        isLevelMatch(s.class, selectedClass);

      // 2.5 Group filter (School/Guest)
      const guest = isGuestStudent(s);
      const groupMatch =
        studentGroupFilter === 'all' ||
        (studentGroupFilter === 'guest' && guest) ||
        (studentGroupFilter === 'school' && !guest);
      
      // 3. Search (اسم / رقم الطالب / جلوس / هوية)
      const searchMatch = !raw ||
        (s.name || '').toLowerCase().includes(needle) ||
        String(s.id || '').includes(raw) ||
        String(s.seatNumber ?? s.seat_number ?? '').includes(raw) ||
        String(s.nationalId ?? s.national_id ?? '').includes(raw);
      
      return gradeMatch && roomMatch && groupMatch && searchMatch;
    });
  }, [stageStudents, selectedClass, studentSearch, modalGrade, studentGroupFilter, isGuestStudent, allowedExamGrades]);

  const openBulkModal = (exam) => {
    setSelectedBulkExam(exam);
    setModalStage(normalizeStage(exam.stage || 'All'));
    setModalGrade('All');
    // Default the class selection to the classroom specified in the exam, or 'All'
    setSelectedClass('All');
    setSelectedStudentIds(new Set());
    setStudentSearch('');
    setStudentGroupFilter('all');
    // Pre-fill date from exam if available
    if (exam.date) {
        setDateInputValue(exam.date);
        handleDateChange(exam.date, dateType);
    }
    // Reset template selection to nafs each time the modal opens to avoid stale state
    setSelectedTemplate('nafs');
    setSelectedCustomTemplateId('');
    setCustomConfig({ ...defaultCustomConfig });
    setCustomTemplateName('');
    setPrintHeaderClass(derivePrintHeaderClassFromExam(exam));
    setPrintHeaderSubject(derivePrintHeaderSubjectFromExam(exam));
    setBulkPrintMode('students');
    setSelectedCommitteeIds(new Set());
    setCommitteeBulkProgress({ committeeIndex: 0, committeeTotal: 0, committeeLabel: '' });
    setShowBulkModal(true);
  };

  /** صفحة A4 من ملصقات متطابقة (مادة + صف) للصقها على أوراق OMR طُبعت سابقًا بدون هذه البيانات */
  const printExamStickers = useCallback((exam) => {
    const subject = escapeHtmlSticker(exam.subject || '—');
    const gradeLine = escapeHtmlSticker(stickerGradeLabel(exam));
    const titleHint = escapeHtmlSticker((exam.title || '').trim());
    const COLS = 3;
    const ROWS = 8;
    const total = COLS * ROWS;
    const stickerCells = Array.from({ length: total }, () => `
      <div class="sticker">
        <div class="line subj"><span class="lbl">المادة</span> ${subject}</div>
        <div class="line gr"><span class="lbl">الصف</span> ${gradeLine}</div>
        ${titleHint ? `<div class="hint">${titleHint}</div>` : ''}
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>ملصقات OMR</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Segoe UI', 'Tahoma', sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: 10pt; text-align: center; margin: 0 0 4mm; color: #334155; font-weight: 800; }
  .grid {
    display: grid;
    grid-template-columns: repeat(${COLS}, 1fr);
    gap: 3.5mm;
  }
  .sticker {
    border: 1.2px dashed #475569;
    border-radius: 6px;
    padding: 3mm 3.5mm;
    min-height: 22mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2mm;
    background: #fafafa;
  }
  .line { font-size: 10pt; font-weight: 800; color: #0f172a; line-height: 1.3; }
  .line.gr { font-size: 9pt; font-weight: 700; color: #1e293b; }
  .lbl { color: #64748b; font-weight: 700; font-size: 8pt; margin-left: 2mm; }
  .hint {
    font-size: 7.5pt;
    color: #64748b;
    font-weight: 600;
    margin-top: 1mm;
    line-height: 1.25;
    overflow: hidden;
    max-height: 9mm;
  }
  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <p class="no-print" style="text-align:center;font-size:10pt;color:#64748b;margin:0 0 4mm;padding:0 4mm">اقطع على الخطوط المتقطعة ثم الصق على الورقة. يمكنك طباعة عدة نسخ من نفس الصفحة من نافذة الطابعة.</p>
  <h1>ملصقات التعريف (${total} ملصق)</h1>
  <div class="grid">${stickerCells}</div>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
      toast.error('فتح نافذة الطباعة فشل. اسمح بالنوافذ المنبثقة لهذا الموقع.', 'طباعة الملصقات');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch (_) { /* ignore */ }
    }, 250);
  }, [toast]);

  /** ورقة A4 تعريفية: المادة + اسم الفصل + بيانات الاختبار — للمرافقة مع الدفعة أو طباعتها منفردة */
  const printExamCoverSheet = useCallback((exam, opts = {}) => {
    if (!exam) return;
    const subject = escapeHtmlSticker(
      opts.subjectOverride != null && String(opts.subjectOverride).trim()
        ? String(opts.subjectOverride).trim()
        : (exam.subject || '—')
    );
    const title = escapeHtmlSticker(exam.title || '—');
    const classNameLine = escapeHtmlSticker(resolveExamClassLabel(exam, opts));
    const gradesLine = escapeHtmlSticker(
      opts.gradeLabelOverride != null && String(opts.gradeLabelOverride).trim()
        ? String(opts.gradeLabelOverride).trim()
        : stickerGradeLabel(exam)
    );
    const stage = escapeHtmlSticker(exam.stage || '—');
    let metaDate = '';
    if (opts.examDateLine != null && String(opts.examDateLine).trim()) {
      metaDate = escapeHtmlSticker(String(opts.examDateLine).trim());
    } else if (exam.date) {
      const t = new Date(exam.date);
      if (!isNaN(t.getTime())) metaDate = escapeHtmlSticker(t.toLocaleDateString('ar-SA'));
    }

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>ورقة تعريف — ${subject}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Segoe UI', 'Tahoma', sans-serif;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    border: 3px solid #312e81;
    border-radius: 16px;
    padding: 16mm 14mm;
    min-height: calc(100vh - 28mm);
    background: linear-gradient(165deg, #fafbff 0%, #fff 45%);
  }
  .ribbon {
    display: inline-block;
    font-size: 10pt;
    font-weight: 800;
    color: #4338ca;
    letter-spacing: 0.06em;
    margin-bottom: 8mm;
    padding: 6px 14px;
    background: #eef2ff;
    border-radius: 999px;
  }
  h1 {
    margin: 0 0 12mm;
    font-size: 18pt;
    font-weight: 900;
    color: #0f172a;
    line-height: 1.35;
    text-align: center;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5mm 8mm;
  }
  .cell {
    border: 2px dashed #94a3b8;
    border-radius: 12px;
    padding: 5mm 6mm;
    background: #fff;
  }
  .cell.full { grid-column: 1 / -1; }
  .lbl {
    display: block;
    font-size: 9pt;
    font-weight: 800;
    color: #64748b;
    margin-bottom: 3mm;
  }
  .val {
    font-size: 14pt;
    font-weight: 900;
    color: #0f172a;
    line-height: 1.3;
  }
  .meta {
    margin-top: 10mm;
    text-align: center;
    font-size: 11pt;
    font-weight: 700;
    color: #475569;
  }
  .hint {
    margin-top: 12mm;
    padding-top: 8mm;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-size: 9pt;
    color: #94a3b8;
    font-weight: 600;
  }
  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <p class="no-print" style="text-align:center;font-size:10pt;color:#64748b;margin:0 0 6mm">اطبع هذه الصفحة وضعها مع حزمة أوراق الاختبار أو على المجلد.</p>
  <div class="sheet">
    <span class="ribbon">ورقة تعريف — مادة وفصل</span>
    <h1>${title}</h1>
    <div class="grid">
      <div class="cell">
        <span class="lbl">المادة</span>
        <span class="val">${subject}</span>
      </div>
      <div class="cell">
        <span class="lbl">اسم الفصل</span>
        <span class="val">${classNameLine}</span>
      </div>
      <div class="cell">
        <span class="lbl">الصف الدراسي</span>
        <span class="val">${gradesLine}</span>
      </div>
      <div class="cell">
        <span class="lbl">المرحلة</span>
        <span class="val">${stage}</span>
      </div>
    </div>
    ${metaDate ? `<p class="meta">${metaDate}</p>` : ''}
    <p class="hint">لا تُلصق على منطقة الرمز أو دوائر الإجابة — للتعريف والفرز فقط.</p>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
      toast.error('فتح نافذة الطباعة فشل. اسمح بالنوافذ المنبثقة.', 'ورقة التعريف');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch (_) { /* ignore */ }
    }, 280);
  }, [toast]);

  /** نموذج الإجابات الصحيحة — للمراقب/المصحّح وفق مفتاح الاختبار */
  const printExamAnswerKeySheet = useCallback((exam) => {
    if (!exam) return;
    const keys = exam.keys || {};
    const keyCount = Object.keys(keys).filter((k) => keys[k]).length;
    if (keyCount === 0) {
      toast.warning('أضف مفتاح الإجابة أولاً من زر «المفتاح».', 'تنبيه');
      return;
    }

    const qCount = parseInt(exam.qCount, 10) || 30;
    const weights = exam.weights || {};
    const subject = escapeHtmlSticker(exam.subject || '—');
    const title = escapeHtmlSticker(exam.title || '—');
    const gradeLine = escapeHtmlSticker(stickerGradeLabel(exam));
    const stage = escapeHtmlSticker(exam.stage || '—');
    let metaDate = '';
    if (exam.date) {
      const t = new Date(exam.date);
      if (!isNaN(t.getTime())) metaDate = escapeHtmlSticker(t.toLocaleDateString('ar-SA'));
    }

    const renderQuestionRow = (q) => {
      const correct = String(keys[String(q)] || '').toUpperCase();
      const wRaw = weights[String(q)];
      const pts =
        wRaw !== undefined && wRaw !== null && String(wRaw).trim() !== ''
          ? escapeHtmlSticker(String(wRaw))
          : '1';
      const opts = ['A', 'B', 'C', 'D']
        .map(
          (o) =>
            `<span class="opt ${correct === o ? 'correct' : ''}"><span class="letter">${o}</span><span class="bubble"></span></span>`
        )
        .join('');
      return `<tr>
        <td class="qnum">${q}</td>
        <td class="opts">${opts}</td>
        <td class="pts">${pts}</td>
      </tr>`;
    };

    const half = Math.ceil(qCount / 2);
    const leftRows = Array.from({ length: half }, (_, i) => renderQuestionRow(i + 1)).join('');
    const rightRows = Array.from({ length: qCount - half }, (_, i) => renderQuestionRow(half + i + 1)).join('');

    let totalPoints = 0;
    for (let q = 1; q <= qCount; q++) {
      const wRaw = weights[String(q)];
      const n = parseFloat(String(wRaw ?? '1').replace(',', '.'));
      totalPoints += Number.isFinite(n) ? n : 1;
    }
    const totalLabel = Number.isInteger(totalPoints) ? String(totalPoints) : totalPoints.toFixed(1);

    const tableBlock = (rows, startLabel, endLabel) => `
      <div class="col">
        <div class="col-head">${startLabel}${endLabel !== startLabel ? ` — ${endLabel}` : ''}</div>
        <table>
          <thead>
            <tr>
              <th>س</th>
              <th>الإجابة الصحيحة</th>
              <th>درجة</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/>
<title>نموذج الإجابات — ${subject}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Segoe UI', 'Tahoma', sans-serif;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    border: 3px solid #6d28d9;
    border-radius: 14px;
    padding: 10mm;
    background: linear-gradient(165deg, #faf5ff 0%, #fff 40%);
  }
  .ribbon {
    display: inline-block;
    font-size: 9pt;
    font-weight: 800;
    color: #6d28d9;
    padding: 5px 12px;
    background: #f3e8ff;
    border-radius: 999px;
    margin-bottom: 5mm;
  }
  h1 {
    margin: 0 0 4mm;
    font-size: 16pt;
    font-weight: 900;
    color: #0f172a;
    text-align: center;
    line-height: 1.35;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3mm;
    margin-bottom: 6mm;
  }
  .meta {
    border: 1px solid #e9d5ff;
    border-radius: 8px;
    padding: 2.5mm 3mm;
    background: #fff;
    text-align: center;
  }
  .meta .lbl { display: block; font-size: 7.5pt; font-weight: 800; color: #64748b; margin-bottom: 1mm; }
  .meta .val { font-size: 9.5pt; font-weight: 900; color: #0f172a; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .col-head {
    font-size: 8pt;
    font-weight: 800;
    color: #6d28d9;
    text-align: center;
    margin-bottom: 2mm;
  }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th {
    background: #6d28d9;
    color: #fff;
    font-weight: 800;
    padding: 2mm 1.5mm;
    text-align: center;
  }
  td { border-bottom: 1px solid #e2e8f0; padding: 1.8mm 1.5mm; vertical-align: middle; }
  .qnum { width: 8mm; text-align: center; font-weight: 900; color: #475569; }
  .pts { width: 10mm; text-align: center; font-weight: 800; color: #6d28d9; }
  .opts { text-align: center; }
  .opt {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5mm;
    margin: 0 1.2mm;
    opacity: 0.45;
  }
  .opt .letter { font-size: 7pt; font-weight: 800; color: #64748b; }
  .opt .bubble {
    width: 4.5mm;
    height: 4.5mm;
    border: 1.2px solid #94a3b8;
    border-radius: 50%;
    background: #fff;
  }
  .opt.correct {
    opacity: 1;
  }
  .opt.correct .letter { color: #6d28d9; font-weight: 900; }
  .opt.correct .bubble {
    border-color: #6d28d9;
    background: #6d28d9;
    box-shadow: inset 0 0 0 1px #fff;
  }
  .footer {
    margin-top: 5mm;
    padding-top: 4mm;
    border-top: 2px dashed #cbd5e1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9pt;
    font-weight: 800;
    color: #334155;
  }
  .footer .total { color: #6d28d9; font-size: 11pt; }
  .note {
    margin-top: 3mm;
    text-align: center;
    font-size: 8pt;
    color: #94a3b8;
    font-weight: 600;
  }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <p class="no-print" style="text-align:center;font-size:10pt;color:#64748b;margin:0 0 4mm">نموذج الإجابات الصحيحة — للمراقب والمصحّح. لا يُوزَّع على الطلاب.</p>
  <div class="sheet">
    <span class="ribbon">نموذج الإجابات الصحيحة — مفتاح التصحيح</span>
    <h1>${title}</h1>
    <div class="meta-grid">
      <div class="meta"><span class="lbl">المادة</span><span class="val">${subject}</span></div>
      <div class="meta"><span class="lbl">الصف</span><span class="val">${gradeLine}</span></div>
      <div class="meta"><span class="lbl">المرحلة</span><span class="val">${stage}</span></div>
      <div class="meta"><span class="lbl">عدد الأسئلة</span><span class="val">${qCount}</span></div>
    </div>
    ${metaDate ? `<p style="text-align:center;font-size:9pt;font-weight:700;color:#475569;margin:0 0 5mm">${metaDate}</p>` : ''}
    <div class="cols">
      ${tableBlock(leftRows, '1', String(half))}
      ${rightRows ? tableBlock(rightRows, String(half + 1), String(qCount)) : ''}
    </div>
    <div class="footer">
      <span>الدائرة المظلّلة = الإجابة الصحيحة</span>
      <span class="total">مجموع الدرجات: ${totalLabel}</span>
    </div>
    <p class="note">سري — للاستخدام الداخلي فقط · يُطبَع من مفتاح الإجابة المحفوظ في النظام</p>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) {
      toast.error('فتح نافذة الطباعة فشل. اسمح بالنوافذ المنبثقة.', 'نموذج الإجابات');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch (_) { /* ignore */ }
    }, 280);
  }, [toast]);

  const toggleStudent = (id) => setSelectedStudentIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const toggleAll = () => {
    const allSel = filteredModalStudents.every(s => selectedStudentIds.has(s.id));
    setSelectedStudentIds(prev => {
      const n = new Set(prev);
      filteredModalStudents.forEach(s => allSel ? n.delete(s.id) : n.add(s.id));
      return n;
    });
  };

  const allFilteredSel = filteredModalStudents.length > 0 && filteredModalStudents.every(s => selectedStudentIds.has(s.id));

  const toggleCommittee = (id) =>
    setSelectedCommitteeIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAllCommittees = () => {
    const allSel = examCommittees.length > 0 && examCommittees.every((c) => selectedCommitteeIds.has(c.id));
    setSelectedCommitteeIds(allSel ? new Set() : new Set(examCommittees.map((c) => c.id)));
  };

  const allCommitteesSel =
    examCommittees.length > 0 && examCommittees.every((c) => selectedCommitteeIds.has(c.id));

  const switchBulkPrintMode = (mode) => {
    setBulkPrintMode(mode);
    if (mode === 'committees' && examCommittees.length) {
      setSelectedCommitteeIds((prev) =>
        prev.size > 0 ? prev : new Set(examCommittees.map((c) => c.id))
      );
    }
  };

  const handleCommitteeBulkPrint = async () => {
    if (!selectedBulkExam || selectedCommitteeIds.size === 0) return;

    const selectedList = examCommittees.filter((c) => selectedCommitteeIds.has(c.id));
    if (!selectedList.length) return;

    setIsGenerating(true);
    setPrintProgress({ done: 0, total: 0, currentName: '' });
    setPrintTotalTime(null);
    setCommitteeBulkProgress({
      committeeIndex: 0,
      committeeTotal: selectedList.length,
      committeeLabel: '',
    });

    printStartRef.current = Date.now();
    setPrintElapsed(0);
    timerRef.current = setInterval(() => {
      setPrintElapsed(Math.floor((Date.now() - printStartRef.current) / 1000));
    }, 1000);

    const grades = examGrades(selectedBulkExam);
    const skipped = [];
    let filesOk = 0;

    try {
      for (let ci = 0; ci < selectedList.length; ci++) {
        const committee = selectedList[ci];
        const commNum = committeeNumberOnly(committee);
        setCommitteeBulkProgress({
          committeeIndex: ci + 1,
          committeeTotal: selectedList.length,
          committeeLabel: commNum,
        });

        let roster = getStudentsInCommittee(committee, students);
        if (grades.length) {
          roster = roster.filter((s) =>
            grades.some(
              (g) => isLevelMatch(s.grade, g) || isLevelMatch(s.classroom, g) || isLevelMatch(s.stage, g)
            )
          );
        }
        const targets = roster.filter((s) => getStudentQRNationalId(s));
        const missingCount = roster.length - targets.length;

        if (targets.length === 0) {
          skipped.push({
            committee,
            reason: missingCount > 0 ? 'لا طلاب برقم هوية' : 'لا طلاب في اللجنة',
          });
          continue;
        }

        const { url, body } = buildExamPrintPayload(selectedBulkExam, targets, {
          templateValue: selectedTemplate,
          headerClass: (printHeaderClass || '').trim(),
          headerSubject: (printHeaderSubject || '').trim(),
          dateStr: examDate,
          dayStr: examDay,
          committeeNumber: commNum,
        });

        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        if (!res.ok) throw new Error(`HTTP ${res.status} — لجنة ${commNum}`);

        const pdfB64 = await streamOmrPdfBase64(res, (evt) => {
          setPrintProgress({ done: evt.done, total: evt.total, currentName: evt.name || '' });
        });

        if (!pdfB64) {
          skipped.push({ committee, reason: 'لم يُستلم PDF' });
          continue;
        }

        downloadPdfBase64(
          pdfB64,
          safeCommitteeOmrPdfFilename(selectedBulkExam, committee, {
            subjectOverride: (printHeaderSubject || '').trim(),
            gradeOverride: (printHeaderClass || '').trim(),
          })
        );
        filesOk += 1;
        if (missingCount > 0) {
          skipped.push({ committee, reason: `تخطّي ${missingCount} بدون هوية` });
        }
        await new Promise((r) => setTimeout(r, 450));
      }

      const finalSec = Math.floor((Date.now() - printStartRef.current) / 1000);
      setPrintTotalTime(finalSec);

      if (filesOk === 0) {
        toast.error('لم يُنشأ أي ملف. تحقق من اللجان وأرقام الهوية.', 'طباعة باللجان');
      } else {
        toast.success(`تم تنزيل ${filesOk} ملف PDF — ملف منفصل لكل لجنة.`, 'طباعة باللجان');
      }
      if (skipped.length) {
        const lines = skipped
          .slice(0, 6)
          .map(
            (s) =>
              `${committeeNumberOnly(s.committee) || s.committee?.name || '—'}: ${s.reason}`
          )
          .join('\n');
        toast.info(
          skipped.length > 6 ? `${lines}\n…` : lines,
          skipped.length === 1 ? 'تنبيه' : `تنبيه (${skipped.length})`
        );
      }
    } catch (err) {
      alert(`فشل توليد الملفات: ${err.message || ''}`);
    } finally {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setIsGenerating(false);
      setPrintProgress({ done: 0, total: 0, currentName: '' });
      setPrintElapsed(0);
      setCommitteeBulkProgress({ committeeIndex: 0, committeeTotal: 0, committeeLabel: '' });
    }
  };

  const handleBulkPrint = async () => {
    if (!selectedBulkExam || selectedStudentIds.size === 0) return;
    setIsGenerating(true);
    setPrintProgress({ done: 0, total: selectedStudentIds.size, currentName: '' });
    setPrintTotalTime(null);

    printStartRef.current = Date.now();
    setPrintElapsed(0);
    timerRef.current = setInterval(() => {
      setPrintElapsed(Math.floor((Date.now() - printStartRef.current) / 1000));
    }, 1000);

    const target = stageStudents.filter((s) => selectedStudentIds.has(s.id));
    const missingNational = target.filter((s) => !getStudentQRNationalId(s));
    if (missingNational.length > 0) {
      const sample = missingNational.slice(0, 5).map((s) => s.name || s.id).join('، ');
      toast.error(
        `لا يمكن الطباعة: ${missingNational.length} طالب بدون رقم هوية في السجل (مثلاً: ${sample}${missingNational.length > 5 ? '…' : ''}). أضف رقم الهوية لكل طالب ثم أعد المحاولة.`,
        'رقم الهوية مطلوب'
      );
      clearInterval(timerRef.current);
      timerRef.current = null;
      setIsGenerating(false);
      setPrintProgress({ done: 0, total: 0, currentName: '' });
      setPrintElapsed(0);
      return;
    }

    try {
      const { url, body } = buildExamPrintPayload(selectedBulkExam, target, {
        templateValue: selectedTemplate,
        headerClass: (printHeaderClass || '').trim(),
        headerSubject: (printHeaderSubject || '').trim(),
        dateStr: examDate,
        dayStr: examDay,
      });

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const pdfB64 = await streamOmrPdfBase64(res, (evt) => {
        setPrintProgress({ done: evt.done, total: evt.total, currentName: evt.name || '' });
      });

      if (pdfB64) {
        downloadPdfBase64(
          pdfB64,
          safeOmrPdfFilename(selectedBulkExam, {
            subjectOverride: (printHeaderSubject || '').trim(),
            gradeOverride: (printHeaderClass || '').trim(),
          })
        );
        const finalSec = Math.floor((Date.now() - printStartRef.current) / 1000);
        setPrintTotalTime(finalSec);
        if (printCoverWithBulk) {
          const ex = selectedBulkExam;
          const cls = selectedClass;
          const dLine = `${examDay} — ${examDate}`;
          setTimeout(() => {
            printExamCoverSheet(ex, {
              selectedClassroom: cls,
              examDateLine: dLine,
              subjectOverride: (printHeaderSubject || '').trim() || undefined,
              gradeLabelOverride: (printHeaderClass || '').trim() || undefined,
            });
          }, 500);
        }
      } else {
        throw new Error('لم يتم استلام ملف PDF');
      }
    } catch (err) {
      alert(`فشل توليد الملف: ${err.message || ''}`);
    } finally {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setIsGenerating(false);
      setPrintProgress({ done: 0, total: 0, currentName: '' });
      setPrintElapsed(0);
    }
  };

  const handleMultiExamPrint = async () => {
    const examsToPrint = selectedExamsForMultiPrint;
    if (!examsToPrint.length) return;

    setIsGenerating(true);
    setPrintProgress({ done: 0, total: 0, currentName: '' });
    setPrintTotalTime(null);
    setCommitteeBulkProgress({ committeeIndex: 0, committeeTotal: 0, committeeLabel: '' });
    printStartRef.current = Date.now();
    setPrintElapsed(0);
    timerRef.current = setInterval(() => {
      setPrintElapsed(Math.floor((Date.now() - printStartRef.current) / 1000));
    }, 1000);

    const skipped = [];
    let filesOk = 0;
    const byCommittee = multiPrintMode === 'committee';

    const printOneBatch = async (exam, targets, committee) => {
      const timing = resolveExamPrintTiming(exam, dateType);
      if (!timing.hasDate) {
        skipped.push({ exam, committee, reason: 'لا تاريخ مسجّل للاختبار — عدّله من «تعديل البيانات»' });
        return false;
      }

      const cfg = resolveEffectiveCustomConfig(multiPrintTemplate);
      const headerClass =
        (isTemplateCustom(multiPrintTemplate)
          ? String(cfg.header_class_text ?? '').trim()
          : '') || derivePrintHeaderClassFromExam(exam);
      const headerSubject =
        (isTemplateCustom(multiPrintTemplate)
          ? String(cfg.header_subject_text ?? '').trim()
          : '') || derivePrintHeaderSubjectFromExam(exam);

      const commNum = committee ? committeeNumberOnly(committee) : '';

      const { url, body } = buildExamPrintPayload(exam, targets, {
        templateValue: multiPrintTemplate,
        headerClass,
        headerSubject,
        dateStr: timing.dateStr,
        dayStr: timing.dayStr,
        committeeNumber: commNum || undefined,
      });

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} — ${exam.title || exam.id}${committee ? ` / لجنة ${commNum}` : ''}`
        );
      }

      const pdfB64 = await streamOmrPdfBase64(res, (evt) => {
        setMultiPrintProgress((prev) => ({
          ...prev,
          done: evt.done,
          total: evt.total,
          currentName: evt.name || '',
        }));
        setPrintProgress({ done: evt.done, total: evt.total, currentName: evt.name || '' });
      });

      if (!pdfB64) {
        skipped.push({
          exam,
          committee,
          reason: 'لم يُستلم PDF',
        });
        return false;
      }

      const filename = committee
        ? safeCommitteeOmrPdfFilename(exam, committee, {
            subjectOverride: headerSubject,
            gradeOverride: headerClass,
          })
        : safeOmrPdfFilename(exam, {
            subjectOverride: headerSubject,
            gradeOverride: headerClass,
          });
      downloadPdfBase64(pdfB64, filename);
      return true;
    };

    try {
      for (let ei = 0; ei < examsToPrint.length; ei++) {
        const exam = examsToPrint[ei];
        setMultiPrintProgress({
          examIndex: ei + 1,
          examTotal: examsToPrint.length,
          examTitle: exam.title || exam.subject || '',
          done: 0,
          total: 0,
          currentName: '',
        });

        if (byCommittee) {
          const examCommitteesList = resolveExamCommittees(exam);
          if (!examCommitteesList.length) {
            skipped.push({ exam, reason: 'لا لجان مطابقة أو بدون طلاب قابلين للطباعة' });
            continue;
          }

          for (let ci = 0; ci < examCommitteesList.length; ci++) {
            const committee = examCommitteesList[ci];
            const commNum = committeeNumberOnly(committee);
            setCommitteeBulkProgress({
              committeeIndex: ci + 1,
              committeeTotal: examCommitteesList.length,
              committeeLabel: commNum,
            });

            const grades = examGrades(exam);
            let roster = getStudentsInCommittee(committee, students);
            if (grades.length) {
              roster = roster.filter((s) =>
                grades.some(
                  (g) => isLevelMatch(s.grade, g) || isLevelMatch(s.classroom, g) || isLevelMatch(s.stage, g)
                )
              );
            }
            const targets = roster.filter((s) => getStudentQRNationalId(s));
            const missingCount = roster.length - targets.length;

            if (targets.length === 0) {
              skipped.push({
                exam,
                committee,
                reason: missingCount > 0 ? 'لا طلاب برقم هوية' : 'لا طلاب في اللجنة',
              });
              continue;
            }

            const ok = await printOneBatch(exam, targets, committee);
            if (ok) {
              filesOk += 1;
              if (missingCount > 0) {
                skipped.push({ exam, committee, reason: `تخطّي ${missingCount} بدون هوية` });
              }
            }
            await new Promise((r) => setTimeout(r, 450));
          }
          continue;
        }

        let targets = studentsMatchingExam(exam, students).filter((s) => getStudentQRNationalId(s));
        const allMatching = studentsMatchingExam(exam, students);
        const missingCount = allMatching.length - targets.length;

        if (targets.length === 0) {
          skipped.push({
            exam,
            reason: missingCount > 0 ? 'لا طلاب برقم هوية' : 'لا طلاب مطابقين للصف',
          });
          continue;
        }

        const ok = await printOneBatch(exam, targets, null);
        if (ok) {
          filesOk += 1;
          if (missingCount > 0) {
            skipped.push({ exam, reason: `تخطّي ${missingCount} بدون هوية` });
          }
        }
        await new Promise((r) => setTimeout(r, 450));
      }

      const finalSec = Math.floor((Date.now() - printStartRef.current) / 1000);
      setPrintTotalTime(finalSec);

      if (filesOk === 0) {
        toast.error('لم يُنشأ أي ملف. تحقق من الطلاب وأرقام الهوية.', 'طباعة متعددة');
      } else {
        toast.success(
          byCommittee
            ? `تم تنزيل ${filesOk} ملف PDF — ملف منفصل لكل لجنة في كل اختبار.`
            : `تم تنزيل ${filesOk} ملف PDF — ملف منفصل لكل اختبار.`,
          'طباعة متعددة'
        );
      }
      if (skipped.length) {
        const detail = skipped
          .slice(0, 4)
          .map((s) => {
            const title = s.exam.title || s.exam.subject;
            const comm = s.committee ? ` / لجنة ${committeeNumberOnly(s.committee) || '—'}` : '';
            return `${title}${comm}: ${s.reason}`;
          })
          .join(' · ');
        toast.warning(
          skipped.length > 4 ? `${detail} …` : detail,
          'ملاحظات'
        );
      }
    } catch (err) {
      toast.error(`فشل التوليد: ${err.message || ''}`, 'خطأ');
    } finally {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setIsGenerating(false);
      setPrintProgress({ done: 0, total: 0, currentName: '' });
      setPrintElapsed(0);
      setCommitteeBulkProgress({ committeeIndex: 0, committeeTotal: 0, committeeLabel: '' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6 md:p-10 font-main overflow-x-hidden pt-2">
      {/* ── Main Dashboard Header ── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 font-header leading-[1.1] tracking-tighter mb-4 text-right">
            نظام <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">التصحيح الذكي</span>
          </h1>
          <div className="flex items-center gap-4 text-slate-400 font-bold bg-white/50 w-fit px-5 py-2 rounded-2xl border border-slate-100/50 shadow-sm backdrop-blur-sm mr-auto lg:mr-0 ml-auto lg:flex-row-reverse">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
             إدارة وتصحيح الاختبارات المؤتمتة (OMR)
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 md:gap-6">
          <div className="flex items-center p-2 bg-slate-100/80 backdrop-blur-md rounded-3xl border border-white shadow-xl">
            <button onClick={() => setActiveTab('exams')} className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black transition-all duration-300 ${activeTab === 'exams' ? 'bg-white text-indigo-600 shadow-lg scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
              <FileStack size={20} /> الاختبارات
            </button>
            <button onClick={() => setActiveTab('subjects')} className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-black transition-all duration-300 ${activeTab === 'subjects' ? 'bg-white text-violet-600 shadow-lg scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
              <BookOpen size={18} /> المقررات
            </button>
          </div>
          {activeTab === 'exams' && (
            <>
            <button
              type="button"
              disabled={backfillingPortal}
              onClick={handleBackfillPortalNationalIds}
              title="نسخ رقم الهوية إلى nationalId في النتائج المعتمدة لظهورها كلها في بوابة الطالب"
              className="flex items-center gap-2 px-5 py-3 rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/90 text-sky-900 font-black text-sm hover:bg-sky-100/90 transition-all disabled:opacity-50"
            >
              {backfillingPortal ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              مزامنة هويات البوابة
            </button>
            <div className="flex p-1 bg-amber-50/90 rounded-2xl border border-amber-100/80 shadow-inner ring-1 ring-amber-100/50 w-full sm:w-auto min-w-0">
              <button
                type="button"
                onClick={() => setExamArchiveTab('active')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-sm transition-all ${examArchiveTab === 'active' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <FileStack size={18} /> نشطة
              </button>
              <button
                type="button"
                onClick={() => setExamArchiveTab('archive')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-sm transition-all ${examArchiveTab === 'archive' ? 'bg-white text-amber-800 shadow-md' : 'text-slate-500 hover:text-amber-900'}`}
              >
                <Archive size={18} /> أرشيف
              </button>
            </div>
            </>
          )}
          <button onClick={() => { setActiveTab('exams'); setIsAdding(true); }} className="flex items-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all shadow-2xl shadow-slate-200 active:scale-95">
            <Plus size={20} className="text-indigo-400" /> اختبار جديد
          </button>
        </div>
      </div>

      {activeTab === 'exams' ? (
        <>
          {/* ── Filter Bar ── */}
          <div className="luxury-card p-6 border-none bg-white shadow-2xl ring-1 ring-slate-100 flex flex-col gap-6 mb-10 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="relative flex-1 w-full group">
              <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
              <input type="text" placeholder="ابحث عن اختبار معين..." className="w-full pr-14 pl-8 py-4 bg-slate-50/50 border-2 border-transparent rounded-2xl outline-none focus:bg-white focus:border-indigo-100 focus:ring-8 focus:ring-indigo-50 font-bold transition-all text-right shadow-inner" />
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              {[
                { val: filterStage, set: setFilterStage, options: ['All', ...Object.keys(STAGES)], label: 'المرحلة' },
                { val: filterGrade, set: setFilterGrade, options: ['All', ...filterGrades], label: 'الصف' },
                { val: filterSubject, set: setFilterSubject, options: ['All', ...subjects.map(s => s.name)], label: 'المادة' }
              ].map((f, i) => (
                <div key={i} className="relative group min-w-[140px]">
                  <select value={f.val} onChange={e => f.set(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50/50 border-none rounded-xl font-black text-[11px] outline-none focus:ring-4 focus:ring-indigo-50 transition-all appearance-none cursor-pointer text-slate-600">
                    <option value="All">{f.label}: الكل</option>
                    {f.options.filter(o => o !== 'All').map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none group-hover:text-indigo-400 transition-colors" size={14} />
                </div>
              ))}
            </div>
            </div>
            {visibleExams.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={toggleSelectAllVisibleExams}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-black text-xs transition-all"
                >
                  {allVisibleExamsSelected ? <CheckSquare size={16} className="text-indigo-600" /> : <Square size={16} />}
                  {allVisibleExamsSelected ? 'إلغاء تحديد الكل' : 'تحديد كل الاختبارات المعروضة'}
                  <span className="text-slate-400 font-bold">({visibleExams.length})</span>
                </button>
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  {selectedExamIds.size > 0 && (
                    <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl">
                      محدّد: {selectedExamIds.size}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={selectedExamIds.size === 0 || isGenerating}
                    onClick={openMultiPrintModal}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs hover:bg-indigo-700 transition-all disabled:opacity-40 shadow-lg shadow-indigo-100"
                  >
                    <Printer size={16} />
                    طباعة المحدد
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Exam Grid ── */}
          {loading ? (
             <div className="flex flex-col items-center justify-center py-40 gap-6">
                <div className="w-20 h-20 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
                <p className="text-slate-400 font-black">جاري التحميل...</p>
             </div>
          ) : visibleExams.length === 0 ? (
            <div className="luxury-card p-20 text-center bg-slate-50/50 border-2 border-dashed border-slate-200">
               <FileStack size={48} className="mx-auto text-slate-200 mb-4" />
               <h3 className="text-xl font-black text-slate-400">{examArchiveTab === 'archive' ? 'لا توجد اختبارات في الأرشيف' : 'لا توجد اختبارات مسجلة'}</h3>
            </div>
          ) : examArchiveTab === 'active' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {visibleExams.map(exam => (
                <div key={exam.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => toggleExamSelection(exam.id)}
                    className={`absolute top-4 left-4 z-20 w-9 h-9 rounded-xl flex items-center justify-center border-2 transition-all shadow-sm ${
                      selectedExamIds.has(exam.id)
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'
                    }`}
                    title={selectedExamIds.has(exam.id) ? 'إلغاء التحديد' : 'تحديد للطباعة المتعددة'}
                  >
                    {selectedExamIds.has(exam.id) ? <Check size={18} strokeWidth={3} /> : <Square size={16} />}
                  </button>
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2rem] blur-2xl opacity-0 group-hover:opacity-10 transition-opacity duration-500"></div>
                  <div className="luxury-card h-full bg-white border-2 border-transparent group-hover:border-indigo-100 rounded-[2rem] shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden flex flex-col relative z-10 text-right">
                    <div className="p-6 pb-4">
                      <div className="flex justify-between items-start mb-6">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 ${exam.template === 'nafs' ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-purple-600 text-white shadow-purple-100'}`}>
                          {getSubjectIcon(exam.subject, 24)}
                        </div>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => openEditModal(exam)} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all active:scale-90" title="تعديل البيانات">
                            <Settings size={18} strokeWidth={2.25} />
                          </button>
                          <button type="button" onClick={() => openArchiveFolderModal(exam)} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:text-amber-700 hover:bg-amber-50 hover:border-amber-200 transition-all active:scale-90" title="أرشفة">
                            <Archive size={18} strokeWidth={2.25} />
                          </button>
                          <button type="button" onClick={() => handlePermanentDelete(exam)} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all active:scale-90" title="حذف الاختبار">
                            <Trash2 size={18} strokeWidth={2.25} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 mb-4">
                        <div className="flex flex-wrap gap-1.5 mb-2 justify-end items-center">
                          <span className="px-3 py-1 rounded-lg bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest">{exam.stage}</span>
                          <span className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest">{exam.grade}</span>
                          {exam.date && (
                            <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black flex items-center gap-1">
                              <Calendar size={10} /> {new Date(exam.date).toLocaleDateString('ar-SA')}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight line-clamp-2">{exam.title}</h3>
                      </div>
                    </div>
                    <div className="p-5 pt-0 mt-auto flex flex-col gap-2">
                      <div className="flex gap-2.5">
                        <button type="button" onClick={() => openBulkModal(exam)} className="flex-1 py-3.5 bg-slate-900 text-white rounded-xl font-black text-[9px] hover:bg-black transition-all flex flex-col items-center justify-center gap-1.5"><Printer size={16} /> طباعة</button>
                        <button type="button" onClick={() => openExamKeys(exam)} className="flex-1 py-3.5 bg-white text-slate-900 border border-slate-100 rounded-xl font-black text-[9px] hover:border-indigo-100 transition-all flex flex-col items-center justify-center gap-1.5"><Edit2 size={16} /> المفتاح</button>
                        <button type="button" onClick={() => navigate(`/omr-scanner/${exam.id}`)} className="flex-1 py-3.5 bg-indigo-600 text-white rounded-xl font-black text-[9px] hover:bg-indigo-700 transition-all flex flex-col items-center justify-center gap-1.5 shadow-xl shadow-indigo-100"><ScanLine size={16} /> تصحيح</button>
                      </div>
                      <button
                        type="button"
                        disabled={regradingExamId === exam.id}
                        onClick={() => handleRegradeApproved(exam)}
                        title="تحديث درجات النتائج المعتمدة سابقاً وفق مفتاح الإجابة الحالي"
                        className="w-full py-2.5 rounded-xl border-2 border-dashed border-emerald-200/90 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-100/80 transition-all flex items-center justify-center gap-2 font-black text-[9px] disabled:opacity-50"
                      >
                        {regradingExamId === exam.id ? (
                          <Loader2 size={14} className="animate-spin shrink-0" />
                        ) : (
                          <RefreshCw size={14} className="shrink-0" />
                        )}
                        إعادة تصحيح المعتمدة (سابقة)
                      </button>
                      <button
                        type="button"
                        onClick={() => printExamAnswerKeySheet(exam)}
                        title="طباعة نموذج الإجابات الصحيحة للمراقب/المصحّح"
                        className="w-full py-2.5 rounded-xl border-2 border-dashed border-purple-200/90 bg-purple-50/60 text-purple-900 hover:bg-purple-100/80 transition-all flex items-center justify-center gap-2 font-black text-[9px]"
                      >
                        <KeyRound size={14} className="shrink-0 text-purple-600" />
                        نموذج الإجابات الصحيحة
                      </button>
                      <button
                        type="button"
                        onClick={() => printExamStickers(exam)}
                        title="طباعة ملصقات مادة وصف للصقها على أوراق مطبوعة سابقاً دون هذه البيانات"
                        className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/90 text-slate-600 hover:border-amber-300 hover:bg-amber-50/90 hover:text-amber-950 transition-all flex items-center justify-center gap-2 font-black text-[9px]"
                      >
                        <Tag size={14} className="shrink-0 text-amber-700/90" />
                        ملصق مادة وصف (أوراق قديمة)
                      </button>
                      <button
                        type="button"
                        onClick={() => printExamCoverSheet(exam)}
                        title="ورقة A4 للمادة واسم الفصل — ضعها مع حزمة الأوراق"
                        className="w-full py-2.5 rounded-xl border-2 border-dashed border-indigo-200/90 bg-indigo-50/50 text-indigo-900 hover:bg-indigo-100/80 transition-all flex items-center justify-center gap-2 font-black text-[9px]"
                      >
                        <ScrollText size={14} className="shrink-0 text-indigo-600" />
                        ورقة تعريف (مادة + فصل)
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-10">
              {archivedFolderGroups.map(({ folder, label, exams: folderExams }) => (
                <div key={folder || '__none__'} className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-l from-amber-50 to-white border border-amber-100 rounded-2xl px-5 py-4 shadow-sm">
                    <button
                      type="button"
                      onClick={() => toggleArchiveFolderSection(folder)}
                      className="flex items-center gap-3 text-right font-black text-slate-800 min-w-0"
                    >
                      {isArchiveFolderSectionOpen(folder) ? <ChevronDown size={22} className="text-amber-700 shrink-0" /> : <ChevronRight size={22} className="text-amber-700 shrink-0" />}
                      <Folder size={22} className="text-amber-600 shrink-0" />
                      <span className="truncate">{label}</span>
                      <span className="text-xs font-black text-amber-700/80 bg-amber-100/80 px-2 py-0.5 rounded-lg shrink-0">{folderExams.length}</span>
                    </button>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => handleRenameArchiveFolderGroup(folder)}
                        className="px-4 py-2 rounded-xl bg-white border border-amber-200 text-amber-900 text-xs font-black hover:bg-amber-50 transition-all"
                      >
                        إعادة تسمية المجلد
                      </button>
                    </div>
                  </div>
                  {isArchiveFolderSectionOpen(folder) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                      {folderExams.map(exam => (
                        <div key={exam.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => toggleExamSelection(exam.id)}
                            className={`absolute top-4 left-4 z-20 w-9 h-9 rounded-xl flex items-center justify-center border-2 transition-all shadow-sm ${
                              selectedExamIds.has(exam.id)
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'
                            }`}
                            title={selectedExamIds.has(exam.id) ? 'إلغاء التحديد' : 'تحديد للطباعة المتعددة'}
                          >
                            {selectedExamIds.has(exam.id) ? <Check size={18} strokeWidth={3} /> : <Square size={16} />}
                          </button>
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2rem] blur-2xl opacity-0 group-hover:opacity-10 transition-opacity duration-500"></div>
                          <div className="luxury-card h-full bg-white border-2 border-amber-100/80 opacity-95 rounded-[2rem] shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden flex flex-col relative z-10 text-right">
                            <div className="p-6 pb-4">
                              <div className="flex justify-between items-start mb-6">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 group-hover:rotate-12 transition-all duration-500 ${exam.template === 'nafs' ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-purple-600 text-white shadow-purple-100'}`}>
                                  {getSubjectIcon(exam.subject, 24)}
                                </div>
                                <div className="flex gap-1.5">
                                  <button type="button" onClick={() => handleRestoreExam(exam)} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 transition-all active:scale-90" title="استعادة">
                                    <ArchiveRestore size={18} strokeWidth={2.25} />
                                  </button>
                                  <button type="button" onClick={() => handlePermanentDelete(exam)} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-all active:scale-90" title="حذف الاختبار">
                                    <Trash2 size={18} strokeWidth={2.25} />
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2 mb-4">
                                <div className="flex flex-wrap gap-1.5 mb-2 justify-end items-center">
                                  <span className="px-3 py-1 rounded-lg bg-amber-50 text-amber-800 text-[9px] font-black uppercase tracking-widest">أرشيف</span>
                                  <span className="px-3 py-1 rounded-lg bg-slate-50 text-slate-500 text-[9px] font-black uppercase tracking-widest">{exam.stage}</span>
                                  <span className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest">{exam.grade}</span>
                                  {exam.date && (
                                    <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black flex items-center gap-1">
                                      <Calendar size={10} /> {new Date(exam.date).toLocaleDateString('ar-SA')}
                                    </span>
                                  )}
                                </div>
                                <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight line-clamp-2">{exam.title}</h3>
                              </div>
                            </div>
                            <div className="p-5 pt-0 flex flex-col gap-2.5 mt-auto">
                              <label className="text-[9px] font-black text-slate-400 text-right tracking-wide">نقل إلى مجلد</label>
                              <div className="flex gap-2">
                                <select
                                  className="flex-1 min-w-0 py-2.5 px-3 rounded-xl border border-slate-200 text-right font-bold text-xs bg-white outline-none focus:ring-2 focus:ring-amber-100"
                                  value={normalizeArchiveFolder(exam.archiveFolder)}
                                  onChange={(ev) => handleMoveArchivedExamFolder(exam, ev.target.value)}
                                >
                                  <option value="">بدون مجلد</option>
                                  {existingArchiveFolders.map((f) => (
                                    <option key={f} value={f}>{f}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  title="مجلد جديد"
                                  onClick={async () => {
                                    const n = window.prompt('اسم المجلد الجديد:');
                                    if (n == null) return;
                                    await handleMoveArchivedExamFolder(exam, n);
                                  }}
                                  className="shrink-0 px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 font-black text-[10px] hover:bg-amber-100 transition-all"
                                >
                                  +
                                </button>
                              </div>
                              <button type="button" onClick={() => handleRestoreExam(exam)} className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-black text-[9px] hover:bg-emerald-700 transition-all flex flex-col items-center justify-center gap-1.5 shadow-lg shadow-emerald-100"><ArchiveRestore size={16} /> استعادة للنشطة</button>
                              <button
                                type="button"
                                onClick={() => printExamAnswerKeySheet(exam)}
                                title="طباعة نموذج الإجابات الصحيحة"
                                className="w-full py-2.5 rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/60 text-purple-900 hover:bg-purple-100/90 transition-all flex items-center justify-center gap-2 font-black text-[9px]"
                              >
                                <KeyRound size={14} className="shrink-0 text-purple-600" />
                                نموذج الإجابات الصحيحة
                              </button>
                              <button
                                type="button"
                                onClick={() => printExamStickers(exam)}
                                title="طباعة ملصقات مادة وصف للأوراق المطبوعة سابقاً"
                                className="w-full py-2.5 rounded-xl border-2 border-dashed border-amber-200/80 bg-amber-50/60 text-amber-950 hover:bg-amber-100/90 transition-all flex items-center justify-center gap-2 font-black text-[9px]"
                              >
                                <Tag size={14} className="shrink-0" />
                                ملصق مادة وصف
                              </button>
                              <button
                                type="button"
                                onClick={() => printExamCoverSheet(exam)}
                                title="ورقة تعريف بالمادة واسم الفصل"
                                className="w-full py-2.5 rounded-xl border-2 border-dashed border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 font-black text-[9px]"
                              >
                                <ScrollText size={14} className="shrink-0 text-indigo-600" />
                                ورقة تعريف (مادة + فصل)
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {archiveTargetModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-8 space-y-6 text-right border border-slate-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 font-header">أرشفة الاختبار</h3>
                    <p className="text-sm font-bold text-slate-500 mt-2 line-clamp-2">{archiveTargetModal.title}</p>
                  </div>
                  <button type="button" onClick={closeArchiveFolderModal} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-rose-500 shrink-0"><X size={22} /></button>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">مجلد داخل الأرشيف (اختياري)</label>
                  <input
                    type="text"
                    list="omr-archive-folder-suggestions"
                    value={archiveTargetFolderInput}
                    onChange={(e) => setArchiveTargetFolderInput(e.target.value)}
                    placeholder="مثال: نافس 2026 — الفصل الأول"
                    className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-100 focus:border-amber-200 focus:ring-4 focus:ring-amber-50 font-bold text-slate-800 text-right outline-none transition-all"
                  />
                  <datalist id="omr-archive-folder-suggestions">
                    {existingArchiveFolders.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                  <p className="text-xs font-bold text-slate-400 leading-relaxed">اتركه فارغاً لوضع الاختبار في «بدون مجلد»، أو اكتب اسماً جديداً لإنشاء مجلد.</p>
                </div>
                <div className="flex gap-3 justify-end flex-wrap-reverse">
                  <button type="button" onClick={closeArchiveFolderModal} className="px-6 py-3 rounded-xl font-black text-sm text-slate-500 hover:bg-slate-50 transition-all">إلغاء</button>
                  <button type="button" onClick={confirmArchiveToFolder} className="px-6 py-3 rounded-xl font-black text-sm bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-100 transition-all">تأكيد الأرشفة</button>
                </div>
              </div>
            </div>
          )}

          {showMultiPrintModal && (
            <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
              <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] border-none overflow-hidden">
                <div className="p-8 pb-6 flex justify-between items-center shrink-0 border-b border-slate-50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-violet-50 rounded-2xl flex items-center justify-center text-violet-600">
                      <FileStack size={24} />
                    </div>
                    <div className="text-right">
                      <h3 className="text-xl font-black text-slate-900 font-header">طباعة عدة اختبارات</h3>
                      <p className="text-xs font-bold text-slate-400 mt-1">
                        {selectedExamsForMultiPrint.length} اختبار
                        {multiPrintMode === 'committee'
                          ? ` — ${multiPrintEstimatedFiles} ملف (لجنة لكل اختبار)`
                          : ` — ${multiPrintEstimatedFiles} ملف (اختبار لكل ملف)`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => !isGenerating && setShowMultiPrintModal(false)}
                    className="p-3 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-xl"
                  >
                    <X size={22} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                      طريقة التقسيم
                    </label>
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100 w-full sm:w-auto">
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setMultiPrintMode('exam')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black transition-all ${
                          multiPrintMode === 'exam'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-400 hover:bg-white'
                        }`}
                      >
                        ملف لكل اختبار
                      </button>
                      <button
                        type="button"
                        disabled={isGenerating}
                        onClick={() => setMultiPrintMode('committee')}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                          multiPrintMode === 'committee'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-400 hover:bg-white'
                        }`}
                      >
                        <Layers size={13} />
                        ملف لكل لجنة
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">
                      القالب المستخدم (لجميع الاختبارات)
                    </label>
                    <select
                      value={multiPrintTemplate}
                      onChange={(e) => setMultiPrintTemplate(e.target.value)}
                      disabled={isGenerating}
                      className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50 font-black text-slate-700 text-right"
                    >
                      {templateOptionsByStage(
                        selectedExamsForMultiPrint[0]?.stage,
                        customTemplates
                      ).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] font-bold text-slate-400 leading-relaxed px-1">
                      {multiPrintMode === 'committee'
                        ? 'لكل اختبار محدّد: ملف PDF منفصل لكل لجنة، مع رقم اللجنة ورقم الجلوس على الورقة. التاريخ والصف والمادة من بيانات كل اختبار.'
                        : 'يُطبَع تلقائياً كل طلاب الصف/المرحلة المطابقين لكل اختبار في ملف واحد. التاريخ والصف والمادة من بيانات كل اختبار.'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 max-h-64 overflow-y-auto custom-scrollbar">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">الاختبارات المحددة</p>
                    <ul className="space-y-2">
                      {selectedExamsForMultiPrint.map((ex) => {
                        const timing = resolveExamPrintTiming(ex, dateType);
                        const commCount = resolveExamCommittees(ex).length;
                        return (
                          <li
                            key={ex.id}
                            className="flex items-center justify-between gap-3 text-right bg-white rounded-xl px-4 py-3 border border-slate-100"
                          >
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className="text-[10px] font-bold text-slate-400">
                                {multiPrintMode === 'committee'
                                  ? `${commCount} لجنة`
                                  : `${studentsMatchingExam(ex, students).filter((s) => getStudentQRNationalId(s)).length} طالب`}
                              </span>
                              <span className={`text-[10px] font-black ${timing.hasDate ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {timing.label}
                              </span>
                            </div>
                            <span className="font-black text-sm text-slate-800 truncate">{ex.title || ex.subject}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {isGenerating && (
                    <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-2">
                      <p className="text-sm font-black text-indigo-900 text-right">
                        اختبار {multiPrintProgress.examIndex} / {multiPrintProgress.examTotal}
                        {multiPrintProgress.examTitle ? ` — ${multiPrintProgress.examTitle}` : ''}
                      </p>
                      {multiPrintMode === 'committee' && committeeBulkProgress.committeeTotal > 0 && (
                        <p className="text-xs font-black text-violet-700 text-right">
                          لجنة {committeeBulkProgress.committeeIndex} / {committeeBulkProgress.committeeTotal}
                          {committeeBulkProgress.committeeLabel
                            ? ` — ${committeeBulkProgress.committeeLabel}`
                            : ''}
                        </p>
                      )}
                      {multiPrintProgress.total > 0 && (
                        <p className="text-xs font-bold text-indigo-600 text-right">
                          {multiPrintProgress.done} / {multiPrintProgress.total} ورقة
                          {multiPrintProgress.currentName ? ` — ${multiPrintProgress.currentName}` : ''}
                        </p>
                      )}
                    </div>
                  )}

                  {printTotalTime !== null && !isGenerating && (
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-emerald-800 font-black text-sm text-right">
                      اكتمل التنزيل — {fmtTime(printTotalTime)}
                    </div>
                  )}
                </div>

                <div className="p-6 border-t border-slate-50 bg-slate-50/50 flex gap-3">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setShowMultiPrintModal(false)}
                    className="px-8 py-4 bg-white text-slate-500 rounded-2xl font-black border border-slate-100 disabled:opacity-50"
                  >
                    إغلاق
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating || selectedExamsForMultiPrint.length === 0}
                    onClick={handleMultiExamPrint}
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Printer size={20} />}
                    {isGenerating ? 'جاري التوليد...' : `تنزيل ${multiPrintEstimatedFiles} ملف PDF`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showBulkModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
              <div className="bg-white w-full max-w-5xl rounded-[3rem] shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 border-none overflow-hidden relative">
                <div className="p-10 pb-8 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100"><Printer size={28} /></div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 font-header leading-tight text-right">طباعة بيانات الطلاب</h3>
                      <p className="text-slate-400 text-xs mt-1 font-bold italic truncate max-w-xs">{selectedBulkExam?.title}</p>
                    </div>
                  </div>
                  <button onClick={() => setShowBulkModal(false)} className="p-4 bg-slate-50 text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-2.5xl transition-all shadow-sm"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-10 pt-0 space-y-8 custom-scrollbar">
                   <div className="luxury-card p-8 bg-slate-50 border-none shadow-sm flex flex-col gap-8">
                      <div className="flex flex-col md:flex-row gap-8 items-center w-full">
                      <div className="flex-1 w-full space-y-3">
                         <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">القالب المستخدم</label>
                         <div className="flex items-center gap-4">
                            <select value={selectedTemplate} onChange={e => handleTemplateSelectChange(e.target.value)} className="flex-1 px-8 py-5 bg-white border-none rounded-[2rem] outline-none focus:ring-4 focus:ring-indigo-100 transition-all font-black text-slate-700 text-right shadow-sm">
                              {templateOptionsByStage(selectedBulkExam?.stage, customTemplates).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            {isTemplateCustom(selectedTemplate) && (
                              <button onClick={openCustomEditorForCurrentTemplate} className="p-5 bg-white text-indigo-600 border border-indigo-100 rounded-[2rem] hover:bg-indigo-50 transition-all shadow-sm"><Edit2 size={24} /></button>
                            )}
                         </div>
                      </div>
                      
                      <div className="flex-1 w-full space-y-3">
                         <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">فلترة حسب الصف / الفصل (اختياري)</label>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <select value={modalGrade} onChange={e => { setModalGrade(e.target.value); setSelectedClass('All'); }} className="w-full px-8 py-5 bg-white border-none rounded-[2rem] outline-none focus:ring-4 focus:ring-indigo-50 transition-all font-black text-slate-700 text-right shadow-sm">
                              <option value="All">كل الصفوف</option>
                              {modalGrades.map(g => (
                                 <option key={g} value={g}>{g}</option>
                              ))}
                           </select>
                           <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="w-full px-8 py-5 bg-white border-none rounded-[2rem] outline-none focus:ring-4 focus:ring-indigo-50 transition-all font-black text-slate-700 text-right shadow-sm">
                              <option value="All">كل الفصول</option>
                              {[...new Set(stageStudents
                                .filter(s => modalGrade === 'All' ? true : (isLevelMatch(s.grade, modalGrade) || isLevelMatch(s.classroom, modalGrade) || isLevelMatch(s.stage, modalGrade)))
                                .map(s => s.classroom || s.class)
                                .filter(Boolean))].map(room => (
                                 <option key={room} value={room}>فصل: {room}</option>
                              ))}
                           </select>
                         </div>
                      </div>
                      </div>

                      <div className="w-full space-y-4 pt-2 border-t border-slate-200/90">
                        <div>
                          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">حقول الرأس على الورقة المطبوعة</p>
                          <p className="text-xs font-bold text-slate-400 mt-2 px-1 leading-relaxed">حدّد النص الذي يظهر في «الصف» و«المادة» على كل ورقة. اتركه فارغاً لاستخدام بيانات كل طالب ومادة الاختبار.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">الصف (على الورقة)</label>
                            <input
                              type="text"
                              dir="rtl"
                              value={printHeaderClass}
                              onChange={(e) => setPrintHeaderClass(e.target.value)}
                              placeholder="مثلاً: الثاني المتوسط — أو اتركه لبيانات الطالب"
                              className="w-full px-6 py-4 bg-white border-2 border-transparent rounded-[1.75rem] outline-none focus:border-indigo-100 focus:ring-4 focus:ring-indigo-50 font-bold text-slate-800 text-right shadow-sm transition-all text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">اسم المادة (على الورقة)</label>
                            <input
                              type="text"
                              dir="rtl"
                              value={printHeaderSubject}
                              onChange={(e) => setPrintHeaderSubject(e.target.value)}
                              placeholder="يُحمّل من الاختبار — يمكنك تعديله هنا للطباعة"
                              className="w-full px-6 py-4 bg-white border-2 border-transparent rounded-[1.75rem] outline-none focus:border-indigo-100 focus:ring-4 focus:ring-indigo-50 font-bold text-slate-800 text-right shadow-sm transition-all text-sm"
                            />
                          </div>
                        </div>
                      </div>
                   </div>

                   {/* ── Exam Timing (Date/Day) ── */}
                   <div className="luxury-card p-8 bg-slate-50 border-none shadow-sm space-y-6">
                      <div className="flex items-center justify-between px-1">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm transition-all hover:scale-110 active:scale-90"><Calendar size={20} /></div>
                            <h4 className="font-black text-slate-800 text-sm">توقيت الاختبار</h4>
                         </div>
                         <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-100">
                            <button onClick={() => handleDateTypeChange('gregorian')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${dateType === 'gregorian' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105' : 'text-slate-400 hover:bg-slate-50'}`}>ميلادي</button>
                            <button onClick={() => handleDateTypeChange('hijri')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${dateType === 'hijri' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105' : 'text-slate-400 hover:bg-slate-50'}`}>هجري</button>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">تاريخ الاختبار</label>
                            <div className="relative group">
                               <input 
                                 type="date" 
                                 value={dateInputValue} 
                                 onChange={(e) => handleDateChange(e.target.value)}
                                 className="w-full px-6 py-4 bg-white border-2 border-transparent rounded-[2rem] outline-none focus:border-indigo-100 focus:ring-8 focus:ring-indigo-50 font-black text-slate-700 text-right shadow-sm transition-all" 
                               />
                            </div>
                         </div>
                         <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">يوم الاختبار</label>
                            <div className="relative group">
                               <input 
                                 type="text" 
                                 value={examDay} 
                                 onChange={(e) => setExamDay(e.target.value)}
                                 placeholder="مثلاً: الأحد"
                                 className="w-full px-6 py-4 bg-white border-2 border-transparent rounded-[2rem] outline-none focus:border-indigo-100 focus:ring-8 focus:ring-indigo-50 font-black text-slate-700 text-right shadow-sm transition-all" 
                               />
                            </div>
                         </div>
                      </div>
                   </div>

                   <div className="luxury-card p-6 md:p-8 bg-gradient-to-l from-indigo-50/90 to-white border border-indigo-100/80 shadow-sm">
                     <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                       <label className="flex items-start gap-3 cursor-pointer text-right flex-1 min-w-0">
                         <input
                           type="checkbox"
                           checked={printCoverWithBulk}
                           onChange={(e) => setPrintCoverWithBulk(e.target.checked)}
                           className="mt-1 w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                         />
                         <span>
                           <span className="font-black text-slate-800 text-sm block">طباعة ورقة تعريف بعد تنزيل ملف الأوراق</span>
                           <span className="text-[11px] font-bold text-slate-500 leading-relaxed mt-1 block">
                             ورقة A4 فيها المادة واسم الفصل (من بيانات الاختبار، أو من فلتر «فصل» أعلاه). تُفتح الطباعة تلقائياً بعد اكتمال التحميل.
                           </span>
                         </span>
                       </label>
                       <button
                         type="button"
                         onClick={() =>
                           selectedBulkExam &&
                           printExamCoverSheet(selectedBulkExam, {
                             selectedClassroom: selectedClass,
                             examDateLine: `${examDay} — ${examDate}`,
                             subjectOverride: (printHeaderSubject || '').trim() || undefined,
                             gradeLabelOverride: (printHeaderClass || '').trim() || undefined,
                           })
                         }
                         className="shrink-0 px-5 py-3.5 rounded-2xl border-2 border-indigo-200 bg-white text-indigo-700 font-black text-[10px] hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                       >
                         <ScrollText size={17} />
                         طباعة ورقة التعريف الآن (منفصلة)
                       </button>
                     </div>
                   </div>

                   <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-2">
                        <h4 className="text-xl font-black text-slate-800">من تُطبَع الأوراق؟</h4>
                        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-100 w-full sm:w-auto">
                          <button
                            type="button"
                            onClick={() => switchBulkPrintMode('students')}
                            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-xs font-black transition-all ${
                              bulkPrintMode === 'students'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                : 'text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            حسب الطلاب
                          </button>
                          <button
                            type="button"
                            onClick={() => switchBulkPrintMode('committees')}
                            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${
                              bulkPrintMode === 'committees'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                : 'text-slate-400 hover:bg-slate-50'
                            }`}
                          >
                            <Layers size={14} />
                            حسب اللجنة
                          </button>
                        </div>
                      </div>

                      {bulkPrintMode === 'committees' ? (
                        <div className="space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-2">
                            <div className="text-right">
                              <h4 className="text-lg font-black text-slate-800">
                                اختيار اللجان ({selectedCommitteeIds.size})
                              </h4>
                              <p className="text-xs font-bold text-slate-400 mt-1 leading-relaxed">
                                يُنزَّل ملف PDF منفصل لكل لجنة مع رقم اللجنة ورقم الجلوس على الورقة.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={toggleAllCommittees}
                              disabled={examCommittees.length === 0}
                              className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-200 transition-all w-full sm:w-auto disabled:opacity-40"
                            >
                              {allCommitteesSel ? 'إلغاء الكل' : 'تحديد كل اللجان'}
                            </button>
                          </div>
                          {examCommittees.length === 0 ? (
                            <div className="p-8 bg-amber-50 border border-amber-100 rounded-2xl text-right">
                              <p className="font-black text-amber-800 text-sm">لا توجد لجان مطابقة لهذا الاختبار.</p>
                              <p className="text-xs font-bold text-amber-600 mt-2 leading-relaxed">
                                تأكد من توزيع الطلاب على اللجان وأرقام الهوية في سجل الطلاب.
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {examCommittees.map((c) => (
                                <div
                                  key={c.id}
                                  onClick={() => toggleCommittee(c.id)}
                                  className={`p-6 rounded-[2.5rem] border-2 cursor-pointer transition-all flex items-center justify-between group ${
                                    selectedCommitteeIds.has(c.id)
                                      ? 'bg-indigo-50 border-indigo-300 shadow-lg scale-[1.02]'
                                      : 'bg-white border-slate-50 hover:border-slate-100'
                                  }`}
                                >
                                  <div className="text-right min-w-0">
                                    <span className="font-black text-slate-800 group-hover:text-indigo-700 transition-colors block">
                                      لجنة {committeeNumberOnly(c)}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold block mt-1 truncate">
                                      {committeeLabelWithStage(c)}
                                    </span>
                                    <span className="text-[10px] text-indigo-500 font-black block mt-1">
                                      {committeePrintableCount(c)} طالب
                                    </span>
                                  </div>
                                  <div
                                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                                      selectedCommitteeIds.has(c.id)
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-50 text-slate-200'
                                    }`}
                                  >
                                    {selectedCommitteeIds.has(c.id) ? (
                                      <Check size={20} strokeWidth={4} />
                                    ) : (
                                      <div className="w-2 h-2 rounded-full bg-slate-200" />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                      <>
                      <div className="flex flex-col gap-4 px-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <h4 className="text-xl font-black text-slate-800">اختيار الطلاب ({selectedStudentIds.size})</h4>
                          <button type="button" onClick={toggleAll} className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-200 transition-all w-full sm:w-auto">{allFilteredSel ? 'إلغاء الكل' : 'تحديد الكل'}</button>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-end">
                          {[
                            { id: 'all', label: 'الكل' },
                            { id: 'school', label: 'طلاب المدرسة' },
                            { id: 'guest', label: 'طلاب زوار' },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setStudentGroupFilter(opt.id);
                                // لضمان ظهور الزوار حتى لو كان فلتر الفصل مضبوطاً على فصل معيّن
                                if (opt.id === 'guest') setSelectedClass('All');
                              }}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                                studentGroupFilter === opt.id
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100'
                                  : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <div className="relative group">
                          <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={20} />
                          <input
                            type="text"
                            dir="rtl"
                            placeholder="ابحث باسم الطالب أو رقم الجلوس أو الهوية..."
                            value={studentSearch}
                            onChange={(e) => setStudentSearch(e.target.value)}
                            className="w-full pr-12 pl-4 py-4 bg-white border-2 border-slate-100 rounded-2xl font-bold text-sm text-slate-800 text-right outline-none focus:border-indigo-200 focus:ring-4 focus:ring-indigo-50/80 transition-all shadow-sm"
                          />
                        </div>
                        {studentSearch.trim() ? (
                          <p className="text-xs font-bold text-slate-400 text-right">
                            نتائج البحث: {filteredModalStudents.length} طالب
                          </p>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredModalStudents.map(s => (
                          <div key={s.id} onClick={() => toggleStudent(s.id)} className={`p-6 rounded-[2.5rem] border-2 cursor-pointer transition-all flex items-center justify-between group ${selectedStudentIds.has(s.id) ? 'bg-indigo-50 border-indigo-300 shadow-lg scale-[1.02]' : 'bg-white border-slate-50 hover:border-slate-100'}`}>
                             <div className="text-right"><span className="font-black text-slate-800 group-hover:text-indigo-700 transition-colors block">{s.name}</span><span className="text-[10px] text-slate-400 font-bold block mt-1">{s.id}</span></div>
                             <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${selectedStudentIds.has(s.id) ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-200'}`}>{selectedStudentIds.has(s.id) ? <Check size={20} strokeWidth={4} /> : <div className="w-2 h-2 rounded-full bg-slate-200" />}</div>
                          </div>
                        ))}
                      </div>
                      </>
                      )}
                   </div>
                </div>
                 <div className="p-8 border-t border-slate-50 bg-slate-50/50 flex flex-col gap-4">
                    {/* â”€â”€ Success banner after print â”€â”€ */}
                    {printTotalTime !== null && !isGenerating && (
                      <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in fade-in duration-500">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-100">
                            <CheckCircle2 size={20} strokeWidth={2.5} />
                          </div>
                          <div>
                            <p className="font-black text-emerald-700 text-sm">{'\u062a\u0645\u062a \u0627\u0644\u0637\u0628\u0627\u0639\u0629 \u0628\u0646\u062c\u0627\u062d \u2714'}</p>
                            <p className="text-[10px] text-emerald-500 font-bold">
                              {bulkPrintMode === 'committees'
                                ? `${committeeBulkProgress.committeeTotal || selectedCommitteeIds.size} \u0644\u062c\u0646\u0629`
                                : `${printProgress.total || selectedStudentIds.size} \u0648\u0631\u0642\u0629`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-emerald-500 font-bold">{'\u0627\u0633\u062a\u063a\u0631\u0642 \u0627\u0644\u062a\u0648\u0644\u064a\u062f'}</p>
                          <p className="font-black text-emerald-700 text-xl tabular-nums">{fmtTime(printTotalTime)}</p>
                        </div>
                      </div>
                    )}
                    {isGenerating ? (
                      <div className="flex flex-col gap-4 w-full animate-in fade-in duration-300">
                        {bulkPrintMode === 'committees' && committeeBulkProgress.committeeTotal > 0 && (
                          <p className="text-sm font-black text-indigo-900 text-right px-1">
                            لجنة {committeeBulkProgress.committeeIndex} / {committeeBulkProgress.committeeTotal}
                            {committeeBulkProgress.committeeLabel
                              ? ` — ${committeeBulkProgress.committeeLabel}`
                              : ''}
                          </p>
                        )}
                        {/* Top row: spinner + label + timer */}
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                              <Loader2 size={18} className="animate-spin text-indigo-600" />
                            </div>
                            <span className="font-black text-slate-700 text-sm">{'\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u0648\u0644\u064a\u062f...'}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            {/* Live stopwatch */}
                            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl">
                              <Clock size={13} className="text-slate-400" />
                              <span className="text-xs font-black text-slate-600 tabular-nums">{fmtTime(printElapsed)}</span>
                            </div>
                            {/* Percentage */}
                            <span className="text-2xl font-black text-indigo-600 tabular-nums">
                              {printProgress.total > 0 ? `${Math.round((printProgress.done / printProgress.total) * 100)}\u066a` : '0\u066a'}
                            </span>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                          <div
                            className="absolute inset-y-0 right-0 bg-gradient-to-l from-indigo-500 via-violet-500 to-indigo-400 rounded-full transition-all duration-500 ease-out"
                            style={{ width: printProgress.total > 0 ? `${(printProgress.done / printProgress.total) * 100}%` : '0%' }}
                          >
                            <div className="absolute inset-0 bg-white/30 animate-pulse rounded-full" />
                          </div>
                        </div>
                        {/* Bottom row: current student + count */}
                        <div className="flex items-center justify-between px-1">
                          <p className="text-[11px] text-slate-400 font-bold truncate max-w-[60%] text-right" dir="rtl">
                            {printProgress.currentName ? `\u23f3 ${printProgress.currentName}` : '\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u0647\u064a\u0626\u0629...'}
                          </p>
                          <span className="text-xs font-black text-slate-500 tabular-nums">
                            {printProgress.done} / {printProgress.total} {'\u0648\u0631\u0642\u0629'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-4">
                        <button onClick={() => setShowBulkModal(false)} className="px-10 py-5 bg-white text-slate-400 rounded-2xl font-black hover:bg-slate-50 transition-all border border-slate-100">{'\u0625\u0644\u063a\u0627\u0621'}</button>
                        {bulkPrintMode === 'committees' ? (
                          <button
                            onClick={handleCommitteeBulkPrint}
                            disabled={selectedCommitteeIds.size === 0}
                            className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Printer size={22} /> {'\u062a\u0646\u0632\u064a\u0644'} ({selectedCommitteeIds.size} {'\u0644\u062c\u0646\u0629'})
                          </button>
                        ) : (
                        <button onClick={handleBulkPrint} disabled={selectedStudentIds.size === 0} className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed">
                          <Printer size={22} /> {'\u0628\u062f\u0621 \u0627\u0644\u0637\u0628\u0627\u0639\u0629'} ({selectedStudentIds.size})
                        </button>
                        )}
                      </div>
                    )}
                 </div>
               </div>
            </div>
          )}

          {isAdding && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
              <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl animate-in zoom-in-95 overflow-hidden border-none flex flex-col relative">
                <div className="p-10 pb-6 flex justify-between items-center bg-indigo-600 text-white">
                   <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/30 shadow-xl"><Plus size={28} /></div>
                      <div>
                         <h3 className="text-2xl font-black font-header tracking-tight">{newExam.id ? 'تحرير الاختبار' : 'اختبار جديد'}</h3>
                         <p className="text-indigo-100 text-xs font-bold mt-1">إدخال البيانات الأساسية للاختبار</p>
                      </div>
                   </div>
                   <button onClick={() => setIsAdding(false)} className="p-3 bg-white/20 text-white hover:bg-white/40 rounded-2xl transition-all"><X size={20} /></button>
                </div>
                <div className="p-10 space-y-6">
                    <div className="space-y-6">
                      <div className="space-y-3">
                         <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">اسم الاختبار</label>
                         <input 
                            type="text" 
                            value={newExam.title} 
                            onChange={e => setNewExam({...newExam, title: e.target.value})} 
                            placeholder="سيتم التوليد تلقائياً إذا ترك فارغاً..."
                            className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-black text-slate-700 text-right shadow-sm"
                         />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-8">
                         <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">المرحلة الدراسية</label>
                            <select value={newExam.stage} onChange={e => setNewExam({...newExam, stage: e.target.value, grade: '', grades: [], subject: ''})} className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-black text-slate-700 text-right shadow-sm">
                              <option value="">اختر المرحلة...</option>
                              {Object.keys(STAGES).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                         </div>
                         <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">الصفوف الدراسية (يمكن اختيار أكثر من صف)</label>
                            <div className={`w-full px-6 py-5 bg-slate-50 border-none rounded-[2rem] ${!newExam.stage ? 'opacity-50 pointer-events-none' : ''}`}>
                              <div className="flex flex-wrap gap-2 justify-end">
                                {(STAGES[newExam.stage] || []).map(g => {
                                  const sel = (newExam.grades || []).includes(g);
                                  return (
                                    <button
                                      key={g}
                                      type="button"
                                      onClick={() => {
                                        const next = new Set(newExam.grades || []);
                                        if (next.has(g)) next.delete(g); else next.add(g);
                                        const arr = [...next];
                                        setNewExam({ ...newExam, grades: arr, grade: arr[0] || '', subject: '' });
                                      }}
                                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                                        sel ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                                      }`}
                                      title={sel ? 'إزالة' : 'إضافة'}
                                    >
                                      {g}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="mt-3 text-right">
                                <span className="text-[10px] font-black text-slate-400">
                                  المختار: {(newExam.grades || []).length ? (newExam.grades || []).join('، ') : '—'}
                                </span>
                              </div>
                            </div>
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                         <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">الفصل (Class / Room)</label>
                            <input 
                               type="text" 
                               value={newExam.classroom || ""} 
                               onChange={e => setNewExam({...newExam, classroom: e.target.value})} 
                               placeholder="مثلاً: أ أو 1/1"
                               className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-black text-slate-700 text-right shadow-sm"
                            />
                         </div>
                         <div className="space-y-3">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">تاريخ الاختبار</label>
                            <input 
                               type="date" 
                               value={newExam.date || ""} 
                               onChange={e => setNewExam({...newExam, date: e.target.value})} 
                               className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-black text-slate-700 text-right shadow-sm"
                            />
                         </div>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-3">
                           <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">المادة الدراسية</label>
                           <select value={newExam.subject} onChange={e => setNewExam({...newExam, subject: e.target.value})} className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-black text-slate-700 text-right shadow-sm" disabled={(newExam.grades || []).length === 0}>
                             <option value="">اختر المادة...</option>
                             {subjects.filter(s => s.grades.includes('All') || (newExam.grades || []).some(g => s.grades.includes(g))).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                           </select>
                        </div>
                        <div className="space-y-3">
                           <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">عدد الأسئلة</label>
                           <input 
                              type="number" 
                              min="1" 
                              max="100" 
                              value={newExam.qCount} 
                              onChange={e => setNewExam({...newExam, qCount: e.target.value})} 
                              className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-100 transition-all font-black text-slate-700 text-right shadow-sm"
                           />
                        </div>
                      </div>
                    </div>
                </div>
                <div className="p-10 pt-6 border-t border-slate-50 flex gap-4 bg-slate-50/50">
                   <button onClick={() => setIsAdding(false)} className="px-10 py-4 bg-white text-slate-400 rounded-2xl font-black hover:bg-slate-50 transition-all border border-slate-100 shadow-sm">إلغاء</button>
                   <button onClick={handleAddExam} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 shadow-xl active:scale-95 transition-all">حفظ وإضافة</button>
                </div>
              </div>
            </div>
          )}

          {editingExam && (
            <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
               <div className="bg-white w-full max-w-4xl rounded-[3.5rem] shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 overflow-hidden border-none text-right">
                  <div className="p-8 pb-6 flex justify-between items-center bg-purple-600 text-white shrink-0">
                    <div className="flex items-center gap-5"><div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20"><Edit2 size={28} /></div><div><h3 className="text-2xl font-black font-header tracking-tight">إعداد مفتاح الإجابات</h3><p className="text-purple-100 text-xs font-bold mt-1">{editingExam?.title}</p></div></div>
                    <button onClick={() => setEditingExam(null)} className="p-3 bg-white/20 text-white hover:bg-white/40 rounded-2xl transition-all"><X size={20} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-10 custom-scrollbar grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {Array.from({ length: editingExam.qCount || 30 }, (_, i) => i + 1).map(q => (
                       <div key={q} className="p-6 bg-slate-50 rounded-[2.5rem] space-y-4 border border-slate-100 hover:border-purple-200 transition-all shadow-sm">
                          <div className="flex justify-between items-center px-1">
                             <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">سؤال {q}</span>
                             <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black text-slate-400 uppercase">النقاط</span>
                                <input 
                                   type="text" 
                                   inputMode="decimal"
                                   placeholder="1"
                                   value={editingExam.weights?.[String(q)] || ""} 
                                   onChange={e => handleWeightChange(q, e.target.value)}
                                   className="w-14 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-center focus:ring-4 focus:ring-purple-100 focus:border-purple-400 outline-none transition-all shadow-sm"
                                />
                             </div>
                          </div>
                          <div className="flex justify-between items-center gap-2">
                            {['A', 'B', 'C', 'D'].map(opt => (
                               <button 
                                  key={opt} 
                                  onClick={() => handleKeyChange(q, opt)} 
                                  className={`flex-1 h-10 rounded-xl font-black text-xs transition-all border-2 ${editingExam.keys?.[String(q)] === opt ? 'bg-purple-600 border-purple-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-purple-200'}`}
                               >
                                  {opt}
                               </button>
                            ))}
                          </div>
                       </div>
                    ))}
                  </div>
                  <div className="p-8 border-t border-slate-50 flex gap-4 bg-slate-50/50">
                    <button onClick={resetWeights} className="px-6 py-4 bg-white text-indigo-600 rounded-2xl font-black border border-indigo-100 shadow-sm transition-all hover:bg-indigo-50 flex items-center gap-2">
                       <RefreshCw size={16} /> توحيد الدرجات (1)
                    </button>
                    <div className="flex-1"></div>
                    <button
                      type="button"
                      onClick={() => printExamAnswerKeySheet(editingExam)}
                      className="px-6 py-4 bg-purple-100 text-purple-800 rounded-2xl font-black border border-purple-200 shadow-sm transition-all hover:bg-purple-200 flex items-center gap-2"
                    >
                      <Printer size={16} /> طباعة النموذج
                    </button>
                    <button
                      type="button"
                      disabled={!editingExam || regradingExamId === editingExam.id}
                      onClick={() => handleRegradeApproved(editingExam)}
                      className="px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black hover:bg-emerald-700 shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      {regradingExamId === editingExam?.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                      إعادة تصحيح المعتمدة
                    </button>
                    <button onClick={() => setEditingExam(null)} className="px-8 py-4 bg-white text-slate-400 rounded-2xl font-black border border-slate-100 shadow-sm transition-all hover:bg-slate-50">تجاهل</button>
                    <button onClick={saveKeys} className="px-10 py-4 bg-purple-600 text-white rounded-2xl font-black hover:bg-purple-700 shadow-xl transition-all">حفظ مفتاح الإجابة</button>
                  </div>
               </div>
            </div>
          )}

          {showCustomEditor && (
            <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
               <div className="bg-white w-full max-w-3xl rounded-[3.5rem] shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 border-none text-right overflow-hidden">
                  <div className="p-10 pb-8 bg-indigo-600 text-white flex justify-between items-center"><div className="flex items-center gap-6"><div className="w-16 h-16 bg-white/20 rounded-2.5xl flex items-center justify-center backdrop-blur-sm border border-white/30"><Layout size={32} /></div><div><h3 className="text-3xl font-black font-header tracking-tight">تخصيص قالب الورقة</h3><p className="text-indigo-100 text-sm font-bold mt-1">تعديل النصوص والشعار والمظهر العام</p></div></div><button onClick={() => setShowCustomEditor(false)} className="p-4 bg-white/20 text-white hover:bg-white/40 rounded-2.5xl transition-all"><X size={24} /></button></div>
                  <div className="flex-1 overflow-y-auto p-12 custom-scrollbar space-y-8">
                     <div className="space-y-6"><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-2">شعار المدرسة</label><div className="flex items-center gap-8 bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100"><div className="w-32 h-32 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center overflow-hidden relative group">{customConfig.logoDataUrl ? <img src={customConfig.logoDataUrl} className="w-full h-full object-contain p-2" /> : <ImageIcon className="text-slate-200" size={48} />}<input type="file" onChange={e => handleCustomLogoChange(e.target.files[0])} className="absolute inset-0 opacity-0 cursor-pointer" /></div><div className="flex-1 space-y-4"><p className="text-sm font-bold text-slate-500">اضغط لرفع شعار بصيغة PNG أو JPG</p>{customConfig.logoDataUrl && <button onClick={() => setCustomConfig({...customConfig, logoDataUrl: ''})} className="text-rose-500 font-black text-xs hover:underline">إزالة الشعار</button>}</div></div></div>
                     <div className="grid grid-cols-1 gap-6">{[{ key: 'school_name', label: 'اسم المدرسة / الإدارة' }, { key: 'exam_name', label: 'عنوان الاختبار أو المجمع' }, { key: 'year', label: 'العام الدراسي والترم' }, { key: 'principal', label: 'اسم المدير أو المراقب' }, { key: 'footer', label: 'تذييل الورقة (Footer)' }].map(f => (<div key={f.key} className="space-y-3"><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-2">{f.label}</label><input type="text" value={customConfig[f.key]} onChange={e => setCustomConfig({...customConfig, [f.key]: e.target.value})} className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] font-black text-slate-700 text-right outline-none focus:bg-white transition-all shadow-sm" /></div>))}</div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 mt-6 border-t border-slate-100">
                       <div className="space-y-2 md:col-span-2 px-2">
                         <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest block">صف الطالب واسم المادة على ورقة الإجابة</label>
                         <p className="text-[11px] font-bold text-slate-400 leading-relaxed">يُطبَع النص المعروض في خانتي «الصف» و«المادة» أسفل اسم الطالب. يُحفظ مع هذا القالب ويُمكن تعديله عند كل طباعة من نافذة الطباعة.</p>
                       </div>
                       <div className="space-y-3"><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-2">الصف (في خانة الصف على الورقة)</label><input type="text" dir="rtl" placeholder="اختياري — فاضٍ للاعتماد على تقدير كل طالب" value={customConfig.header_class_text ?? ''} onChange={(e) => setCustomConfig({ ...customConfig, header_class_text: e.target.value })} className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] font-black text-slate-700 text-right outline-none focus:bg-white transition-all shadow-sm" /></div>
                       <div className="space-y-3"><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-2">اسم المادة (في خانة المادة على الورقة)</label><input type="text" dir="rtl" placeholder="اختياري — فاضٍ للاعتماد على اسم مادة الاختبار" value={customConfig.header_subject_text ?? ''} onChange={(e) => setCustomConfig({ ...customConfig, header_subject_text: e.target.value })} className="w-full px-8 py-5 bg-slate-50 border-none rounded-[2rem] font-black text-slate-700 text-right outline-none focus:bg-white transition-all shadow-sm" /></div>
                     </div>
                  </div>
                  <div className="p-10 border-t border-slate-50 bg-slate-50/50 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">اسم القالب (لحفظه في القائمة)</label>
                        <input
                          type="text"
                          value={customTemplateName}
                          onChange={e => setCustomTemplateName(e.target.value)}
                          placeholder="مثلاً: قالب الفصل الدراسي الأول..."
                          className="w-full px-6 py-4 bg-white border-2 border-slate-100 rounded-[1.5rem] font-black text-slate-700 text-right outline-none focus:border-indigo-200 focus:ring-4 focus:ring-indigo-50 transition-all shadow-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-6">
                      <button onClick={() => setShowCustomEditor(false)} className="px-10 py-5 bg-white text-slate-400 rounded-2.5xl font-black border border-slate-100 shadow-sm transition-all hover:bg-slate-50">تجاهل</button>
                      <button
                        onClick={handleApplyCustomEditor}
                        disabled={!customTemplateName.trim()}
                        className="flex-1 py-5 bg-indigo-600 text-white rounded-2.5xl font-black hover:bg-indigo-700 shadow-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {selectedCustomTemplateId ? 'تحديث القالب' : 'حفظ وتطبيق القالب'}
                      </button>
                    </div>
                  </div>
               </div>
            </div>
          )}
        </>
      ) : (
        /* ── Subjects Tab (Integrated Subject Manager) ── */
        <div className="luxury-card bg-white border-none shadow-2xl animate-in slide-in-from-right-8 duration-500 overflow-hidden flex flex-col relative min-h-[700px]">
          <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-l from-indigo-500 via-purple-500 to-indigo-500"></div>
          <div className="p-10 pb-6 flex justify-between items-center shrink-0">
             <div className="flex items-center gap-5">
               <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 shadow-sm border border-purple-100"><BookOpen size={28} /></div>
               <div>
                  <h3 className="text-3xl font-black text-slate-900 font-header leading-[1.1] tracking-tight text-right">إدارة المقررات</h3>
                  <p className="text-slate-400 text-xs mt-1 font-bold italic px-1 text-right">إضافة وتنسيق المواد وربطها بالصفوف</p>
               </div>
             </div>
          </div>
          <div className="p-10 pt-0 flex flex-col flex-1">
              <div className="p-8 bg-slate-50/50 rounded-[2.5rem] mb-10 border border-slate-100 shadow-inner">
                 <div className="relative group mb-6">
                    <input type="text" value={newSubjectInput} onChange={e => setNewSubjectInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSubject()} placeholder="أدخل اسم المادة الجديدة هنا..." className="w-full pr-10 pl-40 py-5 bg-white border-2 border-transparent rounded-[2rem] outline-none focus:border-purple-100 focus:ring-8 focus:ring-purple-50/50 font-black text-lg transition-all text-right shadow-sm" />
                    <button onClick={handleAddSubject} className="absolute left-3 top-1/2 -translate-y-1/2 px-8 py-3 bg-purple-600 text-white rounded-[1.5rem] font-black text-sm hover:bg-purple-700 transition-all shadow-xl active:scale-95">إضافة المادة</button>
                 </div>
                 <div className="space-y-5">
                    <div className="flex flex-wrap gap-2.5 px-2 justify-end">
                      <button onClick={() => setNewSubjectGrades(['All'])} className={`px-6 py-2.5 rounded-xl text-[10px] font-black transition-all border-2 ${newSubjectGrades.includes('All') ? 'bg-purple-600 text-white border-purple-600 shadow-xl' : 'bg-white text-slate-400 border-slate-100'}`}>جميع الصفوف</button>
                      {Object.values(STAGES).flat().map(grade => (
                        <button key={grade} onClick={() => {
                            if (newSubjectGrades.includes('All')) { setNewSubjectGrades([grade]); }
                            else {
                                if (newSubjectGrades.includes(grade)) {
                                    const next = newSubjectGrades.filter(g => g !== grade);
                                    setNewSubjectGrades(next.length === 0 ? ['All'] : next);
                                } else { setNewSubjectGrades([...newSubjectGrades, grade]); }
                            }
                        }} className={`px-4 py-2.5 rounded-xl text-[10px] font-black transition-all border-2 ${newSubjectGrades.includes(grade) ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200'}`}>{grade}</button>
                      ))}
                    </div>
                 </div>
              </div>
              <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar space-y-6 max-h-[500px]">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {subjects.map(sub => (
                       <div key={sub.id} className="flex flex-col p-6 bg-slate-50/50 border border-slate-100 rounded-[2.5rem] hover:bg-white hover:border-purple-200 transition-all duration-500 group relative text-right">
                          <div className="flex items-start justify-between mb-5">
                            <button onClick={() => handleDeleteSubject(sub.id)} className="p-2.5 text-slate-200 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
                            <div className="flex items-center gap-3">
                              <div className="text-right"><span className="font-black text-slate-800 text-lg block leading-none mb-1.5">{sub.name}</span><span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">{sub.grades.includes('All') ? 'كافة الصفوف' : `${sub.grades.length} صفوف`}</span></div>
                              <div className="w-12 h-12 bg-white rounded-2xl shadow-md flex items-center justify-center text-purple-500">{getSubjectIcon(sub.name, 24)}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 justify-end">
                             {sub.grades.includes('All') ? <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-500 text-[9px] font-black uppercase">عام</span> : sub.grades.map(g => <span key={g} className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-500 text-[9px] font-black">{g}</span>)}
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OMRExams;
