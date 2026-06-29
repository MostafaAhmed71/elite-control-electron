import React, { useState } from 'react';
import { ImageIcon, Upload, Download, RefreshCw, CheckCircle2, AlertCircle, FileStack, ImagePlus, ChevronRight, X, UserCircle2, ShieldCheck, Zap } from 'lucide-react';

const PhotoRenamer = () => {
    const [files, setFiles] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState(null);

    const handleFileUpload = (e) => {
        const uploadedFiles = Array.from(e.target.files);
        setFiles(prev => [...prev, ...uploadedFiles]);
        setResult(null);
    };

    const processPhotos = () => {
        setIsProcessing(true);
        // Simulate processing logic
        setTimeout(() => {
            setIsProcessing(false);
            setResult({
                total: files.length,
                renamed: files.length,
                errors: 0
            });
        }, 2000);
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-alexandria pb-20">
            {/* ── Page Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2.5xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                            <ImageIcon size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">محرك أرشفة الصور اليافع</h1>
                    </div>
                    <p className="text-slate-400 font-medium text-sm flex items-center gap-2">
                        <ShieldCheck size={16} className="text-indigo-400" />
                        نظام ذكي لمطابقة صور الطلاب بقاعدة البيانات وإعادة تسميتها برمز الجلوس في ثوانٍ
                    </p>
                </div>

                {files.length > 0 && !result && (
                    <button
                        onClick={processPhotos}
                        disabled={isProcessing}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 flex items-center gap-3 disabled:opacity-50"
                    >
                        {isProcessing ? <RefreshCw size={20} className="animate-spin" /> : <Zap size={20} />}
                        <span>{isProcessing ? 'جاري المعالجة الرقمية...' : 'بدء معالجة الصور المختارة'}</span>
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-8">
                    {/* ── Upload Hub ── */}
                    <div className="luxury-card p-1 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                        
                        <div className="relative z-10 p-16 border-2 border-dashed border-slate-200 rounded-[2.5rem] bg-white/60 backdrop-blur-xl flex flex-col items-center justify-center text-center space-y-6 hover:border-indigo-400/50 transition-all duration-500 overflow-hidden">
                            <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform duration-700 shadow-sm border border-indigo-100/50">
                                <ImagePlus size={40} />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-slate-800 font-header">مركز رفع الصور الجماعي</h3>
                                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">قم بسحب ملفات الصور هنا أو انقر للاستعراض</p>
                            </div>
                            <div className="flex items-center gap-4 text-[10px] font-black text-slate-300 uppercase tracking-tight">
                                <span>PNG</span> <span className="w-1 h-1 bg-slate-200 rounded-full"></span> <span>JPG</span> <span className="w-1 h-1 bg-slate-200 rounded-full"></span> <span>WebP</span>
                            </div>
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={handleFileUpload}
                            />
                        </div>
                    </div>

                    {/* ── Files List Preview ── */}
                    {files.length > 0 && (
                        <div className="luxury-card p-0 overflow-hidden bg-white border-none shadow-premium animate-in slide-in-from-bottom-8 duration-700">
                            <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 font-black">
                                       <FileStack size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-header font-black text-slate-800">قائمة الانتظار الرقمية</h3>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{files.length} صورة تم تجهيزها للأرشفة</p>
                                    </div>
                                </div>
                                <button onClick={() => setFiles([])} className="px-6 py-2 bg-rose-50 text-rose-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">إفراغ الحاويات</button>
                            </div>
                            <div className="p-8 max-h-[400px] overflow-y-auto grid grid-cols-2 md:grid-cols-4 gap-4 custom-scrollbar">
                                {files.map((file, i) => (
                                    <div key={i} className="group relative bg-slate-50/50 border border-slate-100 rounded-2xl p-4 transition-all hover:bg-white hover:shadow-md">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-300 group-hover:text-indigo-500 transition-colors">
                                                <ImageIcon size={24} />
                                            </div>
                                            <div className="text-center w-full">
                                                <p className="text-[10px] font-black text-slate-600 truncate px-2">{file.name}</p>
                                                <p className="text-[8px] font-bold text-slate-300 mt-1 uppercase tracking-widest">{(file.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Logic & Status Sidebar ── */}
                <div className="space-y-10">
                    <div className="luxury-card p-10 bg-slate-900 border-none relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                        <h3 className="text-xl font-black text-white font-header mb-8 relative z-10 flex items-center gap-3">
                           <Zap size={20} className="text-indigo-400" /> بروتوكول العمل
                        </h3>
                        <div className="space-y-10 relative z-10">
                            {[
                                { step: '01', title: 'تحميل الكتلة الصور', desc: 'ارفع جميع صور الطلاب بصيغ JPG أو PNG دفعة واحدة.' },
                                { step: '02', title: 'التحليل التوافقي', desc: 'يقوم المحرك بمطابقة وجوه الطلاب/أسمائهم مع سجلات الجلوس.' },
                                { step: '03', title: 'الأرشفة الرقمية', desc: 'يتم استخراج ملف ZIP يحتوي على جميع الصور بالأسماء الصحيحة.' }
                            ].map((item, idx) => (
                                <div key={idx} className="flex gap-6 group/step">
                                    <span className="text-2xl font-black text-indigo-500/30 group-hover/step:text-indigo-400 transition-colors leading-none pt-1">{item.step}</span>
                                    <div className="space-y-1.5">
                                        <h4 className="font-header font-black text-indigo-100 text-sm">{item.title}</h4>
                                        <p className="text-slate-500 font-medium text-xs leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {result && (
                        <div className="luxury-card p-0 overflow-hidden bg-emerald-500 border-none shadow-xl shadow-emerald-100 animate-in zoom-in-95 duration-500">
                            <div className="p-10 text-white space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center shadow-inner">
                                        <CheckCircle2 size={32} />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black font-header tracking-tight">اكتملت المعالجة بنجاح</h3>
                                        <p className="text-emerald-100 font-bold text-[10px] uppercase tracking-widest mt-0.5">تمت أرشفة جميع الملفات المرفقة</p>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-white/10 w-full"></div>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-white/10 p-4 rounded-2xl backdrop-blur-md">
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-80">إحصائية الملفات</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl font-black font-header">{(result.renamed / result.total * 100).toFixed(0)}%</span>
                                            <span className="text-[10px] font-bold opacity-60">Accuracy</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-center">
                                        <div className="bg-white/5 py-3 rounded-2xl border border-white/10">
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">المعالجة</p>
                                            <p className="text-lg font-black font-header">{result.renamed}</p>
                                        </div>
                                        <div className="bg-white/5 py-3 rounded-2xl border border-white/10">
                                            <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mb-1">الأخطاء</p>
                                            <p className="text-lg font-black font-header">{result.errors}</p>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        const blob = new Blob(["Simulated ZIP content"], { type: "application/zip" });
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = "renamed_student_photos.zip";
                                        a.click();
                                    }}
                                    className="w-full py-5 bg-white text-emerald-600 rounded-[2rem] font-black text-lg hover:bg-emerald-50 transition-all shadow-xl shadow-black/10 active:scale-95 flex items-center justify-center gap-4"
                                >
                                    <Download size={24} /> تحميل الأرشيف (ZIP)
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PhotoRenamer;
