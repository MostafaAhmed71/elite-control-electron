import React, { useState, useEffect } from 'react';
import { Printer, Settings, Save, CheckCircle2, FileDown, Download, Layout, UserCircle2, SlidersHorizontal, ChevronRight, X, RotateCcw, AlertCircle, Eye, Maximize2, ShieldCheck, Users } from 'lucide-react';
import { getAppSettings, saveAppSettings, saveStudent, getStudents } from '../../utils/dataService';
import { ATTENDANCE_TEMPLATE, resolveAttendanceConfig, formatCommitteeDisplay } from '../../utils/attendanceLayout';
import { exportAttendanceSheetsToPdf } from '../../utils/pdfExport';

const Attendance = () => {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [attendanceData, setAttendanceData] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [selectedRowIdx, setSelectedRowIdx] = useState(0);
    const [appConfig, setAppConfig] = useState(null);
    
    useEffect(() => {
        const init = async () => {
            const settings = await getAppSettings();
            setAppConfig(settings);
            await fetchStudents();
        };
        init();
    }, []);

    const config = resolveAttendanceConfig(appConfig?.attendance);

    const handleConfigChange = async (section, prop, value, isChecked = null) => {
        if (!appConfig) return;

        let newAttendance = { ...resolveAttendanceConfig(appConfig.attendance) };

        if (section === 'maxRows') {
            newAttendance.maxRows = parseInt(value) || 1;
        } else if (section === 'rowOverride') {
            const { idx, field } = prop;
            const val = parseFloat(value);
            newAttendance.table.rowOverrides = {
                ...newAttendance.table.rowOverrides,
                [idx]: {
                    ...(newAttendance.table.rowOverrides[idx] || { top: 0, right: 0, fontSize: 0 }),
                    [field]: val
                }
            };
        } else {
            const finalValue = isChecked !== null ? isChecked : parseFloat(value);
            newAttendance[section] = { ...newAttendance[section], [prop]: finalValue };
        }

        const newFullConfig = { ...appConfig, attendance: newAttendance };
        setAppConfig(newFullConfig);
        await saveAppSettings(newFullConfig);
    };

    const fetchStudents = async () => {
        const data = await getStudents();
        setStudents(data);
        
        const initialAttendance = {};
        data.forEach(s => {
            if(s.isPresent) {
                initialAttendance[s.id] = true;
            }
        });
        setAttendanceData(initialAttendance);
        
        setLoading(false);
    };

    const toggleAttendance = (studentId) => {
        setAttendanceData(prev => ({
            ...prev,
            [studentId]: !prev[studentId]
        }));
    };

    const saveAttendance = async () => {
        setIsSaving(true);
        try {
            for (let student of students) {
                const isPresent = !!attendanceData[student.id];
                if (student.isPresent !== isPresent) {
                    await saveStudent({ ...student, isPresent });
                }
            }
            // Custom toast/notification would be better here
            setIsSaving(false);
        } catch (error) {
            console.error("Error saving attendance", error);
            setIsSaving(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const chunkArray = (arr, size) => {
        const chunked = [];
        for (let i = 0; i < arr.length; i += size) {
            chunked.push(arr.slice(i, i + size));
        }
        return chunked;
    };

    const getCommitteesData = () => {
        if (!config) return [];
        const grouped = {};
        students.forEach(s => {
            if (!grouped[s.committee]) {
                grouped[s.committee] = [];
            }
            grouped[s.committee].push(s);
        });

        const pages = [];
        Object.keys(grouped).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).forEach(committeeId => {
            const committeeStudents = grouped[committeeId];
            const max = config.maxRows || 25;
            const chunks = chunkArray(committeeStudents, max);
            
            const gradesSet = new Set(committeeStudents.map(s => `${s.grade}`).filter(Boolean));
            const gradeText = Array.from(gradesSet).join(' و ') || 'غير محدد';
            
            chunks.forEach((chunk, chunkIndex) => {
                pages.push({
                    id: `${committeeId}-${chunkIndex}`,
                    committee: committeeId,
                    grade: gradeText,
                    totalCount: committeeStudents.length,
                    pageIndex: chunkIndex + 1,
                    totalPages: chunks.length,
                    globalStartIndex: chunkIndex * max,
                    students: chunk
                });
            });
        });

        return pages;
    };

    const handleExportCardsPDF = async () => {
        const pagesData = getCommitteesData();
        if (pagesData.length === 0) {
            alert('لا توجد صفحات للتصدير.');
            return;
        }

        setIsExporting(true);
        try {
            await exportAttendanceSheetsToPdf(pagesData, config, 'كشوف_الحضور.pdf', {
                usePrintSheetConfig: false,
            });
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert(error?.message || 'حدث خطأ أثناء توليد ملف الـ PDF');
        } finally {
            setIsExporting(false);
        }
    };

    const pagesData = getCommitteesData();
    const presentCount = Object.values(attendanceData).filter(v => v).length;
    const absentCount = students.length - presentCount;

    if (!appConfig) return (
        <div className="flex flex-col items-center justify-center py-40 opacity-20 font-alexandria">
            <RotateCcw size={64} className="animate-spin mb-4 text-slate-400" />
            <p className="font-black text-xl text-slate-600">جاري استدعاء إعدادات النظام...</p>
        </div>
    );

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-alexandria pb-20">
            {/* ── Page Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden px-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2.5xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                            <CheckCircle2 size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">إدارة الحضور والغياب</h1>
                    </div>
                    <p className="text-slate-400 font-medium text-sm flex items-center gap-2">
                        <ShieldCheck size={16} className="text-indigo-400" />
                        رصد التواجد وتوليد كشوف التوقيع — القالب: attendance_template.jpeg
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={saveAttendance}
                        disabled={loading || isSaving || isExporting}
                        className="px-6 py-4 bg-white text-indigo-600 rounded-3xl font-black text-sm hover:bg-slate-50 transition-all shadow-sm border border-slate-100 flex items-center gap-3 disabled:opacity-50"
                    >
                        {isSaving ? <RotateCcw size={20} className="animate-spin" /> : <Save size={20} />}
                        <span>{isSaving ? 'جاري الرصد...' : 'حفظ غياب الطلاب'}</span>
                    </button>

                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`flex items-center gap-3 px-6 py-4 rounded-3xl font-black text-sm transition-all shadow-sm border
                          ${showSettings ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-100' : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50'}`}
                    >
                        <Settings size={20} />
                        <span>ضبط الكشوف</span>
                    </button>
                    
                    <button
                        onClick={handleExportCardsPDF}
                        disabled={loading || isExporting}
                        className="px-6 py-4 bg-white text-slate-600 rounded-3xl font-black text-sm hover:bg-slate-50 transition-all shadow-sm border border-slate-100 flex items-center gap-3 disabled:opacity-50"
                    >
                        {isExporting ? <RotateCcw size={20} className="animate-spin" /> : <Download size={20} className="text-blue-500" />}
                        <span>تحميل PDF</span>
                    </button>

                    <button
                        onClick={handlePrint}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 flex items-center gap-3"
                    >
                        <Printer size={20} /> طباعة مباشرة
                    </button>
                </div>
            </div>

            {/* ── Stats Overview Card ── */}
            <div className="luxury-card p-6 bg-white/60 backdrop-blur-xl border-white flex flex-col md:flex-row items-center justify-between gap-6 print:hidden">
                <div className="flex items-center gap-6 divide-x divide-x-reverse divide-slate-100">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500">
                           <Users size={24} />
                        </div>
                        <div>
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">إجمالي الطلاب</span>
                           <span className="text-2xl font-black font-header text-slate-800">{students.length} طالب</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 pr-6">
                        <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
                           <CheckCircle2 size={24} />
                        </div>
                        <div>
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">الحاضرين (مؤقتاً)</span>
                           <span className="text-2xl font-black font-header text-emerald-600">{presentCount}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 pr-6">
                        <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500">
                           <AlertCircle size={24} />
                        </div>
                        <div>
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">المتغيبين (مؤقتاً)</span>
                           <span className="text-2xl font-black font-header text-rose-500">{absentCount}</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-[2rem] shadow-xl group">
                    <Eye size={20} className="text-indigo-400 group-hover:scale-110 transition-transform" />
                    <span className="font-header font-black text-sm">وضع الرصد التفاعلي مفعل</span>
                </div>
            </div>

            {/* ── Studio Settings Panel ── */}
            {showSettings && (
                <div className="luxury-card p-10 bg-white/80 backdrop-blur-xl border-white print:hidden animate-in fade-in slide-in-from-top-4 duration-500 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
                    
                    <div className="flex justify-between items-center mb-10 relative z-10">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-100">
                              <SlidersHorizontal size={24} />
                           </div>
                           <div>
                              <h3 className="text-2xl font-black text-slate-900 font-header tracking-tight">ستوديو كشوف الحضور</h3>
                              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">تخصيص القالب والهوامش لإخراج كشوف توقيع احترافية</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="flex items-center gap-3 bg-slate-50 px-6 py-4 rounded-[1.5rem] border border-slate-100">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">السعة لكل صفحة:</label>
                                <input 
                                    type="number" value={config.maxRows}
                                    onChange={(e) => handleConfigChange('maxRows', null, e.target.value)}
                                    className="w-12 bg-white border-none text-center font-black text-indigo-600 focus:ring-0 outline-none p-0"
                                />
                            </div>
                            <button onClick={() => setShowSettings(false)} className="p-4 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-2xl transition-all">
                               <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
                        {['headerCommittee', 'headerGrade', 'headerCount'].map((field) => (
                           <div key={field} className="space-y-6 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100/30">
                                <div className="flex justify-between items-center border-b border-slate-200/50 pb-4 mb-2">
                                    <h4 className="font-black text-xs text-slate-700 uppercase tracking-tight">{field === 'headerCommittee' ? 'رقم اللجنة' : field === 'headerGrade' ? 'الصف الدراسي' : 'إجمالي الطلاب'}</h4>
                                    <button 
                                        onClick={() => handleConfigChange(field, 'show', null, !config[field].show)}
                                        className={`w-10 h-6 rounded-full transition-all flex items-center px-1 ${config[field].show ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                    >
                                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${config[field].show ? 'translate-x-[16px]' : 'translate-x-0'}`} />
                                    </button>
                                </div>
                                <div className={`space-y-4 ${!config[field].show ? 'opacity-20 grayscale pointer-events-none' : ''}`}>
                                    <div className="space-y-2">
                                        <div className="flex justify-between px-1"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">تنسيق رأسي</span><span className="text-[10px] font-black text-indigo-600">{config[field].top}%</span></div>
                                        <input type="range" min="0" max="100" step="0.5" value={config[field].top} onChange={(e) => handleConfigChange(field, 'top', e.target.value)} className="premium-range" />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between px-1"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">تنسيق أفقي</span><span className="text-[10px] font-black text-indigo-600">{config[field].right}%</span></div>
                                        <input type="range" min="0" max="100" step="0.5" value={config[field].right} onChange={(e) => handleConfigChange(field, 'right', e.target.value)} className="premium-range" />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between px-1"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">حجم الخط</span><span className="text-[10px] font-black text-emerald-600">{config[field].fontSize}</span></div>
                                        <input type="range" min="0.5" max="3" step="0.1" value={config[field].fontSize} onChange={(e) => handleConfigChange(field, 'fontSize', e.target.value)} className="premium-range-success" />
                                    </div>
                                </div>
                           </div>
                        ))}

                        <div className="space-y-6 bg-indigo-600 text-white p-6 rounded-[2rem] shadow-xl shadow-indigo-100 flex flex-col justify-between">
                            <h4 className="font-black text-xs uppercase tracking-[0.2em] border-b border-white/20 pb-4">هيكل الجدول الأساسي</h4>
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <div className="flex justify-between px-1"><span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">بداية الجدول</span><span className="text-[10px] font-black text-white">{config.table.startTop}%</span></div>
                                    <input type="range" min="0" max="100" step="0.5" value={config.table.startTop} onChange={(e) => handleConfigChange('table', 'startTop', e.target.value)} className="premium-range-white" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between px-1"><span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">ارتفاع الفقرات</span><span className="text-[10px] font-black text-white">{config.table.rowHeight}%</span></div>
                                    <input type="range" min="1" max="10" step="0.1" value={config.table.rowHeight} onChange={(e) => handleConfigChange('table', 'rowHeight', e.target.value)} className="premium-range-white" />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between px-1"><span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">حجم خط البيانات</span><span className="text-[10px] font-black text-white">{config.table.fontSize}rem</span></div>
                                    <input type="range" min="0.5" max="2" step="0.05" value={config.table.fontSize} onChange={(e) => handleConfigChange('table', 'fontSize', e.target.value)} className="premium-range-white" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                        <button 
                            onClick={() => {
                                if (
                                    confirm(
                                        'استعادة مواضع القالب الافتراضية (attendance_template.jpeg)؟'
                                    )
                                ) {
                                    const next = {
                                        ...appConfig,
                                        attendance: resolveAttendanceConfig(null),
                                    };
                                    saveAppSettings(next).then(() => {
                                        setAppConfig(next);
                                        alert('تم استعادة الإعدادات الافتراضية');
                                    });
                                }
                            }}
                            className="text-xs font-black text-rose-400 hover:text-rose-600 px-6 py-3 hover:bg-rose-50 rounded-2xl transition-all flex items-center gap-2 border border-dashed border-rose-100"
                        >
                            <RotateCcw size={14} /> استعادة القالب الافتراضي
                        </button>
                    </div>
                </div>
            )}

            {/* ── Studio Canvas (A4 Preview) ── */}
            <div className="flex flex-col items-center gap-12 pt-4 bg-slate-200/30 rounded-[3rem] p-10 print:bg-white print:p-0 print:rounded-none">
                <div className="flex items-center gap-4 self-start print:hidden">
                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400 border border-slate-100">
                        <UserCircle2 size={18} />
                    </div>
                    <h2 className="text-xl font-black text-slate-900 font-header">معاينة كشوف التوقيع الرسمية (A4)</h2>
                    <div className="h-6 w-[2px] bg-slate-200 mx-2"></div>
                    <span className="px-4 py-1.5 bg-white text-[10px] font-black text-slate-400 border border-slate-100 rounded-full tracking-[0.2em] shadow-sm uppercase">Attendance Grid Engine</span>
                </div>

                <div className="w-full flex flex-col items-center gap-12 print:block">
                    {loading ? (
                        <div className="luxury-card py-40 w-full text-center bg-white shadow-premium">
                             <RotateCcw size={48} className="animate-spin mb-4 text-indigo-200 mx-auto" />
                             <p className="font-black text-slate-400 uppercase tracking-widest text-xs">توليد مساقط الكشوف...</p>
                        </div>
                    ) : pagesData.length === 0 ? (
                        <div className="luxury-card py-40 w-full text-center bg-white shadow-premium opacity-50">
                             <AlertCircle size={48} className="mx-auto mb-4 text-slate-200" />
                             <p className="font-black text-slate-400 tracking-widest text-xs uppercase">لا يوجد طلاب متوفرين لتوليد الكشوف حالياً</p>
                        </div>
                    ) : pagesData.map((page) => (
                        <div
                            key={page.id}
                            className="page-to-print relative bg-white shadow-[0_30px_90px_rgba(0,0,0,0.15)] mx-auto border border-white group/page transition-all duration-700 print:shadow-none print:border-none print:m-0"
                            style={{
                                width: '210mm',
                                height: '297mm',
                                pageBreakAfter: 'always',
                                overflow: 'hidden'
                            }}
                        >
                            <img
                                src={ATTENDANCE_TEMPLATE}
                                alt="قالب كشف توقيع الطلاب"
                                crossOrigin="anonymous"
                                className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none"
                                draggable={false}
                            />
                            {/* Headers Text Fields */}
                            {config.headerCommittee.show && (
                                <div 
                                    className="absolute font-black text-slate-900 w-auto text-right font-header z-10"
                                    style={{ top: `${config.headerCommittee.top}%`, right: `${config.headerCommittee.right}%`, fontSize: `${config.headerCommittee.fontSize}rem`, transform: 'translateY(-50%)' }}
                                >
                                    {formatCommitteeDisplay(page.committee)}
                                </div>
                            )}
                            {config.headerGrade.show && (
                                <div 
                                    className="absolute font-black text-slate-900 w-auto text-center font-header z-10"
                                    style={{ top: `${config.headerGrade.top}%`, right: `${config.headerGrade.right}%`, fontSize: `${config.headerGrade.fontSize}rem`, transform: 'translateY(-50%) translateX(50%)' }}
                                >
                                    {page.grade}
                                </div>
                            )}
                            {config.headerCount.show && (
                                <div 
                                    className="absolute font-black text-slate-900 w-auto text-center font-header z-10"
                                    style={{ top: `${config.headerCount.top}%`, right: `${config.headerCount.right}%`, fontSize: `${config.headerCount.fontSize}rem`, transform: 'translateY(-50%) translateX(50%)' }}
                                >
                                    {page.totalCount}
                                </div>
                            )}

                            {/* Table Layout Engine */}
                            <div 
                                className="absolute w-full h-full font-black text-slate-900 z-10"
                                style={{ top: `${config.table.startTop}%`, fontSize: `${config.table.fontSize}rem` }}
                            >
                                {page.students.map((student, idx) => {
                                    const rowOverride = config.table.rowOverrides[idx] || {};
                                    const rowTop = rowOverride.top || 0;
                                    const rowRight = rowOverride.right || 0;
                                    const rowFont = rowOverride.fontSize || 0;
                                    const rowStyle = { fontSize: `${config.table.fontSize + rowFont}rem` };

                                    return (
                                        <React.Fragment key={student.id}>
                                            {/* Index Column */}
                                            {config.table.indexShow && (
                                                <div className="absolute text-center whitespace-nowrap leading-none"
                                                    style={{ 
                                                        ...rowStyle,
                                                        top: `calc(${idx * config.table.rowHeight}% + ${config.table.indexTop + rowTop}%)`, 
                                                        right: `${config.table.indexRight + rowRight}%`, 
                                                        transform: 'translateX(50%)' 
                                                    }}
                                                >
                                                    {page.globalStartIndex + idx + 1}
                                                </div>
                                            )}
                                            {/* OMR Column */}
                                            {config.table.omrShow && (
                                                <div className="absolute text-center whitespace-nowrap leading-none"
                                                    style={{ 
                                                        ...rowStyle,
                                                        top: `calc(${idx * config.table.rowHeight}% + ${config.table.omrTop + rowTop}%)`, 
                                                        right: `${config.table.omrRight + rowRight}%`, 
                                                        transform: 'translateX(50%)' 
                                                    }}
                                                >
                                                    {student.id}
                                                </div>
                                            )}
                                            {/* Seat Number Column */}
                                            {config.table.seatShow && (
                                                <div className="absolute text-center whitespace-nowrap leading-none"
                                                    style={{ 
                                                        ...rowStyle,
                                                        top: `calc(${idx * config.table.rowHeight}% + ${config.table.seatTop + rowTop}%)`, 
                                                        right: `${config.table.seatRight + rowRight}%`, 
                                                        transform: 'translateX(50%)' 
                                                    }}
                                                >
                                                    {student.seatNumber}
                                                </div>
                                            )}
                                            {/* Name Column */}
                                            {config.table.nameShow && (
                                                <div className="absolute text-right whitespace-nowrap leading-none"
                                                    style={{ 
                                                        ...rowStyle,
                                                        top: `calc(${idx * config.table.rowHeight}% + ${config.table.nameTop + rowTop}%)`, 
                                                        right: `${config.table.nameRight + rowRight}%` 
                                                    }}
                                                >
                                                    {student.name}
                                                </div>
                                            )}
                                            {/* Grade Column */}
                                            {config.table.gradeShow && (
                                                <div className="absolute text-center whitespace-nowrap leading-none"
                                                    style={{ 
                                                        ...rowStyle,
                                                        top: `calc(${idx * config.table.rowHeight}% + ${config.table.gradeTop + rowTop}%)`, 
                                                        right: `${config.table.gradeRight + rowRight}%`, 
                                                        transform: 'translateX(50%)' 
                                                    }}
                                                >
                                                    {student.grade}
                                                </div>
                                            )}

                                            {/* Interactive Attendance Check (Print Hidden) */}
                                            {config.table.signatureShow && (
                                                <div className="absolute text-center whitespace-nowrap print:hidden z-20 flex items-center justify-center p-2"
                                                    style={{ 
                                                        ...rowStyle,
                                                        top: `calc(${idx * config.table.rowHeight}% + ${config.table.signatureTop + rowTop}%)`, 
                                                        right: `${config.table.signatureRight + rowRight}%`, 
                                                        transform: 'translateX(50%) translateY(-25%)' 
                                                    }}
                                                >
                                                    <button
                                                        onClick={() => toggleAttendance(student.id)}
                                                        className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all border
                                                          ${attendanceData[student.id] 
                                                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-lg shadow-emerald-100' 
                                                            : 'bg-white text-slate-200 border-slate-100 hover:text-emerald-500 hover:border-emerald-200 shadow-sm'}`}
                                                    >
                                                        <CheckCircle2 size={24} />
                                                    </button>
                                                </div>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <style>{`
                .premium-range { -webkit-appearance: none; width: 100%; height: 5px; background: #e2e8f0; border-radius: 5px; outline: none; transition: all .2s; }
                .premium-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; background: #4f46e5; border-radius: 50%; cursor: pointer; border: 2.5px solid white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
                .premium-range-success::-webkit-slider-thumb { background: #10b981; }
                .premium-range-white::-webkit-slider-thumb { background: white; border-color: #4f46e5; }

                @media print {
                    @page { size: A4 portrait; margin: 0; }
                    body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    aside, footer, nav, header, select, button, .print-hidden, .luxury-card { display: none !important; }
                    main { padding: 0 !important; margin: 0 !important; }
                    .page-to-print { width: 210mm !important; height: 297mm !important; page-break-after: always; box-shadow: none !important; margin: 0 !important; }
                }
            `}</style>
        </div>
    );
};

export default Attendance;
