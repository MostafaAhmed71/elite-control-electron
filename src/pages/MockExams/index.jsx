import React, { useState, useEffect, useMemo } from 'react';
import { 
    Search, Trophy, Users as UsersIcon, CheckCircle2, 
    Filter, FileText, Download, Save, Loader2, AlertCircle, 
    BookOpen, ChevronDown, CheckSquare, Square, RefreshCcw,
    Zap, Star, Award, TrendingUp, UserCheck, ClipboardCheck,
    ArrowRightLeft, Eraser, Trash2
} from 'lucide-react';
import { 
    getStudents, getOmrResults, getOmrExams, 
    saveOmrResult, deleteOmrResult, getAppSettings 
} from '../../utils/dataService';
import { useToast } from '../../components/Toast';

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

  if (num !== null && stage) return `${num}${stage}`;
  return noSpace.toLowerCase();
};

const isLevelMatch = (v1, v2) => {
  if (!v1 || !v2) return false;
  if (v1 === 'All' || v2 === 'All' || v1 === 'الكل' || v2 === 'الكل') return true;
  return toGradeKey(v1) === toGradeKey(v2);
};

const STAGES = {
  'الابتدائي': ['الأول الابتدائي', 'الثاني الابتدائي', 'الثالث الابتدائي', 'الرابع الابتدائي', 'الخامس الابتدائي', 'السادس الابتدائي'],
  'المتوسط': ['الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط'],
  'الثانوي': ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي'],
};

const MockExams = () => {
    const toast = useToast();
    const [students, setStudents] = useState([]);
    const [exams, setExams] = useState([]);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    /* Filters */
    const [filterStage, setFilterStage] = useState('All');
    const [filterGrade, setFilterGrade] = useState('All');
    const [selectedExamId, setSelectedExamId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyEmpty, setShowOnlyEmpty] = useState(false);

    /* Local grade state */
    const [localGrades, setLocalGrades] = useState({}); // { studentId: score }
    const [modifiedIds, setModifiedIds] = useState(new Set());
    const [adoptDate, setAdoptDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        else setIsRefreshing(true);
        
        try {
            const [s, e, r] = await Promise.all([
                getStudents(),
                getOmrExams(),
                getOmrResults()
            ]);
            setStudents(s);
            setExams(e);
            setResults(r);

            // Refill local grades if an exam is selected
            if (selectedExamId) {
                const examResults = r.filter(res => res.examId === selectedExamId);
                const gradeMap = {};
                examResults.forEach(res => {
                    gradeMap[res.studentId] = res.score;
                });
                setLocalGrades(gradeMap);
                setModifiedIds(new Set());
            }
        } catch (err) {
            toast.error('فشل تحميل البيانات من قاعدة البيانات.', 'خطأ في التحميل');
            console.error('MockExams load error:', err);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    // Reload local grades when exam changes
    useEffect(() => {
        if (!selectedExamId) {
            setLocalGrades({});
            setModifiedIds(new Set());
            return;
        }
        const examResults = results.filter(res => res.examId === selectedExamId);
        const gradeMap = {};
        examResults.forEach(res => {
            gradeMap[res.studentId] = res.score;
        });
        setLocalGrades(gradeMap);
        setModifiedIds(new Set());
    }, [selectedExamId, results]);

    const selectedExam = useMemo(() => 
        exams.find(e => e.id === selectedExamId), 
    [exams, selectedExamId]);

    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            const sGrade = (s.grade || s.classroom || s.class || '').trim();
            const sStage = (s.stage || '').trim();

            if (filterStage !== 'All' && filterStage !== 'الكل') {
                if (!isLevelMatch(sStage, filterStage) && !isLevelMatch(sGrade, filterStage)) {
                     // Check if any grade in the stage matches
                     const stageGrades = STAGES[filterStage] || [];
                     const matchInStage = stageGrades.some(sg => isLevelMatch(sGrade, sg));
                     if (!matchInStage) return false;
                }
            }

            if (filterGrade !== 'All' && filterGrade !== 'الكل') {
                if (!isLevelMatch(sGrade, filterGrade)) return false;
            }

            // Also ensure student matches the EXAM's grade if one is selected
            if (selectedExam) {
                if (!isLevelMatch(sGrade, selectedExam.grade) && !isLevelMatch(sStage, selectedExam.grade)) {
                    // This is a strict filter to only show students belonging to the chosen exam's grade
                    return false;
                }
            }

            if (showOnlyEmpty && selectedExamId) {
                if (localGrades[s.id] !== undefined && localGrades[s.id] !== '') return false;
            }

            const matchSearch = !searchTerm || 
                s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                (s.id || '').includes(searchTerm);
            
            return matchSearch;
        }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }, [students, filterStage, filterGrade, searchTerm, showOnlyEmpty, localGrades, selectedExam, selectedExamId]);

    const handleGradeChange = (studentId, value) => {
        setLocalGrades(prev => ({
            ...prev,
            [studentId]: value
        }));
        setModifiedIds(prev => {
            const next = new Set(prev);
            next.add(studentId);
            return next;
        });
    };

    const handleSaveAndAdopt = async () => {
        if (!selectedExamId) {
            toast.error('يرجى اختيار اختبار أولاً.', 'تنبيه');
            return;
        }

        // Only save students who have a grade entered AND were modified in this session
        const studentsToSave = filteredStudents.filter(s => 
            modifiedIds.has(s.id) && 
            localGrades[s.id] !== undefined && 
            localGrades[s.id] !== ''
        );
        
        if (studentsToSave.length === 0) {
            toast.error('لا توجد تغييرات جديدة لحفظها.', 'تنبيه');
            return;
        }

        setIsSaving(true);
        try {
            const total = selectedExam.qCount || 30;
            
            // Execute in batches of 10 for better UI responsiveness if needed, 
            // but for manual entry, it's usually small count.
            const saves = studentsToSave.map(student => {
                const scoreValue = localGrades[student.id];
                const score = parseFloat(scoreValue);
                const percentage = ((score / total) * 100).toFixed(1);

                    const isoDate = new Date(adoptDate);
                    // Add current time bits to make it sortable by time if multiple are adopted same day
                    const now = new Date();
                    isoDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

                    return saveOmrResult({
                        id: `${selectedExamId}_${student.id}`,
                        studentId: student.id,
                        studentName: student.name,
                        studentGrade: student.grade || student.classroom,
                        examId: selectedExamId,
                        examTitle: selectedExam.title,
                        score: score,
                        total: total,
                        percentage: percentage,
                        approved: true,
                        timestamp: isoDate.toISOString(),
                        type: 'manual',
                        manualEntry: true
                    });
            });

            await Promise.all(saves);
            toast.success(`تم حفظ واعتماد ${saves.length} درجة بنجاح.`, 'تمت العملية');
            await loadData(true); // Silent refresh
            setModifiedIds(new Set());
        } catch (err) {
            toast.error('حدث خطأ أثناء حفظ الدرجات.', 'خطأ');
            console.error('Save error:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearRecord = async (studentId) => {
        if (!window.confirm('هل أنت متأكد من حذف نتيجة هذا الطالب لهذا الاختبار؟')) return;
        
        try {
            const resultId = `${selectedExamId}_${studentId}`;
            await deleteOmrResult(resultId);
            toast.success('تم حذف النتيجة.', 'نجاح');
            
            setLocalGrades(prev => {
                const next = { ...prev };
                delete next[studentId];
                return next;
            });
            setModifiedIds(prev => {
                const next = new Set(prev);
                next.delete(studentId);
                return next;
            });
            
            // Also update the global results state to keep things sync
            setResults(prev => prev.filter(r => r.id !== resultId));
        } catch (err) {
            toast.error('فشل حذف النتيجة.', 'خطأ');
        }
    };

    const stats = useMemo(() => {
        if (!selectedExamId) return null;
        const totalEligible = filteredStudents.length;
        const withGrades = filteredStudents.filter(s => localGrades[s.id] !== undefined && localGrades[s.id] !== '').length;
        const pending = totalEligible - withGrades;
        return { totalEligible, withGrades, pending };
    }, [filteredStudents, localGrades, selectedExamId]);

    const getGradeColor = (pct) => {
        const p = parseFloat(pct);
        if (isNaN(p)) return 'text-slate-300';
        if (p >= 90) return 'text-emerald-600';
        if (p >= 80) return 'text-indigo-600';
        if (p >= 50) return 'text-amber-600';
        return 'text-rose-500';
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* ── Premium Welcome Header ── */}
            <div className="luxury-card p-10 flex flex-col md:flex-row justify-between items-center gap-8 bg-gradient-to-br from-slate-900 to-indigo-950 border-none relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32 transition-transform duration-1000 group-hover:scale-150"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl -ml-24 -mb-24 transition-transform duration-1000 group-hover:scale-150"></div>
                
                <div className="relative z-10 flex items-center gap-6">
                    <div className="w-20 h-20 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-indigo-500/20 transform rotate-3 transition-all duration-700 group-hover:rotate-12 group-hover:scale-110">
                        <Trophy size={40} strokeWidth={1.5} />
                    </div>
                    <div className="text-right">
                        <h1 className="text-3xl md:text-4xl font-black text-white font-header tracking-tight leading-tight">
                            رصد <span className="text-indigo-300">الاختبارات الوهمية</span>
                        </h1>
                        <p className="text-indigo-100/60 text-sm font-medium mt-2 max-w-lg leading-relaxed">
                            نظام الرصد العاجل والتحويل الرقمي. قم بوضع درجات الطلاب يدوياً للاختبارات التي لا تتطلب تصحيحاً آلياً، واعتمدها بضغطة زر واحدة.
                        </p>
                    </div>
                </div>

                <div className="relative z-10 flex flex-col gap-4 min-w-[300px]">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.2em] px-1">تاريخ الاعتماد</label>
                        <input 
                            type="date" 
                            value={adoptDate}
                            onChange={e => setAdoptDate(e.target.value)}
                            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white font-black text-sm outline-none focus:bg-white/20 transition-all text-center [color-scheme:dark]"
                        />
                    </div>
                    <button 
                        onClick={handleSaveAndAdopt}
                        disabled={isSaving || !selectedExamId || modifiedIds.size === 0}
                        className="w-full flex items-center justify-center gap-3 px-8 py-5 bg-white text-slate-900 rounded-2xl font-black hover:bg-indigo-50 transition-all shadow-xl active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed group/btn"
                    >
                        {isSaving ? (
                            <Loader2 size={24} className="animate-spin text-indigo-600" />
                        ) : (
                            <Zap size={24} className="text-indigo-600 group-hover/btn:animate-pulse" />
                        )}
                        <span className="text-lg">حفظ واعتماد الآن</span>
                        {modifiedIds.size > 0 && !isSaving && (
                            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-xs animate-bounce">
                                {modifiedIds.size}
                            </span>
                        )}
                    </button>
                    {!selectedExamId && (
                        <p className="text-[10px] text-center text-indigo-300/50 font-black uppercase tracking-[0.2em] animate-pulse">
                            يرجى اختيار اختبار للبدء بالرصد
                        </p>
                    )}
                </div>
            </div>

            {/* ── Intelligent Stats Grid ── */}
            {selectedExamId && stats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4 duration-700">
                    <div className="luxury-card p-6 bg-white border-l-4 border-indigo-500 flex items-center gap-5">
                        <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><UsersIcon size={24}/></div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">إجمالي الطلاب</p>
                            <p className="text-2xl font-black text-slate-900">{stats.totalEligible} طالب</p>
                        </div>
                    </div>
                    <div className="luxury-card p-6 bg-white border-l-4 border-emerald-500 flex items-center gap-5">
                        <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><CheckCircle2 size={24}/></div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">تم رصدهم</p>
                            <p className="text-2xl font-black text-slate-900">{stats.withGrades} طالب</p>
                        </div>
                    </div>
                    <div className="luxury-card p-6 bg-white border-l-4 border-amber-500 flex items-center gap-5">
                        <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl"><RefreshCcw size={24}/></div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">في انتظار الرصد</p>
                            <p className="text-2xl font-black text-slate-900">{stats.pending} طالب</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Dynamic Filter & Control Bar ── */}
            <div className="luxury-card p-8 border-none bg-white shadow-2xl ring-1 ring-slate-100/50 relative">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                    <div className="md:col-span-3 space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">المرحلة التعليمية</label>
                        <select 
                            value={filterStage} 
                            onChange={e => { setFilterStage(e.target.value); setFilterGrade('All'); }}
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:bg-white focus:ring-4 focus:ring-indigo-50/50 transition-all appearance-none cursor-pointer shadow-sm"
                        >
                            <option value="All">كل المراحل</option>
                            {Object.keys(STAGES).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div className="md:col-span-3 space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1">الصف الدراسي</label>
                        <select 
                            value={filterGrade} 
                            onChange={e => setFilterGrade(e.target.value)}
                            disabled={filterStage === 'All'}
                            className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-sm focus:bg-white focus:ring-4 focus:ring-indigo-50/50 disabled:opacity-30 transition-all appearance-none cursor-pointer shadow-sm"
                        >
                            <option value="All">كل الصفوف</option>
                            {(STAGES[filterStage] || []).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>

                    <div className="md:col-span-4 space-y-3">
                        <label className="text-[11px] font-black text-indigo-400 uppercase tracking-widest px-1 flex items-center gap-2">
                             <Zap size={10}/> اختيار الاختبار للرصد
                        </label>
                        <select 
                            value={selectedExamId} 
                            onChange={e => setSelectedExamId(e.target.value)}
                            className="w-full p-4 bg-indigo-50/80 border-2 border-indigo-100 text-indigo-700 rounded-2xl font-black text-sm focus:ring-8 focus:ring-indigo-100/50 transition-all appearance-none cursor-pointer shadow-xl shadow-indigo-500/5"
                        >
                            <option value="">-- اضغط هنا لاختيار الاختبار --</option>
                            {exams.filter(e => {
                                if (filterStage !== 'All' && e.stage !== filterStage && !e.stage?.includes(filterStage)) return false;
                                if (filterGrade !== 'All' && e.grade !== filterGrade) return false;
                                return true;
                            }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).map(ex => (
                                <option key={ex.id} value={ex.id}>{ex.title} | {ex.grade} | {new Date(ex.createdAt).toLocaleDateString('ar-SA')}</option>
                            ))}
                        </select>
                    </div>

                    <div className="md:col-span-2 flex gap-2">
                         <button 
                            onClick={() => setShowOnlyEmpty(!showOnlyEmpty)}
                            title={showOnlyEmpty ? "عرض الكل" : "عرض الطلاب غير المرصودين فقط"}
                            className={`flex-1 p-4 rounded-2xl transition-all border ${showOnlyEmpty ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-400 border-slate-100'}`}
                         >
                            <Filter size={20} className="mx-auto" />
                         </button>
                         <button 
                            onClick={() => loadData(true)}
                            disabled={isRefreshing}
                            className="flex-1 p-4 bg-slate-50 text-slate-400 border border-slate-100 rounded-2xl hover:text-indigo-600 transition-all"
                         >
                            <RefreshCcw size={20} className={`mx-auto ${isRefreshing ? 'animate-spin' : ''}`} />
                         </button>
                    </div>
                </div>

                <div className="mt-8 relative group">
                    <Search className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 transition-colors group-focus-within:text-indigo-500" size={24}/>
                    <input 
                        type="text" 
                        placeholder="ابحث عن طالب معين لرصد درجته..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pr-16 pl-6 py-5 bg-slate-50/50 border-none rounded-[2rem] outline-none focus:bg-white focus:ring-8 focus:ring-indigo-50 transition-all font-bold text-lg text-right shadow-inner"
                    />
                </div>
            </div>

            {/* ── Main Grading Surface ── */}
            <div className="luxury-card border-none bg-white shadow-2xl overflow-hidden relative min-h-[500px]">
                {loading ? (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                        <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-6 shadow-xl shadow-indigo-100"></div>
                        <p className="text-slate-400 font-black tracking-widest uppercase text-sm animate-pulse">جاري سحب بيانات الطلاب...</p>
                    </div>
                ) : !selectedExamId ? (
                    <div className="py-40 flex flex-col items-center justify-center text-center px-10">
                        <div className="w-40 h-40 bg-gradient-to-br from-slate-50 to-white rounded-[3.5rem] flex items-center justify-center text-slate-200 mb-10 shadow-inner ring-1 ring-slate-100 relative group transition-all duration-700 hover:scale-105">
                            <BookOpen size={80} className="opacity-40 transition-transform duration-700 group-hover:rotate-12"/>
                            <div className="absolute -top-4 -right-4 w-12 h-12 bg-white rounded-2xl shadow-lg border border-slate-50 flex items-center justify-center text-amber-500 animate-bounce">
                                <Star size={24} />
                            </div>
                        </div>
                        <h3 className="text-3xl font-black text-slate-800 font-header leading-tight">ابدأ رحلة الرصد الآن</h3>
                        <p className="text-slate-400 text-lg mt-4 max-w-lg font-medium leading-relaxed">
                            قم باختيار الاختبار المطلوب من القائمة أعلاه لعرض قائمة الطلاب والبدء في إدخال الدرجات يدوياً.
                        </p>
                        <div className="mt-10 flex gap-4">
                            <div className="flex items-center gap-2 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 text-xs font-bold">
                                <CheckSquare size={16}/> اختر الاختبار
                            </div>
                            <div className="flex items-center gap-2 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 text-xs font-bold">
                                <Award size={16}/> أدخل الدرجة
                            </div>
                            <div className="flex items-center gap-2 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 text-xs font-bold">
                                <Zap size={16}/> اعتمد النتائج
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-right border-collapse" dir="rtl">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                    <th className="px-10 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-24">تسلسل</th>
                                    <th className="px-10 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky right-0 bg-slate-50/50 z-20 shadow-[10px_0_20px_-5px_rgba(0,0,0,0.02)]">الاسم الكامل للطالب</th>
                                    <th className="px-8 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">الرقم التعريفي</th>
                                    <th className="px-8 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">الدرجة المكتسبة</th>
                                    <th className="px-8 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center bg-indigo-50/20">النسبة والإنجاز</th>
                                    <th className="px-8 py-10 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredStudents.map((s, idx) => {
                                    const scoreValue = localGrades[s.id] || '';
                                    const total = selectedExam?.qCount || 30;
                                    const percentageValue = scoreValue !== '' ? (parseFloat(scoreValue) / total) * 100 : null;
                                    const percentageFormatted = percentageValue !== null ? percentageValue.toFixed(1) : '—';
                                    const isModified = modifiedIds.has(s.id);
                                    
                                    return (
                                        <tr key={s.id} className={`group hover:bg-indigo-50/10 transition-all duration-300 ${isModified ? 'bg-amber-50/10' : ''}`}>
                                            <td className="px-10 py-8 text-center">
                                                <div className={`text-sm font-black transition-all duration-500 scale-100 group-hover:scale-125 ${isModified ? 'text-amber-500' : 'text-slate-300 group-hover:text-indigo-400'}`}>
                                                    {idx + 1}
                                                </div>
                                            </td>
                                            <td className="px-10 py-8 sticky right-0 bg-white group-hover:bg-slate-50 z-10 transition-colors shadow-[15px_0_30px_-15px_rgba(0,0,0,0.03)]">
                                                <div className="flex items-center gap-5">
                                                    <div className={`w-14 h-14 rounded-[1.8rem] flex items-center justify-center font-black text-lg transition-all duration-500 transform group-hover:rotate-12 group-hover:scale-110 shadow-sm
                                                        ${isModified ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                                                        {s.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-slate-800 text-lg mb-1 leading-none tracking-tight">{s.name}</div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                             <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black tracking-widest uppercase">{s.id}</span>
                                                             <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                                                             <span className="text-[10px] text-slate-400 font-bold">{s.grade || s.classroom || ''}</span>
                                                             {isModified && <span className="text-[10px] text-amber-500 font-black animate-pulse mr-2">(تعديل غير محفوظ)</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-8 text-center">
                                                <span className="text-sm font-black text-slate-400 font-mono tracking-widest">{s.id}</span>
                                            </td>
                                            <td className="px-8 py-8 text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    <div className="relative group/input">
                                                        <input 
                                                            type="number" 
                                                            min="0"
                                                            max={total}
                                                            step="0.5"
                                                            value={scoreValue}
                                                            onChange={e => handleGradeChange(s.id, e.target.value)}
                                                            className={`w-28 text-center p-4 rounded-2xl font-black text-2xl outline-none transition-all duration-500 shadow-inner
                                                                ${isModified 
                                                                    ? 'bg-amber-50 border-2 border-amber-300 text-amber-700 ring-4 ring-amber-50' 
                                                                    : 'bg-slate-50 border-2 border-transparent text-indigo-600 focus:bg-white focus:border-indigo-400 focus:ring-8 focus:ring-indigo-100'}`}
                                                            placeholder="0"
                                                        />
                                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-indigo-500 transition-all duration-500 group-focus-within/input:w-full rounded-full"></div>
                                                    </div>
                                                    <span className="text-slate-300 font-black text-sm">/ {total}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-8 text-center bg-indigo-50/5 group-hover:bg-indigo-50/20 transition-colors">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className={`text-3xl font-black font-header transition-all duration-700 ${getGradeColor(percentageFormatted)}`}>
                                                        {percentageFormatted}<span className="text-sm opacity-50 mr-1">%</span>
                                                    </div>
                                                    {percentageValue !== null && (
                                                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                                            <div 
                                                                className={`h-full transition-all duration-1000 ease-out ${percentageValue >= 90 ? 'bg-emerald-500' : percentageValue >= 50 ? 'bg-indigo-500' : 'bg-rose-500'}`}
                                                                style={{ width: `${percentageValue}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-8 py-8 text-center">
                                                {localGrades[s.id] !== undefined && (
                                                    <button 
                                                        onClick={() => handleClearRecord(s.id)}
                                                        className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 active:scale-95"
                                                        title="مسح النتيجة"
                                                    >
                                                        <Trash2 size={20} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        
                        {filteredStudents.length === 0 && !loading && (
                            <div className="py-40 flex flex-col items-center justify-center text-center">
                                <Search size={64} className="text-slate-100 mb-6 animate-pulse"/>
                                <h4 className="text-2xl font-black text-slate-300 tracking-tight">لم يتم العثور على نتائج للفلترة الحالية</h4>
                                <p className="text-slate-300 font-medium mt-2">يرجى تعديل معايير البحث أو اختيار صف دراسي مختلف.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Footer Info ── */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] opacity-60">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                    نظام رصد نخبة الشمال المتطور
                </div>
                <div>Manual Registry • Version 2.0 • Elite Engine</div>
                <div className="flex items-center gap-3">
                    <CheckCircle2 size={12}/> تم الربط بقاعدة البيانات السحابية
                </div>
            </div>
            
            <style>{`
                .font-header { font-family: 'Alexandria', sans-serif; }
                input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
                input[type=number] { -moz-appearance: textfield; }
            `}</style>
        </div>
    );
};

export default MockExams;
