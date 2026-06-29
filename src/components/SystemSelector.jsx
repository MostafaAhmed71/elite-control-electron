import React from 'react';
import { 
    Users, 
    ScanLine, 
    Trophy, 
    UsersRound, 
    CreditCard, 
    Printer, 
    ChevronLeft,
    GraduationCap,
    LayoutDashboard,
    Sparkles,
    ShieldCheck,
    Zap,
    Cpu,
    Fingerprint
} from 'lucide-react';

const SystemSelector = ({ onSelect }) => {
    return (
        <div className="min-h-screen min-h-[100dvh] bg-[#F1F3F9] flex items-center justify-center p-4 sm:p-6 md:p-12 lg:p-20 relative overflow-hidden font-alexandria" dir="rtl">
            {/* ── Background Aesthetics ── */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-100/30 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-sky-100/30 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl"></div>

            <div className="max-w-7xl w-full space-y-10 sm:space-y-16 lg:space-y-20 relative z-10">
                {/* ── Cinematic Title ── */}
                <div className="text-center space-y-6 animate-in fade-in slide-in-from-top-12 duration-1000">
                    <div className="flex justify-center mb-6">
                        <div className="px-6 py-2 bg-white rounded-full shadow-sm border border-slate-100 flex items-center gap-3">
                            <Sparkles size={16} className="text-indigo-500 animate-pulse" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Smart Education Infrastructure</span>
                        </div>
                    </div>
                    <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-slate-900 tracking-tight font-header leading-tight px-2">
                        منصة <span className="text-indigo-600 underline decoration-indigo-200 underline-offset-8">نخبة الشمال</span> الرقمية
                    </h1>
                    <p className="text-slate-400 text-base sm:text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed px-4">
                        بوابة الوصول الموحدة لنظم إدارة اللجان، التصحيح الآلي، والتحليل الذكي للنتائج الدراسية.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 lg:gap-12">
                    {/* ── Grading System Card ── */}
                    <button 
                        onClick={() => onSelect('grading')}
                        className="group relative bg-white p-6 sm:p-10 lg:p-12 rounded-[2rem] sm:rounded-[3rem] lg:rounded-[4rem] shadow-premium border border-white hover:border-indigo-200 transition-all duration-700 md:hover:-translate-y-4 text-right overflow-hidden flex flex-col justify-between min-h-[380px] sm:min-h-[440px] lg:min-h-[500px]"
                    >
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                        
                        <div className="relative z-10 space-y-8">
                            <div className="flex justify-between items-start">
                                <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center text-white shadow-2xl shadow-indigo-200 group-hover:rotate-6 transition-transform duration-500">
                                    <Cpu size={44} strokeWidth={1.5} />
                                </div>
                                <div className="px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">Core Module A</div>
                            </div>
                            
                            <div className="space-y-4">
                                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 font-header leading-tight group-hover:text-indigo-600 transition-colors">عالم شؤون الطلاب والتصحيح</h2>
                                <p className="text-slate-400 font-bold text-sm sm:text-base lg:text-lg leading-relaxed">
                                    المحرك الذكي لإدارة السجلات، قراءة نماذج OMR، رصد الدرجات النهائية، وتوزيع النتائج عبر القنوات الرقمية.
                                </p>
                            </div>
                        </div>

                        <div className="relative z-10 flex items-center gap-6 pt-10 border-t border-slate-50 mt-10">
                            <div className="flex -space-x-4 space-x-reverse">
                                {[Users, Fingerprint, ScanLine, Trophy].map((Icon, i) => (
                                    <div key={i} className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 group-hover:text-indigo-500 shadow-sm transition-all duration-500 hover:z-20 hover:-translate-y-2">
                                        <Icon size={20} />
                                    </div>
                                ))}
                            </div>
                            <div className="flex-1 h-[2px] bg-slate-50 group-hover:bg-indigo-50 transition-colors"></div>
                            <div className="w-16 h-16 rounded-[2rem] bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-inner">
                                <ChevronLeft size={32} />
                            </div>
                        </div>
                    </button>

                    {/* ── Control System Card ── */}
                    <button 
                        onClick={() => onSelect('control')}
                        className="group relative bg-[#1E293B] p-6 sm:p-10 lg:p-12 rounded-[2rem] sm:rounded-[3rem] lg:rounded-[4rem] shadow-2xl border border-slate-800 hover:border-slate-700 transition-all duration-700 md:hover:-translate-y-4 text-right overflow-hidden flex flex-col justify-between min-h-[380px] sm:min-h-[440px] lg:min-h-[500px]"
                    >
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                        
                        <div className="relative z-10 space-y-8">
                            <div className="flex justify-between items-start">
                                <div className="w-24 h-24 bg-white rounded-[2.5rem] flex items-center justify-center text-slate-900 shadow-2xl group-hover:rotate-6 transition-transform duration-500">
                                    <ShieldCheck size={44} strokeWidth={1.5} />
                                </div>
                                <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Control Module B</div>
                            </div>
                            
                            <div className="space-y-4">
                                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white font-header leading-tight group-hover:text-indigo-400 transition-colors">منظومة كنترول اللجان</h2>
                                <p className="text-slate-400 font-bold text-sm sm:text-base lg:text-lg leading-relaxed">
                                    توزيع لجان الاختبارات، هندسة أرقام الجلوس، رصد الحضور والغياب، وإصدار مسيرات الملاحظين والتقارير التنظيمية.
                                </p>
                            </div>
                        </div>

                        <div className="relative z-10 flex items-center gap-6 pt-10 border-t border-white/5 mt-10">
                            <div className="flex -space-x-4 space-x-reverse">
                                {[Users, UsersRound, CreditCard, Printer].map((Icon, i) => (
                                    <div key={i} className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 group-hover:text-white shadow-sm transition-all duration-500 hover:z-20 hover:-translate-y-2">
                                        <Icon size={20} />
                                    </div>
                                ))}
                            </div>
                            <div className="flex-1 h-[2px] bg-white/5 group-hover:bg-white/10 transition-colors"></div>
                            <div className="w-16 h-16 rounded-[2rem] bg-white/5 flex items-center justify-center text-white group-hover:bg-white group-hover:text-slate-900 transition-all duration-500 shadow-inner">
                                <ChevronLeft size={32} />
                            </div>
                        </div>
                    </button>
                </div>
                
                {/* ── Footer Trust Bar ── */}
                <div className="flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8 py-4 px-6 sm:px-10 bg-white rounded-[2rem] shadow-sm border border-slate-100 text-center">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></div>
                            <span className="text-slate-500 font-black text-xs uppercase tracking-widest">Unified Database Active</span>
                        </div>
                        <div className="h-4 w-[1px] bg-slate-100"></div>
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                            <span className="text-slate-500 font-black text-xs uppercase tracking-widest">RSA 4096 Encryption</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemSelector;
