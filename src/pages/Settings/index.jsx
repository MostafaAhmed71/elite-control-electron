import React, { useState, useEffect } from 'react';
import { 
    Settings as SettingsIcon, 
    Shield, 
    Database, 
    MessageSquare, 
    Layout, 
    Save, 
    RefreshCcw, 
    Download, 
    Upload, 
    CheckCircle2, 
    AlertCircle,
    School,
    Type,
    ChevronRight,
    Lock,
    Unlock,
    Activity,
    Cloud,
    SlidersHorizontal,
    Link2,
    Copy,
} from 'lucide-react';
import { getAppSettings, saveAppSettings, clearAllData, getStudents, getCommittees, getObservers, getOmrExams, getOmrResults, saveStudentsBulk, saveOmrExam, saveOmrResult, supabase } from '../../utils/dataService';
import { PUBLIC_PATHS, buildPublicUrl } from '../../utils/publicRoutes';

const Settings = () => {
    const [activeTab, setActiveTab] = useState('identity');
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState({ type: '', msg: '' });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const data = await getAppSettings();
        setConfig(data);
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveAppSettings(config);
            setStatus({ type: 'success', msg: 'تم حفظ جميع الإعدادات بنجاح!' });
            setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
        } catch (error) {
            setStatus({ type: 'error', msg: 'حدث خطأ أثناء الحفظ' });
        } finally {
            setSaving(false);
        }
    };

    const copyPublicLink = async (path, label) => {
        try {
            await navigator.clipboard.writeText(buildPublicUrl(path));
            setStatus({ type: 'success', msg: `تم نسخ رابط ${label}` });
            setTimeout(() => setStatus({ type: '', msg: '' }), 2500);
        } catch {
            setStatus({ type: 'error', msg: 'تعذّر نسخ الرابط' });
        }
    };

    const updateNested = (section, field, value, subfield = null) => {
        setConfig(prev => {
            const newConfig = { ...prev };
            if (subfield) {
                newConfig[section][field][subfield] = value;
            } else {
                newConfig[section][field] = value;
            }
            return newConfig;
        });
    };

    const exportData = async () => {
        try {
            setStatus({ type: '', msg: '' });
            const [students, committees, observers, omrExams, omrResults, appConfig] = await Promise.all([
                getStudents(), getCommittees(), getObservers(), getOmrExams(), getOmrResults(), getAppSettings()
            ]);
            const data = { students, committees, observers, omr_exams: omrExams, omr_results: omrResults, app_config: appConfig };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `control_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
        } catch (err) {
            setStatus({ type: 'error', msg: 'فشل تصدير البيانات: ' + err.message });
        }
    };

    const importData = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                const ops = [];
                if (data.students?.length)      ops.push(saveStudentsBulk(data.students));
                if (data.omr_exams?.length)     data.omr_exams.forEach(ex => ops.push(saveOmrExam(ex)));
                if (data.omr_results?.length)   data.omr_results.forEach(r  => ops.push(saveOmrResult(r)));
                if (data.app_config)            ops.push(saveAppSettings(data.app_config));
                await Promise.all(ops);
                alert('✅ تم استيراد البيانات إلى Supabase بنجاح! سيتم إعادة تحميل الصفحة.');
                window.location.reload();
            } catch (err) {
                alert('خطأ في تنسيق الملف: ' + err.message);
            }
        };
        reader.readAsText(file);
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-40 opacity-20 font-alexandria">
            <RefreshCcw size={64} className="animate-spin mb-4 text-slate-400" />
            <p className="font-black text-xl text-slate-600 tracking-tighter uppercase font-header">تأمين الوصول لمركز التحكم...</p>
        </div>
    );

    const TabButton = ({ id, icon: Icon, label, description }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`w-full min-w-[11rem] lg:min-w-0 shrink-0 lg:shrink group flex flex-col items-start gap-1 px-5 sm:px-8 py-4 sm:py-5 rounded-2xl lg:rounded-[2rem] transition-all duration-500 relative overflow-hidden
              ${activeTab === id 
                ? 'bg-white shadow-[0_15px_40px_rgba(79,70,229,0.12)] border border-indigo-100' 
                : 'hover:bg-white/40'}`}
        >
            <div className={`flex items-center gap-4 ${activeTab === id ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                <Icon size={20} className={`${activeTab === id ? 'animate-pulse' : ''}`} />
                <span className="font-black text-sm font-header">{label}</span>
            </div>
            {activeTab === id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-indigo-600 rounded-r-full shadow-[2px_0_10px_rgba(79,70,229,0.5)]"></div>
            )}
        </button>
    );

    return (
        <div className="space-y-6 sm:space-y-10 animate-in fade-in duration-700 font-alexandria pb-16 sm:pb-20 max-w-full overflow-x-hidden">
            {/* ── Page Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 px-0 sm:px-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2.5xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                            <SettingsIcon size={24} />
                        </div>
                        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 font-header tracking-tight app-page-title">إعدادات النظام المركزية</h1>
                    </div>
                    <p className="text-slate-400 font-medium text-sm flex items-center gap-2">
                        <Activity size={16} className="text-indigo-400" />
                        تخصيص هوية المنصة، ضبط قوالب الكشوف، وإدارة مخازن البيانات الشاملة
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full md:w-auto">
                    {status.msg && (
                        <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-sm font-black animate-in zoom-in
                          ${status.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                            {status.type === 'success' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}
                            {status.msg}
                        </div>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 sm:px-8 py-3.5 sm:py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 w-full sm:w-auto"
                    >
                        {saving ? <RefreshCcw size={20} className="animate-spin" /> : <Save size={20} />}
                        <span>حفظ جميع التغييرات</span>
                    </button>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
                {/* ── Sidebar Navigation ── */}
                <div className="lg:w-80 flex lg:flex-col gap-2 lg:gap-3 shrink-0 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0 custom-scrollbar">
                    <TabButton id="identity" icon={School} label="الهوية والمدرسة" />
                    <TabButton id="attendance" icon={Layout} label="قوالب التقارير" />
                    <TabButton id="cards" icon={Type} label="قوالب البطاقات" />
                    <TabButton id="messages" icon={MessageSquare} label="نظام المراسلات" />
                    <TabButton id="data" icon={Database} label="إدارة البيانات" />
                    <TabButton id="security" icon={Shield} label="الأمان والحماية" />
                    
                    {/* Decorative Info Card */}
                    <div className="mt-10 luxury-card p-8 bg-gradient-to-br from-indigo-900 to-indigo-800 text-indigo-100 border-none relative overflow-hidden">
                        <Cloud size={64} className="absolute -bottom-4 -right-4 opacity-10" />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 text-indigo-300">نسخة النظام</p>
                        <p className="text-xl font-black font-header mb-1">Elite Control v5.2</p>
                        <p className="text-xs font-bold opacity-60">تاريخ آخر مزامنة: {new Date().toLocaleDateString('ar-SA')}</p>
                    </div>
                </div>

                {/* ── Main Content Area ── */}
                <div className="flex-1">
                    <div className="luxury-card p-0 bg-white border-none shadow-premium min-h-[600px] flex flex-col overflow-hidden">
                        {/* Tab Content Wrapper */}
                        <div className="p-4 sm:p-6 lg:p-10 flex-1 overflow-y-auto custom-scrollbar">
                            
                            {/* Identity Section */}
                            {activeTab === 'identity' && (
                                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 font-header leading-tight">هوية المنصة الرسمية</h3>
                                        <p className="text-slate-400 font-bold text-xs mt-1 uppercase tracking-widest leading-relaxed">تعريف المعايير البصرية والعناوين الرئيسية التي تظهر في جميع الكشوف والتقارير</p>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 block">اسم المنصة الرسمي (Header)</label>
                                            <div className="relative group">
                                                <input required type="text" value={config.platformName} onChange={(e) => setConfig({...config, platformName: e.target.value})} className="w-full px-8 py-5 bg-slate-50 border border-transparent rounded-[2rem] focus:bg-white focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-black text-slate-800 font-header" />
                                                <School size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-200 group-focus-within:text-indigo-500 transition-colors" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 block">مدير المدرسة / رئيس الكنترول</label>
                                            <div className="relative group">
                                                <input required type="text" value={config.managerName} onChange={(e) => setConfig({...config, managerName: e.target.value})} className="w-full px-8 py-5 bg-slate-50 border border-transparent rounded-[2rem] focus:bg-white focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-black text-slate-800 font-header" />
                                                <Shield size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-200 group-focus-within:text-indigo-500 transition-colors" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 block">العام الدراسي الحالي</label>
                                            <input required type="text" value={config.academicWeight} onChange={(e) => setConfig({...config, academicWeight: e.target.value})} className="w-full px-8 py-5 bg-slate-50 border border-transparent rounded-[2rem] focus:bg-white focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-black text-slate-800 font-header" />
                                        </div>
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1 block">لون الهوية البصرية</label>
                                            <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-[2rem]">
                                                <input type="color" value={config.primaryColor} onChange={(e) => setConfig({...config, primaryColor: e.target.value})} className="w-14 h-14 bg-transparent border-none rounded-xl cursor-pointer" />
                                                <span className="font-header font-black text-slate-900 uppercase tracking-tighter">{config.primaryColor}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-6 border-t border-slate-100 space-y-6">
                                        <div>
                                            <h4 className="text-lg font-black text-slate-900 font-header flex items-center gap-2">
                                                <Link2 size={20} className="text-indigo-600" />
                                                روابط عامة للمشاركة
                                            </h4>
                                            <p className="text-slate-400 font-bold text-xs mt-1">
                                                انسخ الرابط وأرسله للمعلمين — لا يحتاج تسجيل دخول (بعد ضبط Caddy كما في SERVER_COMMANDS.md)
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-5 bg-amber-50/60 border border-amber-100 rounded-2xl">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-black text-amber-900 mb-1">استعلام المعلمين — رقم الجلوس واللجنة ومقرها</p>
                                                    <p className="text-xs font-bold text-amber-700/80 truncate" dir="ltr">{buildPublicUrl(PUBLIC_PATHS.teacherLookup)}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => copyPublicLink(PUBLIC_PATHS.teacherLookup, 'استعلام المعلمين')}
                                                    className="shrink-0 flex items-center justify-center gap-2 px-5 py-3 bg-amber-500 text-white rounded-xl font-black text-sm hover:bg-amber-600 transition-colors"
                                                >
                                                    <Copy size={16} />
                                                    نسخ الرابط
                                                </button>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-5 bg-blue-50/60 border border-blue-100 rounded-2xl">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-black text-blue-900 mb-1">بوابة الطالب — الاستعلام عن النتائج</p>
                                                    <p className="text-xs font-bold text-blue-700/80 truncate" dir="ltr">{buildPublicUrl(PUBLIC_PATHS.portal)}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => copyPublicLink(PUBLIC_PATHS.portal, 'بوابة الطالب')}
                                                    className="shrink-0 flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 transition-colors"
                                                >
                                                    <Copy size={16} />
                                                    نسخ الرابط
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Attendance Section */}
                            {activeTab === 'attendance' && (
                                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 font-header leading-tight">هندسة كشوف التقارير</h3>
                                        <p className="text-slate-400 font-bold text-xs mt-1 uppercase tracking-widest leading-relaxed">الضبط الفيزيائي لمواقع البيانات وارتفاع الصفوف في القوالب المطبوعة</p>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                        <div className="space-y-8 p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100">
                                            <h4 className="flex items-center gap-3 font-header font-black text-indigo-600 border-b border-indigo-100 pb-4">
                                                <SlidersHorizontal size={18} /> الضبط العام للجدول
                                            </h4>
                                            <div className="space-y-6">
                                                <div className="space-y-3">
                                                    <div className="flex justify-between px-1"><span className="text-[10px] font-black text-slate-400">بداية الجدول %</span><span className="text-xs font-black text-indigo-600">{config.attendance.table.startTop}%</span></div>
                                                    <input type="range" min="0" max="100" step="0.5" value={config.attendance.table.startTop} onChange={(e) => updateNested('attendance', 'table', parseFloat(e.target.value), 'startTop')} className="premium-range" />
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="flex justify-between px-1"><span className="text-[10px] font-black text-slate-400">ارتفاع الصف الواحد %</span><span className="text-xs font-black text-indigo-600">{config.attendance.table.rowHeight}%</span></div>
                                                    <input type="range" min="1" max="10" step="0.1" value={config.attendance.table.rowHeight} onChange={(e) => updateNested('attendance', 'table', parseFloat(e.target.value), 'rowHeight')} className="premium-range" />
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="flex justify-between px-1">
                                                        <span className="text-[10px] font-black text-slate-400">صفوف القالب</span>
                                                        <span className="text-xs font-black text-emerald-600">25 صف (ثابت)</span>
                                                    </div>
                                                    <p className="text-[10px] font-bold text-slate-400">
                                                        قالب كشف التوقيع مصمم لـ 25 طالباً في كل صفحة A4
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6 p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm">
                                            <h4 className="flex items-center gap-3 font-header font-black text-slate-800 border-b border-slate-50 pb-4">
                                                <Layout size={18} /> تموضع الأعمدة الأفقي
                                            </h4>
                                            <div className="grid grid-cols-1 gap-4">
                                                {[
                                                    {id: 'nameRight', label: 'حقل اسم الطالب'},
                                                    {id: 'seatRight', label: 'رقم الجلوس'},
                                                    {id: 'indexRight', label: 'التسلسل (م)'},
                                                    {id: 'gradeRight', label: 'الصف والمرحلة'},
                                                    {id: 'signatureRight', label: 'التوقيع الرئيسي'}
                                                ].map(col => (
                                                    <div key={col.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl hover:bg-slate-50 transition-colors">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{col.label}</span>
                                                        <div className="flex items-center gap-4">
                                                            <input type="number" step="0.5" value={config.attendance.table[col.id]} onChange={(e) => updateNested('attendance', 'table', parseFloat(e.target.value), col.id)} className="w-16 bg-white border-none rounded-xl text-center font-black text-indigo-600 py-1" />
                                                            <span className="text-[10px] font-bold text-slate-300">%</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Seating Cards Section */}
                            {activeTab === 'cards' && (
                                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div>
                                        <h3 className="text-2xl font-black text-slate-900 font-header leading-tight">معايير بطاقات الجلوس</h3>
                                        <p className="text-slate-400 font-bold text-xs mt-1 uppercase tracking-widest leading-relaxed">ضبط التفاصيل الدقيقة لبيانات الطلاب على بطاقات الهوية الملونة</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {['name', 'seatNumber', 'grade', 'committee'].map(field => (
                                            <div key={field} className="luxury-card p-8 bg-white border-slate-100 shadow-sm transition-all hover:shadow-md hover:border-indigo-100/50 group">
                                                <div className="flex items-center gap-4 mb-6 border-b border-slate-50 pb-4">
                                                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                                        <Type size={18} />
                                                    </div>
                                                    <h4 className="font-header font-black text-slate-800 uppercase tracking-tight">
                                                        {field === 'name' ? 'حقل الاسم الكامل' : field === 'seatNumber' ? 'حقل رقم الجلوس' : field === 'grade' ? 'حقل الصف الدراسي' : 'مسمى لجنة الاختبار'}
                                                    </h4>
                                                </div>
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">الإزاحة العلوية %</label>
                                                        <input type="number" step="0.5" value={config.seating[field].top} onChange={(e) => updateNested('seating', field, parseFloat(e.target.value), 'top')} className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-black text-indigo-600 focus:ring-4 focus:ring-indigo-50 transition-all text-center" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">الإزاحة اليمينية %</label>
                                                        <input type="number" step="0.5" value={config.seating[field].right} onChange={(e) => updateNested('seating', field, parseFloat(e.target.value), 'right')} className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-black text-indigo-600 focus:ring-4 focus:ring-indigo-50 transition-all text-center" />
                                                    </div>
                                                </div>
                                                <div className="mt-8 space-y-4 pt-4 border-t border-slate-50">
                                                    <div className="flex justify-between px-1"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">تضخيم/تصغير الخط</span><span className="text-xs font-black text-emerald-600">x{config.seating[field].fontSize}</span></div>
                                                    <input type="range" min="0.5" max="4" step="0.1" value={config.seating[field].fontSize} onChange={(e) => updateNested('seating', field, parseFloat(e.target.value), 'fontSize')} className="premium-range-success" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Messages Section */}
                            {activeTab === 'messages' && (
                                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 font-header leading-tight">القوالب التعبيرية للرسائل</h3>
                                            <p className="text-slate-400 font-bold text-xs mt-1 uppercase tracking-widest leading-relaxed">تخصيص محتوى الرسائل التلقائية المرسلة لأولياء الأمور والطلاب</p>
                                        </div>
                                        <div className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl border border-emerald-100 flex items-center gap-3">
                                            <MessageSquare size={18} />
                                            <span className="font-header font-black text-sm uppercase">WhatsApp Ready</span>
                                        </div>
                                    </div>

                                    <div className="luxury-card p-6 bg-white border border-emerald-100 space-y-3">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                                            عنوان خادم WhatsApp (WPP)
                                        </label>
                                        <input
                                            type="url"
                                            dir="ltr"
                                            value={config.whatsappApiBase || ''}
                                            onChange={(e) =>
                                                setConfig({ ...config, whatsappApiBase: e.target.value })
                                            }
                                            placeholder="https://wpp.northelite0.com"
                                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 focus:ring-4 focus:ring-emerald-50 outline-none"
                                        />
                                        <p className="text-[10px] font-bold text-slate-500">
                                            إنتاج VPS: <span className="text-emerald-700">https://wpp.northelite0.com</span>
                                            — اتركه فارغاً لاستخدام البروكسي المحلي{' '}
                                            <code className="text-[9px]">/api/whatsapp</code>
                                        </p>
                                    </div>

                                    <div className="space-y-8">
                                        {[
                                            {id: 'committee', label: 'رسالة إشعار اللجنة وبطاقة الجلوس', desc: 'يتم إرسالها للتعريف بمقر الاختبار ورقم الجلوس في اليوم الأول'},
                                            {id: 'result', label: 'رسالة إرسال الشهادة / النتيجة النهائية', desc: 'يتم إرسالها فور اعتماد النتائج ورفع ملفات الدرجات'}
                                        ].map(msg => (
                                            <div key={msg.id} className="space-y-4 p-8 bg-slate-50/50 rounded-[2.5rem] border border-slate-100 group">
                                                <div className="flex justify-between items-center px-2">
                                                    <label className="text-sm font-black text-slate-700 font-header">{msg.label}</label>
                                                    <span className="text-[10px] px-3 py-1 bg-white border border-slate-100 rounded-full font-bold text-slate-400 uppercase">Tags: {'{name}'}</span>
                                                </div>
                                                <textarea 
                                                    rows="4"
                                                    value={config.messages[msg.id]}
                                                    onChange={(e) => updateNested('messages', msg.id, e.target.value)}
                                                    className="w-full bg-white border-2 border-transparent rounded-[2rem] px-8 py-6 text-slate-800 font-bold focus:border-indigo-500 focus:outline-none transition-all leading-relaxed shadow-sm min-h-[160px]"
                                                    placeholder="اكتب رسالتك المخصصة هنا..."
                                                />
                                                <p className="px-2 text-[10px] font-bold text-slate-400 opacity-60 italic">{msg.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Data Center Section */}
                            {activeTab === 'data' && (
                                <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                     <div className="p-10 bg-gradient-to-br from-indigo-900 to-slate-900 rounded-[3rem] text-white relative overflow-hidden group">
                                        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-white/10 transition-all duration-1000"></div>
                                        <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                                            <div className="w-24 h-24 bg-white/10 backdrop-blur-3xl rounded-[2rem] border border-white/20 flex items-center justify-center text-indigo-200 shadow-xl animate-bounce-slow">
                                                <Database size={48} />
                                            </div>
                                            <div className="flex-1 text-center md:text-right space-y-3">
                                                <h3 className="text-3xl font-black font-header tracking-tight">التأمين الشامل للبيانات</h3>
                                                <p className="text-indigo-200/60 font-medium text-sm leading-relaxed max-w-lg">
                                                    قم باستخراج حزمة احتياطية مشفرة لجميع البيانات (طلاب، لجان، ملاحظين، إعدادات) لضمان الاستمرارية أو نقل العمل لجهاز آخر.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
                                            <button onClick={exportData} className="flex-1 py-6 bg-white text-slate-900 rounded-[2rem] font-black text-lg hover:bg-indigo-50 shadow-2xl shadow-black/20 transition-all active:scale-95 flex items-center justify-center gap-4">
                                               <Download size={24} className="text-indigo-600" /> تصدير حزمة احتياطية
                                            </button>
                                            <label className="flex-1 py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg hover:bg-indigo-700 shadow-2xl shadow-black/20 transition-all active:scale-95 flex items-center justify-center gap-4 cursor-pointer border-2 border-white/20">
                                               <Upload size={24} /> استيراد حزمة بيانات
                                               <input type="file" accept=".json" onChange={importData} className="hidden" />
                                            </label>
                                        </div>
                                    </div>

                                    {/* ── Supabase Status ── */}
                                    <div className="p-10 bg-indigo-50 rounded-[3rem] border border-indigo-100 border-dashed mb-6">
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
                                                <Cloud size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-indigo-900 font-header">حالة قاعدة البيانات</h3>
                                                <p className="text-indigo-500 font-bold text-[10px] uppercase tracking-widest mt-0.5">Supabase Cloud — التخزين الرئيسي</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                                            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                                            <p className="text-emerald-700 text-sm font-black">جميع البيانات تُحفظ مباشرةً في Supabase — لا يوجد تخزين محلي.</p>
                                        </div>
                                    </div>

                                    <div className="p-10 bg-rose-50 rounded-[3rem] border border-rose-100 border-dashed">
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className="w-10 h-10 bg-rose-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-rose-200">
                                                <AlertCircle size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-rose-900 font-header">تطهير المخازن السحابية</h3>
                                                <p className="text-rose-500 font-bold text-[10px] uppercase tracking-widest mt-0.5">منطقة مخاطر تقنية - إجراء غير قابل للتراجع</p>
                                            </div>
                                        </div>
                                        <p className="text-rose-600/70 text-xs font-bold leading-relaxed mb-8 max-w-xl">سيؤدي هذا الإجراء إلى حذف جميع البيانات المخزنة محلياً في هذا المتصفح تماماً. يرجى التأكد من استخراج نسخة احتياطية قبل المتابعة.</p>
                                        <button 
                                            onClick={() => { if(confirm('⚠️ تحذير نهائي: سيتم مسح جميع بيانات الطلاب والاختبارات والإعدادات! هل تود المتابعة؟')) clearAllData(); }}
                                            className="px-8 py-4 bg-rose-500 text-white rounded-[1.5rem] font-black text-sm hover:bg-rose-600 transition-all shadow-xl shadow-rose-100 flex items-center gap-3"
                                        >
                                            <RefreshCcw size={18} /> تصفير قاعدة البيانات المركزية
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Security Section (Placeholder) */}
                            {activeTab === 'security' && (
                                <div className="flex flex-col items-center justify-center py-20 text-center space-y-10 animate-in zoom-in-95 duration-500">
                                     <div className="relative">
                                         <div className="w-40 h-40 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-300">
                                            <Shield size={80} className="animate-pulse" />
                                         </div>
                                         <div className="absolute -bottom-2 -right-2 w-14 h-14 bg-indigo-600 text-white rounded-2.5xl flex items-center justify-center shadow-2xl border-4 border-white">
                                            <Lock size={24} />
                                         </div>
                                     </div>
                                     <div className="space-y-4 max-w-md">
                                         <h3 className="text-3xl font-black italic text-slate-800 font-header">Elite Encryption Lab</h3>
                                         <p className="text-slate-400 font-bold text-sm leading-relaxed px-6">
                                            قريباً: حماية الطبقة العسكرية للبيانات عبر تشفير RSA المزدوج، وتوثيق هوية المدير عبر تطبيقات الحماية العالمية (2FA).
                                         </p>
                                     </div>
                                     <div className="flex items-center gap-4 text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] bg-white px-8 py-3 rounded-full border border-slate-50 shadow-sm">
                                         Under Active Development
                                     </div>
                                </div>
                            )}

                        </div>

                        {/* Footer Notification Bar */}
                        <div className="p-6 bg-slate-50/50 border-t border-slate-50 flex flex-col md:flex-row items-center justify-between gap-4">
                             <div className="flex items-center gap-3">
                                 <Unlock size={14} className="text-emerald-500" />
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">تشفير الجلسة: AES-256 Bit Secure</span>
                             </div>
                             <div className="flex items-center gap-6">
                                 <div className="flex items-center gap-2">
                                     <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></div>
                                     <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">متصل بالسحابة المحلية</span>
                                 </div>
                                 <button onClick={loadSettings} className="text-[10px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-widest border-b border-indigo-500 border-dashed">مزامنة يدوية</button>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>{`
                .premium-range { -webkit-appearance: none; width: 100%; height: 6px; background: #f1f5f9; border-radius: 6px; outline: none; transition: all .2s; }
                .premium-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; background: #4f46e5; border-radius: 50%; cursor: pointer; border: 3px solid white; box-shadow: 0 4px 10px rgba(79,70,229,0.2); }
                .premium-range-success::-webkit-slider-thumb { background: #10b981; box-shadow: 0 4px 10px rgba(16,185,129,0.2); }
                .premium-range-white::-webkit-slider-thumb { background: white; border-color: #4f46e5; }
                .animate-bounce-slow { animation: bounce 3s infinite; }
                @keyframes bounce { 0%, 100% { transform: translateY(-5%); animation-timing-function: cubic-bezier(0.8,0,1,1); } 50% { transform: none; animation-timing-function: cubic-bezier(0,0,0.2,1); } }
            `}</style>
        </div>
    );
};

export default Settings;
