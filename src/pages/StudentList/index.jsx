import React, { useState, useEffect, useMemo } from 'react';
import { getStudents, saveStudent, deleteStudent, saveStudentsBulk } from '../../utils/dataService';
import { Plus, Search, Edit2, Trash2, UserPlus, Filter, Download, Upload, FileSpreadsheet, Wand2, X, Phone, Hash, Layers, AlertTriangle, CheckSquare, Square } from 'lucide-react';
import * as XLSX from 'xlsx';

/** الرقم الفريد في الرمز = رقم الهوية فقط (رقم الجلوس عمود منفصل في الجدول). */
const getStudentOmUniqueId = (s) =>
  (s.nationalId || s.national_id || '').toString().trim();

const StudentList = () => {
    const [students, setStudents] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedStage, setSelectedStage] = useState('الكل');
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
    const [genConfig, setGenConfig] = useState({ stage: '', grade: '', startNumber: '' });
    const [modalClassValue, setModalClassValue] = useState('');
    const [listTab, setListTab] = useState('registry'); // 'registry' | 'omrIds'
    const [filterOmStage, setFilterOmStage] = useState('الكل');
    const [filterOmGrade, setFilterOmGrade] = useState('الكل');
    const [searchOm, setSearchOm] = useState('');
    const [selectedIds, setSelectedIds] = useState(() => new Set());

    useEffect(() => {
        fetchStudents();
    }, []);

    useEffect(() => {
        setSelectedIds(new Set());
    }, [searchTerm, selectedStage, listTab]);

    useEffect(() => {
        if (!isModalOpen) return;
        setModalClassValue((editingStudent?.class || '').toString());
    }, [isModalOpen, editingStudent]);

    const fetchStudents = async () => {
        setLoading(true);
        const data = await getStudents();
        setStudents(data);
        setLoading(false);
    };

    const handleDelete = async (id) => {
        if (window.confirm('هل أنت متأكد من حذف هذا الطالب؟')) {
            await deleteStudent(id);
            fetchStudents();
        }
    };

    const handleDeleteAll = async () => {
        if (students.length === 0) return;
        if (window.confirm('هل أنت متأكد من حذف جميع الطلاب؟ سيتم مسح السجل بالكامل ولا يمكن التراجع عن هذه الخطوة.')) {
            await saveStudentsBulk([]);
            fetchStudents();
        }
    };

    const handleDeleteFiltered = async () => {
        try {
            if (filteredStudents.length === 0) return;
            if (window.confirm(`هل أنت متأكد من حذف ${filteredStudents.length} طالب (الطلاب المعروضين حالياً)؟ لن يمكنك التراجع عن هذه الخطوة.`)) {
                const filteredIds = new Set(filteredStudents.map(s => s.id));
                const remainingStudents = students.filter(s => !filteredIds.has(s.id));
                await saveStudentsBulk(remainingStudents);
                setSelectedIds(new Set());
                fetchStudents();
                alert('تم الحذف بنجاح!');
            }
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء الحذف: ' + error.message);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const studentData = {
            id: editingStudent?.id,
            name: formData.get('name'),
            seatNumber: formData.get('seatNumber') || '',
            nationalId: formData.get('nationalId') || '',
            stage: formData.get('stage'),
            grade: formData.get('grade'),
            class: formData.get('class'),
            committee: formData.get('committee') || '',
            phone: formData.get('phone') || '',
        };
        await saveStudent(studentData);
        setIsModalOpen(false);
        setEditingStudent(null);
        fetchStudents();
    };

    const filteredStudents = students.filter(s => {
        const name = s.name || '';
        const seat = s.seatNumber || '';
        const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            seat.includes(searchTerm);
        const matchesStage = selectedStage === 'الكل' || s.stage === selectedStage;
        return matchesSearch && matchesStage;
    });

    const toggleSelectStudent = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const visibleFilteredIds = useMemo(
        () => filteredStudents.map((s) => s.id),
        [filteredStudents]
    );

    const allVisibleSelected =
        visibleFilteredIds.length > 0 && visibleFilteredIds.every((id) => selectedIds.has(id));

    const toggleSelectAllVisible = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                visibleFilteredIds.forEach((id) => next.delete(id));
            } else {
                visibleFilteredIds.forEach((id) => next.add(id));
            }
            return next;
        });
    };

    const handleDeleteSelected = async () => {
        const count = selectedIds.size;
        if (count === 0) return;
        if (
            !window.confirm(
                `هل أنت متأكد من حذف ${count} طالب محدد؟\nلا يمكن التراجع عن هذه الخطوة.`
            )
        ) {
            return;
        }
        try {
            const idSet = new Set(selectedIds);
            const remaining = students.filter((s) => !idSet.has(s.id));
            await saveStudentsBulk(remaining);
            setSelectedIds(new Set());
            await fetchStudents();
            alert(`تم حذف ${count} طالب بنجاح.`);
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء الحذف: ' + (error?.message || error));
        }
    };

    const stages = ['الكل', ...new Set(students.map(s => s.stage))];
    const allGrades = [...new Set(students.map(s => s.grade))];

    const stagesOm = useMemo(
        () => ['الكل', ...[...new Set(students.map((s) => s.stage).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'ar'))],
        [students]
    );
    const gradesOm = useMemo(() => {
        const pool =
            filterOmStage === 'الكل'
                ? students
                : students.filter((s) => s.stage === filterOmStage);
        return [
            'الكل',
            ...[...new Set(pool.map((s) => s.grade).filter(Boolean))].sort((a, b) =>
                String(a).localeCompare(String(b), 'ar')
            ),
        ];
    }, [students, filterOmStage]);

    const omrTabStudents = useMemo(() => {
        return students.filter((s) => {
            if (filterOmStage !== 'الكل' && s.stage !== filterOmStage) return false;
            if (filterOmGrade !== 'الكل' && s.grade !== filterOmGrade) return false;
            if (searchOm.trim()) {
                const q = searchOm.trim().toLowerCase();
                const om = getStudentOmUniqueId(s).toLowerCase();
                const nm = (s.name || '').toLowerCase();
                if (!nm.includes(q) && !om.includes(q)) return false;
            }
            return true;
        });
    }, [students, filterOmStage, filterOmGrade, searchOm]);

    const omrGroupedSections = useMemo(() => {
        const map = new Map();
        for (const s of omrTabStudents) {
            const st = (s.stage || 'غير محدد').toString().trim() || 'غير محدد';
            const gr = (s.grade || 'غير محدد').toString().trim() || 'غير محدد';
            const key = `${st}\t${gr}`;
            if (!map.has(key)) map.set(key, { stage: st, grade: gr, list: [] });
            map.get(key).list.push(s);
        }
        const arr = [...map.values()];
        arr.forEach((g) => g.list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')));
        arr.sort((a, b) => {
            const c = a.stage.localeCompare(b.stage, 'ar');
            if (c !== 0) return c;
            return a.grade.localeCompare(b.grade, 'ar');
        });
        return arr;
    }, [omrTabStudents]);

    const omrDuplicateIds = useMemo(() => {
        const counts = new Map();
        for (const s of omrTabStudents) {
            const id = getStudentOmUniqueId(s);
            if (!id) continue;
            counts.set(id, (counts.get(id) || 0) + 1);
        }
        return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    }, [omrTabStudents]);

    const handleExportOmIds = () => {
        const flat = omrTabStudents.slice().sort((a, b) => {
            const st = (a.stage || '').localeCompare(b.stage || '', 'ar');
            if (st !== 0) return st;
            const gr = (a.grade || '').localeCompare(b.grade || '', 'ar');
            if (gr !== 0) return gr;
            return (a.name || '').localeCompare(b.name || '', 'ar');
        });
        const rows = flat.map((s) => ({
            المرحلة: s.stage || '',
            الصف: s.grade || '',
            'اسم الطالب': s.name || '',
            'رقم الهوية (الرمز)': getStudentOmUniqueId(s) || '—',
            'رقم الجلوس': s.seatNumber || '',
            'رقم الهوية': s.nationalId || '',
            'معرف النظام': s.id || '',
            الفصل: s.class || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'الأرقام الفريدة');
        XLSX.writeFile(wb, `الأرقام_الفريدة_للطلاب_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleGenerateSeats = async () => {
        if (!genConfig.stage || !genConfig.grade || !genConfig.startNumber) {
            alert('يرجى إكمال جميع الحقول');
            return;
        }

        const startNum = parseInt(genConfig.startNumber);
        const gradeStudents = students
            .filter(s => s.stage === genConfig.stage && s.grade === genConfig.grade)
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

        const updatedStudents = students.map(s => {
            const index = gradeStudents.findIndex(gs => gs.id === s.id);
            if (index !== -1) {
                return { ...s, seatNumber: (startNum + index).toString() };
            }
            return s;
        });

        await saveStudentsBulk(updatedStudents);
        setIsGeneratorOpen(false);
        fetchStudents();
        alert(`تم توليد ${gradeStudents.length} رقم جلوس بنجاح`);
    };

    const suggestStartNumber = () => {
        const assignedSeats = students
            .map(s => parseInt(s.seatNumber))
            .filter(n => !isNaN(n));
        return assignedSeats.length > 0 ? Math.max(...assignedSeats) + 1 : 1001;
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(students));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "students.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        const fileExtension = file.name.split('.').pop().toLowerCase();

        reader.onload = async (event) => {
            try {
                let importedData = [];
                let foundKeysInfo = 'بيانات الأعمدة غير متوفرة';

                if (fileExtension === 'json') {
                    importedData = JSON.parse(event.target.result);
                } else if (['xlsx', 'xls', 'csv'].includes(fileExtension)) {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const rawJsonData = XLSX.utils.sheet_to_json(worksheet);
                    
                    foundKeysInfo = rawJsonData.length > 0 ? Object.keys(rawJsonData[0]).join(' | ') : 'ملف فارغ';
                    
                    // Normalize keys (remove leading/trailing spaces from Excel headers)
                    const jsonData = rawJsonData.map(row => {
                        const normalizedRow = {};
                        for (const key in row) {
                            if (Object.prototype.hasOwnProperty.call(row, key)) {
                                normalizedRow[key.toString().trim()] = row[key];
                            }
                        }
                        return normalizedRow;
                    });

                    // Map Excel columns to our data structure with a flexible search
                    const getVal = (row, possibleNames) => {
                        for (const key in row) {
                            // Remove ALL spaces, invisible chars, and normalize
                            const cleanKey = key.toString().replace(/[\s\u200B-\u200D\uFEFF]/g, '');
                            for (const name of possibleNames) {
                                const cleanName = name.replace(/[\s]/g, '');
                                if (cleanKey === cleanName || cleanKey.includes(cleanName)) {
                                    return row[key] !== undefined && row[key] !== null ? row[key] : '';
                                }
                            }
                        }
                        return '';
                    };

                    importedData = jsonData.map((row, index) => ({
                        id: Date.now().toString() + index,
                        name: getVal(row, ['الاسم', 'اسم الطالب', 'الاسم رباعي', 'name']).toString().trim(),
                        seatNumber: getVal(row, ['رقم الطالب', 'رقم الجلوس', 'الجلوس', 'seat']).toString().trim(),
                        nationalId: getVal(row, ['رقم الهوية', 'الهوية', 'nationalId']).toString().trim(),
                        stage: getVal(row, ['المرحلة', 'stage', 'المرحلة الدراسية']).toString().trim(),
                        grade: getVal(row, ['رقم الصف', 'الصف', 'grade']).toString().trim(),
                        class: getVal(row, ['الفصل', 'الشعبة', 'class']).toString().trim(),
                        committee: getVal(row, ['اللجنة', 'رقم اللجنة', 'committee']).toString().trim(),
                        phone: getVal(row, ['رقم الجوال', 'الجوال', 'هاتف', 'جوال', 'phone']).toString().trim(),
                    })).filter(s => s.name !== ''); // Filter out empty rows
                }

                if (Array.isArray(importedData) && importedData.length > 0) {
                    const wantToMerge = window.confirm(`تم قراءة ${importedData.length} طالب من الملف.\n\nهل ترغب في "تحديث" الطلاب الحاليين (لإضافة رقم الهوية والبيانات الناقصة) بدلاً من مسح القائمة بالكامل؟\n\n- اضغط "موافق/OK" للتحديث والدمج.\n- اضغط "إلغاء/Cancel" لمسح القائمة السابقة واستبدالها بالكامل.`);
                    
                    if (wantToMerge) {
                        // Merge logic: match by seatNumber or name
                        let updatedCount = 0;
                        const mergedStudents = students.map(existing => {
                            const match = importedData.find(imp => {
                                const impNat = (imp.nationalId || '').trim();
                                const existNat = (existing.nationalId || '').trim();
                                if (impNat && existNat && impNat === existNat) return true;
                                if (imp.seatNumber && imp.seatNumber === existing.seatNumber) return true;
                                if (imp.name === existing.name) return true;
                                return false;
                            });
                            
                            if (match) {
                                updatedCount++;
                                return { 
                                    ...existing, 
                                    nationalId: match.nationalId || existing.nationalId,
                                    phone: match.phone || existing.phone,
                                    committee: match.committee || existing.committee
                                };
                            }
                            return existing;
                        });
                        
                        // Add purely new students who did not match any existing
                        const existingMatchKeys = new Set(
                            mergedStudents.map((s) => {
                                const nat = (s.nationalId || '').trim();
                                if (nat) return `nat:${nat}`;
                                if (s.seatNumber) return `seat:${s.seatNumber}`;
                                return `name:${s.name}`;
                            })
                        );
                        const newStudents = importedData.filter((imp) => {
                            const nat = (imp.nationalId || '').trim();
                            const key = nat ? `nat:${nat}` : (imp.seatNumber ? `seat:${imp.seatNumber}` : `name:${imp.name}`);
                            return !existingMatchKeys.has(key);
                        });
                        
                        const finalList = [...mergedStudents, ...newStudents];
                        await saveStudentsBulk(finalList);
                        fetchStudents();
                        
                        alert(`تم التحديث بنجاح!\nتم تحديث بيانات ${updatedCount} طالب موجود، وإضافة ${newStudents.length} طالب جديد.\n(الأعمدة المقروءة: ${foundKeysInfo})`);
                        
                    } else {
                        if (window.confirm(`تحذير نهائي: سيتم حذف جميع الطلاب الحاليين واستبدالهم بالقائمة الجديدة. هل أنت متأكد؟`)) {
                            await saveStudentsBulk(importedData);
                            fetchStudents();
                            alert('تم استبدال البيانات بنجاح!\n(الأعمدة المقروءة من الملف: ' + foundKeysInfo + ')');
                        }
                    }
                } else {
                    alert('لم يتم العثور على أي طلاب بأسماء صحيحة.\nالأعمدة المقروءة: ' + foundKeysInfo);
                }
            } catch (err) {
                console.error(err);
                alert('خطأ في معالجة الملف: ' + err.message);
            }
        };

        if (fileExtension === 'json') {
            reader.readAsText(file);
        } else {
            reader.readAsArrayBuffer(file);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black gold-text italic tracking-tight">سجل الطلاب الملكي</h1>
                    <p className="text-slate-400 text-sm mt-1 font-medium">إدارة المركزية لبيانات الطلاب بخصوصية وفخامة</p>
                </div>

                {listTab === 'registry' && (
                <div className="flex flex-wrap gap-3">
                    <input
                        type="file"
                        id="import-students"
                        className="hidden"
                        accept=".json,.xlsx,.xls,.csv"
                        onChange={handleImport}
                    />
                    <button
                        onClick={() => document.getElementById('import-students').click()}
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all active:scale-95 text-sm font-bold shadow-sm"
                    >
                        <FileSpreadsheet size={18} className="text-indigo-500" />
                        <span>استيراد ملفات</span>
                    </button>
                    <button
                        onClick={() => {
                            const suggested = suggestStartNumber();
                            setGenConfig({ ...genConfig, startNumber: suggested.toString() });
                            setIsGeneratorOpen(true);
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-amber-50 text-amber-700 border border-amber-100 rounded-2xl hover:bg-amber-100 transition-all font-bold active:scale-95 text-sm shadow-sm"
                    >
                        <Wand2 size={18} />
                        <span>أرقام الجلوس</span>
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-50 transition-all active:scale-95 text-sm font-bold shadow-sm"
                    >
                        <Download size={18} />
                        <span>نسخة احتياطية</span>
                    </button>
                    <button
                        onClick={() => { setEditingStudent(null); setIsModalOpen(true); }}
                        className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 font-black text-sm"
                    >
                        <Plus size={20} />
                        <span>إضافة طالب</span>
                    </button>
                    {filteredStudents.length > 0 && filteredStudents.length < students.length && (
                        <button
                            onClick={handleDeleteFiltered}
                            className="flex items-center gap-2 px-6 py-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl hover:bg-rose-600 hover:text-white transition-all active:scale-95 text-sm font-bold shadow-sm"
                        >
                            <Trash2 size={18} />
                            <span>حذف المعروض ({filteredStudents.length})</span>
                        </button>
                    )}
                    <button
                        onClick={handleDeleteAll}
                        className="flex items-center gap-2 px-6 py-3 bg-red-50 border border-red-100 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all active:scale-95 text-sm font-bold shadow-sm"
                    >
                        <Trash2 size={18} />
                        <span>تفريغ السجل</span>
                    </button>
                </div>
                )}
            </div>

            <div className="flex p-1.5 bg-slate-100/90 rounded-2xl border border-slate-100 shadow-inner w-full max-w-xl">
                <button
                    type="button"
                    onClick={() => setListTab('registry')}
                    className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-sm transition-all ${
                        listTab === 'registry'
                            ? 'bg-white text-indigo-600 shadow-md'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <UserPlus size={18} className="shrink-0" />
                    سجل الطلاب
                </button>
                <button
                    type="button"
                    onClick={() => setListTab('omrIds')}
                    className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-sm transition-all ${
                        listTab === 'omrIds'
                            ? 'bg-white text-indigo-600 shadow-md'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <Hash size={18} className="shrink-0" />
                    الأرقام الفريدة (الهوية)
                </button>
            </div>

            {listTab === 'omrIds' && (
                <div className="luxury-card border-none overflow-hidden bg-white p-6 md:p-8 space-y-6">
                    <div className="flex flex-col lg:flex-row gap-4 lg:items-end lg:justify-between">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                                <Layers className="text-indigo-500 shrink-0" size={22} />
                                عرض حسب المرحلة والصف
                            </h2>
                            <p className="text-xs font-bold text-slate-500 mt-2 leading-relaxed max-w-2xl">
                                عمود «الرقم الفريد» هو <span className="text-slate-800 font-black">رقم الهوية فقط</span> كما يُطبَع في رمز الاستجابة. رقم الجلوس عمود مستقل ولا يُستخدم للاستعلام عن النتائج أو للرمز.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleExportOmIds}
                            disabled={omrTabStudents.length === 0}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                            <Download size={18} />
                            تصدير Excel
                        </button>
                    </div>

                    {omrDuplicateIds.length > 0 && (
                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950">
                            <AlertTriangle className="shrink-0 mt-0.5" size={20} />
                            <div className="text-sm font-bold text-right">
                                <span className="font-black">تنبيه:</span> يوجد أكثر من طالب يشتركان في نفس الرقم الفريد ضمن العرض الحالي:{' '}
                                <span className="font-mono tabular-nums">{omrDuplicateIds.join('، ')}</span>
                                . راجع أرقام الجلوس أو الهوية لتفادي التعارض عند المسح.
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row flex-wrap gap-4">
                        <div className="flex-1 min-w-[160px] space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">المرحلة</label>
                            <select
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-50"
                                value={filterOmStage}
                                onChange={(e) => {
                                    setFilterOmStage(e.target.value);
                                    setFilterOmGrade('الكل');
                                }}
                            >
                                {stagesOm.map((s) => (
                                    <option key={s} value={s}>
                                        {s === 'الكل' ? 'كل المراحل' : s}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-1 min-w-[160px] space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">الصف</label>
                            <select
                                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-50"
                                value={filterOmGrade}
                                onChange={(e) => setFilterOmGrade(e.target.value)}
                            >
                                {gradesOm.map((g) => (
                                    <option key={g} value={g}>
                                        {g === 'الكل' ? 'كل الصفوف' : g}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex-[2] min-w-[200px] space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">بحث</label>
                            <div className="relative">
                                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    dir="rtl"
                                    placeholder="اسم الطالب أو الرقم الفريد..."
                                    value={searchOm}
                                    onChange={(e) => setSearchOm(e.target.value)}
                                    className="w-full pr-12 pl-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-50"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="text-center py-2">
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                            العدد: <span className="text-indigo-600 text-lg tabular-nums">{omrTabStudents.length}</span> طالب
                        </span>
                    </div>

                    {omrGroupedSections.length === 0 ? (
                        <div className="text-center py-16 text-slate-400 font-black">لا يوجد طلاب مطابقون للفلتر.</div>
                    ) : (
                        <div className="space-y-8">
                            {omrGroupedSections.map((sec) => (
                                <div key={`${sec.stage}-${sec.grade}`} className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                                    <div className="px-5 py-4 bg-gradient-to-l from-indigo-50 to-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-right">
                                            <span className="px-3 py-1 rounded-lg bg-white text-slate-600 text-[10px] font-black border border-slate-200">
                                                {sec.stage}
                                            </span>
                                            <span className="px-3 py-1 rounded-lg bg-indigo-100 text-indigo-800 text-[10px] font-black border border-indigo-200">
                                                {sec.grade}
                                            </span>
                                            <span className="text-xs font-bold text-slate-500">({sec.list.length})</span>
                                        </div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="premium-table text-right w-full min-w-[640px]">
                                            <thead>
                                                <tr>
                                                    <th className="px-6 py-4">اسم الطالب</th>
                                                    <th className="px-6 py-4 text-center">رقم الهوية (الرمز)</th>
                                                    <th className="px-6 py-4 text-center">رقم الجلوس</th>
                                                    <th className="px-6 py-4 text-center">الهوية</th>
                                                    <th className="px-6 py-4 text-center">معرف النظام</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {sec.list.map((s) => {
                                                    const om = getStudentOmUniqueId(s);
                                                    const dup = om && omrDuplicateIds.includes(om);
                                                    return (
                                                        <tr key={s.id} className={dup ? 'bg-amber-50/50' : ''}>
                                                            <td className="px-6 py-3.5 font-black text-slate-900">{s.name}</td>
                                                            <td className="px-6 py-3.5 text-center">
                                                                <span
                                                                    className={`inline-block font-mono font-black text-lg tabular-nums px-3 py-1 rounded-xl ${
                                                                        dup
                                                                            ? 'text-amber-900 bg-amber-100 border border-amber-200'
                                                                            : 'text-indigo-700 bg-indigo-50 border border-indigo-100'
                                                                    }`}
                                                                >
                                                                    {om || '—'}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-3.5 text-center font-mono text-slate-600 text-sm">
                                                                {s.seatNumber || '—'}
                                                            </td>
                                                            <td className="px-6 py-3.5 text-center font-mono text-slate-600 text-sm">
                                                                {s.nationalId || '—'}
                                                            </td>
                                                            <td className="px-6 py-3.5 text-center font-mono text-xs text-slate-400">{s.id}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {listTab === 'registry' && (
            <div className="luxury-card border-none overflow-hidden bg-white p-2">
                <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row gap-8 items-center justify-between bg-slate-50/20">
                    <div className="relative w-full md:w-[450px]">
                        <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="ابحث باسم الطالب أو رقم الجلوس..."
                            className="w-full pr-14 pl-6 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100/30 focus:border-indigo-300 outline-none transition-all text-slate-800 font-bold text-sm shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm">
                        <Filter size={18} className="text-indigo-400" rotate={90} />
                        <span className="text-slate-400 text-[11px] font-black uppercase tracking-widest">تصفية المرحلة:</span>
                        <select
                            className="bg-transparent border-none font-bold text-sm text-slate-800 outline-none cursor-pointer focus:ring-0"
                            value={selectedStage}
                            onChange={(e) => setSelectedStage(e.target.value)}
                        >
                            {stages.map(s => <option key={s} value={s}>{s === 'الكل' ? 'جميع المراحل' : s}</option>)}
                        </select>
                    </div>
                </div>

                {selectedIds.size > 0 && (
                    <div className="mx-4 mb-2 flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-rose-50 border border-rose-100 rounded-2xl">
                        <span className="text-sm font-black text-rose-800">
                            {selectedIds.size} طالب محدد
                        </span>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setSelectedIds(new Set())}
                                className="px-5 py-2.5 bg-white border border-rose-100 text-slate-600 rounded-xl font-black text-sm hover:bg-slate-50"
                            >
                                إلغاء التحديد
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteSelected}
                                className="px-5 py-2.5 bg-rose-600 text-white rounded-xl font-black text-sm hover:bg-rose-700 flex items-center gap-2"
                            >
                                <Trash2 size={16} />
                                حذف المحدد ({selectedIds.size})
                            </button>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto p-2">
                    <table className="premium-table text-right">
                        <thead>
                            <tr className="border-none">
                                <th className="px-4 py-5 w-14 text-center">
                                    <button
                                        type="button"
                                        onClick={toggleSelectAllVisible}
                                        disabled={filteredStudents.length === 0}
                                        title={allVisibleSelected ? 'إلغاء تحديد الكل' : 'تحديد المعروض'}
                                        className="inline-flex items-center justify-center p-2 rounded-xl text-indigo-600 hover:bg-indigo-50 disabled:opacity-30"
                                    >
                                        {allVisibleSelected ? (
                                            <CheckSquare size={22} />
                                        ) : (
                                            <Square size={22} className="text-slate-300" />
                                        )}
                                    </button>
                                </th>
                                <th className="px-8 py-5">اسم الطالب</th>
                                <th className="px-8 py-5 text-center">رقم الجلوس</th>
                                <th className="px-8 py-5 text-center">رقم الهوية</th>
                                <th className="px-8 py-5 text-center">المرحلة</th>
                                <th className="px-8 py-5 text-center">الصف الدراسي</th>
                                <th className="px-8 py-5 text-center">الفصل</th>
                                <th className="px-8 py-5 text-center">هاتف الجوال</th>
                                <th className="px-8 py-5 text-center">اللجنة</th>
                                <th className="px-8 py-5 text-left">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y-8 divide-transparent">
                            {loading ? (
                                <tr><td colSpan="10" className="text-center py-20 text-slate-300 font-bold animate-pulse">جاري جلب السجلات...</td></tr>
                            ) : filteredStudents.length === 0 ? (
                                <tr><td colSpan="10" className="text-center py-24 text-slate-300 font-black text-xl italic opacity-40">لا توجد بيانات مطابقة للبحث</td></tr>
                            ) : filteredStudents.map((student) => {
                                const isSelected = selectedIds.has(student.id);
                                return (
                                <tr
                                    key={student.id}
                                    className={`hover:scale-[1.005] transition-transform ${isSelected ? 'bg-rose-50/50' : ''}`}
                                >
                                    <td className="px-4 py-5 text-center">
                                        <button
                                            type="button"
                                            onClick={() => toggleSelectStudent(student.id)}
                                            className="inline-flex items-center justify-center p-2 rounded-xl hover:bg-slate-100"
                                            aria-label={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                                        >
                                            {isSelected ? (
                                                <CheckSquare size={22} className="text-rose-600" />
                                            ) : (
                                                <Square size={22} className="text-slate-300" />
                                            )}
                                        </button>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                          <div className="w-11 h-11 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center font-black border border-slate-100 shadow-inner">
                                              <UserPlus size={20} />
                                          </div>
                                          <div className="font-black text-slate-900 text-base">{student.name}</div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-center font-header font-black text-indigo-600 text-lg tracking-widest">{student.seatNumber}</td>
                                    <td className="px-8 py-5 text-center font-mono text-slate-600">{student.nationalId}</td>
                                    <td className="px-8 py-5 text-center">
                                        <span className="px-4 py-1.5 rounded-xl text-[10px] font-black bg-slate-50 text-slate-500 border border-slate-100 uppercase tracking-tight">
                                            {student.stage}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        <span className="px-4 py-1.5 rounded-xl text-[10px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100">
                                            {student.grade}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-center text-slate-600 font-black">{student.class}</td>
                                    <td className="px-8 py-5 text-center">
                                        {student.phone ? (
                                            <a href={`tel:${student.phone}`}
                                                className="inline-flex items-center gap-2 text-emerald-600 font-black text-xs hover:text-emerald-700 transition-colors bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                                                <Phone size={14} className="shrink-0" />
                                                <span dir="ltr">{student.phone}</span>
                                            </a>
                                        ) : (
                                            <span className="text-slate-300 text-xs italic">—</span>
                                        )}
                                    </td>
                                    <td className="px-8 py-5 text-center">
                                        {student.committee ? (
                                            <span className="bg-amber-50 text-amber-600 px-4 py-1.5 rounded-xl text-[10px] font-black border border-amber-100">
                                                اللجنة {student.committee}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300 text-xs italic opacity-40">غير مدرج</span>
                                        )}
                                    </td>
                                    <td className="px-8 py-5 text-left">
                                        <div className="flex justify-start gap-4">
                                            <button
                                                onClick={() => { setEditingStudent(student); setIsModalOpen(true); }}
                                                className="p-3 text-indigo-400 hover:bg-indigo-50 rounded-2xl transition-all active:scale-95 border border-transparent hover:border-indigo-100"
                                            >
                                                <Edit2 size={20} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(student.id)}
                                                className="p-3 text-rose-400 hover:bg-rose-50 rounded-2xl transition-all active:scale-95 border border-transparent hover:border-rose-100"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {isGeneratorOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-100">
                        <div className="p-8 bg-indigo-600 text-white flex items-center justify-between">
                            <div>
                              <h3 className="text-2xl font-black font-header">توليد أرقام الجلوس</h3>
                              <p className="text-indigo-100 text-xs mt-1 font-bold">معالج الربط التلقائي للهوية الرقمية</p>
                            </div>
                            <button onClick={() => setIsGeneratorOpen(false)} className="p-3 hover:bg-white/10 rounded-2xl transition-all"><X size={24} /></button>
                        </div>
                        <div className="p-10 space-y-6">
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-1">المرحلة الدراسية</label>
                                <select
                                    className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-800 font-bold transition-all"
                                    value={genConfig.stage}
                                    onChange={(e) => setGenConfig({ ...genConfig, stage: e.target.value, grade: '' })}
                                >
                                    <option value="">-- اختر المرحلة --</option>
                                    {(() => {
                                        const normalize = (v) => String(v || '').trim().replace(/^ال/, '');
                                        const dataStages = [...new Set(students.map(s => normalize(s.stage)).filter(Boolean))];
                                        const displayStages = [...new Set(['ابتدائي', 'متوسط', 'ثانوي', ...dataStages])];
                                        return displayStages.map(s => {
                                            const count = students.filter(std => normalize(std.stage) === s).length;
                                            return <option key={s} value={s}>{s} ({count} طالب)</option>;
                                        });
                                    })()}
                                </select>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-1">الصف المحدد</label>
                                <select
                                    className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-800 font-bold transition-all"
                                    value={genConfig.grade}
                                    onChange={(e) => setGenConfig({ ...genConfig, grade: e.target.value })}
                                >
                                    <option value="">-- اختر الصف --</option>
                                    {(() => {
                                        const normalize = (v) => String(v || '').trim().replace(/^ال/, '');
                                        return [...new Set(students.filter(s => normalize(s.stage) === genConfig.stage).map(s => s.grade))].filter(Boolean);
                                    })().map(g => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest mr-1">رقم البداية التسلسلي</label>
                                <input
                                    type="number"
                                    className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-800 font-header font-black text-lg placeholder:text-slate-300 transition-all font-mono"
                                    value={genConfig.startNumber}
                                    onChange={(e) => setGenConfig({ ...genConfig, startNumber: e.target.value })}
                                    placeholder="مثال: 1001"
                                />
                            </div>

                            <div className="flex gap-4 mt-10">
                                <button
                                    onClick={handleGenerateSeats}
                                    className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95 transition-all text-lg"
                                >
                                    بدء التشغيل
                                </button>
                                <button onClick={() => setIsGeneratorOpen(false)} className="px-10 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all text-lg">إلغاء</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-100">
                        <div className="p-10 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
                            <div>
                              <h3 className="text-3xl font-black font-header">
                                  {editingStudent ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}
                              </h3>
                              <p className="text-indigo-100 text-sm mt-2 opacity-80 font-medium tracking-tight">يرجى ملء الحقول التالية بدقة لضمان صحة رصد الدرجات</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-4 hover:bg-white/10 rounded-3xl transition-all">
                              <X size={32} />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-10 space-y-8 bg-white">
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mr-1">الاسم الثلاثي أو الرباعي للطلاب</label>
                                <input required name="name" defaultValue={editingStudent?.name} 
                                  className="w-full px-8 py-5 bg-slate-50 border border-transparent rounded-[1.5rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-900 font-black text-xl transition-all" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mr-1">رقم الجلوس (Seat ID)</label>
                                    <input name="seatNumber" defaultValue={editingStudent?.seatNumber} 
                                      className="w-full px-8 py-5 bg-slate-50 border border-transparent rounded-[1.5rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-indigo-600 font-header font-black text-xl font-mono tracking-widest transition-all" placeholder="يتم توليده تلقائياً" />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mr-1">المرحلة الأكاديمية</label>
                                    <select required name="stage" defaultValue={String(editingStudent?.stage || 'ثانوي').replace(/^ال/, '')} 
                                      className="w-full px-8 py-5 bg-slate-50 border border-transparent rounded-[1.5rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-900 font-bold transition-all appearance-none">
                                        <option value="ابتدائي">ابتدائي</option>
                                        <option value="متوسط">متوسط</option>
                                        <option value="ثانوي">ثانوي</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mr-1">رقم الهوية</label>
                                    <input name="nationalId" defaultValue={editingStudent?.nationalId} 
                                      className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-[1.5rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-900 font-bold text-sm transition-all text-center" placeholder="10XXXXXXXX" />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mr-1">الصف</label>
                                    <input required name="grade" defaultValue={editingStudent?.grade} 
                                      className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-[1.5rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-900 font-bold text-sm transition-all" placeholder="مثال: الأول" />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mr-1">الفصل / الشعبة</label>
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap gap-2 justify-end">
                                            {[
                                                { id: 'guest', label: 'زائر', value: 'زائر' },
                                            ].map((opt) => (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => setModalClassValue(opt.value)}
                                                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                                                        (modalClassValue || '').trim() === opt.value
                                                            ? 'bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-100'
                                                            : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => setModalClassValue('')}
                                                className="px-4 py-2 rounded-xl text-xs font-black transition-all border bg-white text-slate-500 border-slate-100 hover:bg-slate-50 hover:border-slate-200"
                                                title="إلغاء تصنيف زائر"
                                            >
                                                طالب مدرسة
                                            </button>
                                        </div>
                                        <input
                                            required
                                            name="class"
                                            value={modalClassValue}
                                            onChange={(e) => setModalClassValue(e.target.value)}
                                            className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-[1.5rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-900 font-bold text-sm text-center transition-all"
                                            placeholder="أ، ب... أو زائر"
                                        />
                                        <p className="text-[10px] text-slate-400 font-bold text-right">
                                            اختيار «زائر» يساعدك لاحقاً في نافذة الطباعة لإظهارهم بزر «طلاب زوار».
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mr-1">رقم اللجنة</label>
                                    <input name="committee" defaultValue={editingStudent?.committee} 
                                      className="w-full px-6 py-5 bg-slate-50 border border-transparent rounded-[1.5rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-900 font-bold text-sm text-center transition-all" />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 mr-1">
                                    <Phone size={14} className="text-emerald-500" /> هاتف ولي الأمر (لإرسال النتائج)
                                </label>
                                <input
                                    name="phone"
                                    type="tel"
                                    defaultValue={editingStudent?.phone}
                                    className="w-full px-8 py-5 bg-slate-50 border border-transparent rounded-[1.5rem] outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 text-slate-900 font-bold font-mono transition-all"
                                    placeholder="05XXXXXXXX"
                                    dir="ltr"
                                />
                            </div>
                            <div className="flex gap-4 mt-12 py-2">
                                <button type="submit" className="flex-1 py-6 bg-indigo-600 text-white rounded-[1.5rem] font-black hover:bg-indigo-700 shadow-2xl shadow-indigo-100 active:scale-95 transition-all text-xl">حفظ البيانات</button>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-12 py-6 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black hover:bg-slate-200 transition-all text-xl">تجاهل</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentList;
