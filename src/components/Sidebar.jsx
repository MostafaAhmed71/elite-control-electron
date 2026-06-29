import React from 'react';
import {
    Users,
    UserCheck,
    ClipboardList,
    Printer,
    CreditCard,
    UsersRound,
    Settings,
    LayoutDashboard,
    ScanLine,
    FileText,
    Trophy,
    Send,
    LogOut,
    RefreshCcw,
    GraduationCap,
    Palette,
    ShieldCheck,
    ChevronLeft,
    PanelRightClose,
    Menu,
    Sparkles,
    Activity,
    ClipboardCheck,
    Table2,
    Clock,
    BookMarked,
    SlidersHorizontal,
} from 'lucide-react';

import { NavLink } from 'react-router-dom';
import { getAppSettings } from '../utils/dataService';

const Sidebar = ({ activeSystem, onSwitchSystem, open = true, onToggle, onRequestClose, isOverlay = false }) => {
    const [config, setConfig] = React.useState(null);

    React.useEffect(() => {
        getAppSettings().then(setConfig);
    }, []);

    const allMenuItems = [
        { name: 'لوحة التحكم', path: '/', icon: <LayoutDashboard size={18} />, system: 'common' },
        
        // Grading System
        { name: 'قائمة الطلاب', path: '/students', icon: <Users size={18} />, system: 'common' },
        { name: 'تصحيح الـ OMR', path: '/omr-scanner', icon: <ScanLine size={18} />, system: 'grading' },
        { name: 'إدارة الاختبارات', path: '/omr-exams', icon: <FileText size={18} />, system: 'grading' },
        { name: 'كشف المعتمدين', path: '/approved-results', icon: <ClipboardCheck size={18} />, system: 'grading' },
        { name: 'كشف درجات مجمع', path: '/aggregated-grades', icon: <Table2 size={18} />, system: 'grading' },
        { name: 'الاختبارات الوهمية', path: '/mock-exams', icon: <Trophy size={18} />, system: 'grading' },
        { name: 'مصمم القوالب', path: '/omr-designer', icon: <Palette size={18} />, system: 'grading' },
        { name: 'أيقونة الرصد', path: '/grade-recording', icon: <Trophy size={18} />, system: 'grading' },
        { name: 'مركز الإشعارات', path: '/notifier', icon: <Send size={18} />, system: 'common' },
        
        // Control System
        { name: 'أرقام الجلوس', path: '/seating-cards', icon: <CreditCard size={18} />, system: 'control' },
        { name: 'إدارة اللجان', path: '/committees', icon: <UsersRound size={18} />, system: 'control' },
        { name: 'ضبط قالب كشف اللجان', path: '/committee-roster-studio', icon: <SlidersHorizontal size={18} />, system: 'control' },
        { name: 'فترات الاختبار', path: '/exam-periods', icon: <Clock size={18} />, system: 'control' },
        { name: 'طباعة الكشوف', path: '/print-sheets', icon: <Printer size={18} />, system: 'control' },
        { name: 'أغلفة', path: '/covers', icon: <BookMarked size={18} />, system: 'control' },
        { name: 'إدارة المعلمين', path: '/observers', icon: <UserCheck size={18} />, system: 'control' },
        { name: 'توزيع الملاحظين', path: '/committee-observers', icon: <UserCheck size={18} />, system: 'control' },
        { name: 'كشوف الملاحظين', path: '/observer-sheets', icon: <ClipboardList size={18} />, system: 'control' },
        
        { name: 'إعدادات النظام', path: '/settings', icon: <Settings size={18} />, system: 'common' },
    ];

    const menuItems = allMenuItems.filter(item => item.system === 'common' || item.system === activeSystem);

    const isGrading = activeSystem === 'grading';

    const handleNavClick = () => {
        if (isOverlay) onRequestClose?.();
    };

    return (
        <>
            {isOverlay && open && (
                <button
                    type="button"
                    onClick={onRequestClose || onToggle}
                    className="fixed inset-0 z-[99] bg-slate-900/45 backdrop-blur-[2px] lg:hidden"
                    aria-label="إغلاق القائمة"
                />
            )}

            {!open && (
                <button
                    type="button"
                    onClick={onToggle}
                    className="fixed top-20 sm:top-24 right-0 z-[101] flex items-center gap-2 py-2.5 sm:py-3 pl-2 pr-3 bg-slate-900 text-white rounded-l-2xl shadow-xl hover:bg-indigo-600 transition-colors font-black text-xs"
                    aria-label="فتح القائمة"
                >
                    <Menu size={18} />
                    <span className="hidden sm:inline">القائمة</span>
                </button>
            )}

            <aside
                className={`fixed top-0 right-0 z-[100] w-[min(100vw-3rem,16rem)] sm:w-64 h-[100dvh] flex flex-col font-alexandria overflow-hidden bg-white border-l border-slate-100/80 shadow-[2px_0_40px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-in-out ${
                    open ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                }`}
            >
            <button
                type="button"
                onClick={onToggle}
                className="absolute left-3 top-3 z-20 p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                aria-label="إخفاء القائمة"
                title="إخفاء القائمة"
            >
                <PanelRightClose size={18} />
            </button>

            {/* ── Background Decals ── */}
            <div className="absolute top-0 right-0 w-full h-[600px] bg-gradient-to-b from-indigo-50/20 to-transparent pointer-events-none"></div>
            
            <div className="px-4 sm:px-6 py-8 sm:py-10 pt-14 overflow-y-auto custom-scrollbar flex-1 relative z-10">
                {/* ── Premium Branding Section ── */}
                <div className="flex flex-col items-center mb-8 px-2 group animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div className={`relative w-16 h-16 mb-4 flex items-center justify-center transition-all duration-700 group-hover:scale-110`}>
                        <div className={`absolute inset-0 ${isGrading ? 'bg-indigo-600' : 'bg-slate-800'} rounded-[1.8rem] shadow-2xl ${isGrading ? 'shadow-indigo-200' : 'shadow-slate-200'} rotate-3 group-hover:rotate-12 transition-transform duration-500`}></div>
                        <div className={`absolute inset-0 bg-white opacity-10 rounded-[1.8rem] scale-90`}></div>
                        <div className="relative z-10 text-white">
                           {isGrading ? <GraduationCap size={32} strokeWidth={1.5} /> : <ShieldCheck size={32} strokeWidth={1.5} />}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-2xl shadow-lg border border-slate-50 flex items-center justify-center text-indigo-600 animate-bounce-slow">
                           <Sparkles size={16} />
                        </div>
                    </div>
                    
                    <div className="text-center">
                        <h2 className="text-xl font-black text-slate-900 tracking-tight font-header leading-tight">نخبة الشمال</h2>
                        <div className="flex items-center gap-2 mt-1.5 px-3 py-1 bg-slate-50 border border-slate-100 rounded-full">
                            <Activity size={12} className={isGrading ? 'text-indigo-500' : 'text-slate-600'} />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{isGrading ? 'نظام الرصد الذكي' : 'نظام الكنترول'}</span>
                        </div>
                    </div>
                </div>

                {/* ── Navigation Menu ── */}
                <nav className="space-y-4">
                    <div className="px-4 mb-4">
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">الملاحة الرئيسية</span>
                    </div>
                    
                    <ul className="space-y-1.5">
                        {menuItems.map((item, index) => (
                            <li key={item.path} 
                                style={{ animationDelay: `${index * 50}ms` }} 
                                className="animate-in fade-in slide-in-from-right-4 duration-500 fill-mode-forwards"
                            >
                                <NavLink
                                    to={item.path}
                                    onClick={handleNavClick}
                                    className={({ isActive }) =>
                                        `group relative flex items-center p-3.5 rounded-2xl transition-all duration-500
                                        ${isActive
                                            ? isGrading 
                                                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' 
                                                : 'bg-slate-900 text-white shadow-xl shadow-slate-100 scale-[1.02]'
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            <div className={`flex items-center justify-center transition-all duration-500 ${isActive ? 'scale-110' : 'opacity-40 group-hover:opacity-100'}`}>
                                                {item.icon}
                                            </div>
                                            <span className={`mr-4 text-sm font-black tracking-tight ${isActive ? 'font-header' : 'font-medium'}`}>
                                                {item.name}
                                            </span>
                                            
                                            {isActive && (
                                                <div className="mr-auto">
                                                   <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_white]"></div>
                                                </div>
                                            )}
                                            
                                            {!isActive && (
                                                <ChevronLeft size={14} className="mr-auto opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-slate-300" />
                                            )}
                                        </>
                                    )}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>

            {/* ── Bottom Section & System Switcher ── */}
            <div className="p-4 sm:p-8 border-t border-slate-50 bg-slate-50/30 relative z-20">
                <button 
                    onClick={() => {
                        handleNavClick();
                        onSwitchSystem();
                    }}
                    className="w-full relative group overflow-hidden"
                >
                    <div className="absolute inset-0 bg-white border border-slate-100 rounded-[2rem] transition-all duration-500 group-hover:border-indigo-200 group-hover:shadow-lg group-active:scale-95 shadow-sm"></div>
                    <div className="relative z-10 flex items-center justify-center gap-4 py-5 px-6">
                        <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:rotate-180 transition-all duration-700">
                           <RefreshCcw size={18} />
                        </div>
                        <div className="text-right flex-1">
                            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">تغيير البيئة</p>
                            <p className="text-[11px] font-black text-slate-700">تبديل النظام الذكي</p>
                        </div>
                    </div>
                </button>
                
                <div className="mt-8 flex items-center justify-center gap-3 opacity-30">
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.5em]">Elite Engine</span>
                </div>
            </div>
            
            <style>{`
               .animate-bounce-slow { animation: bounce 4s infinite; }
               @keyframes bounce { 0%, 100% { transform: translateY(-10%); } 50% { transform: none; } }
            `}</style>
        </aside>
        </>
    );
};

export default Sidebar;
