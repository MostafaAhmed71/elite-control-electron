import React, { useState, useEffect } from 'react';
import { MapPin, Building, Search, X, Plus, Edit2, Trash2, Download, Upload, Map as MapIcon, Navigation, Layers, CheckCircle2 } from 'lucide-react';
import { getLocations, saveLocation, deleteLocation } from '../../utils/dataService';

const CommitteeLocations = () => {
    const [locations, setLocations] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const data = await getLocations();
        setLocations(data);
        setLoading(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {
            id: editingLocation?.id,
            committee: formData.get('committee'),
            building: formData.get('building'),
            floor: formData.get('floor'),
            room: formData.get('room'),
            capacity: parseInt(formData.get('capacity')),
        };
        await saveLocation(data);
        setIsModalOpen(false);
        setEditingLocation(null);
        fetchData();
    };

    const handleDelete = async (id) => {
        if (window.confirm('هل أنت متأكد من حذف هذا الموقع؟')) {
            await deleteLocation(id);
            fetchData();
        }
    };

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(locations));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "locations.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-alexandria pb-20">
            {/* ── Page Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2.5xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                            <MapIcon size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">تخطيط أماكن اللجان</h1>
                    </div>
                    <p className="text-slate-400 font-medium text-sm flex items-center gap-2">
                        <Navigation size={16} className="text-indigo-400" />
                        تعريف المواقع الجغرافية، المباني، والقاعات الدراسية المخصصة للاختبارات
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExport}
                        className="px-6 py-4 bg-white text-slate-600 rounded-3xl font-black text-sm hover:bg-slate-50 transition-all shadow-sm border border-slate-100 flex items-center gap-3"
                    >
                        <Download size={20} className="text-indigo-500" /> تصدير الخريطة
                    </button>
                    <button
                        onClick={() => { setEditingLocation(null); setIsModalOpen(true); }}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 flex items-center gap-3"
                    >
                        <Plus size={20} /> إضافة قاعة جديدة
                    </button>
                </div>
            </div>

            {/* ── Visual Grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-2">
                
                {/* Visual Map/Hero Card */}
                <div className="luxury-card p-10 bg-gradient-to-br from-indigo-900 to-slate-900 text-white border-none shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl group-hover:bg-indigo-500/20 transition-all duration-1000"></div>
                    <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-8 h-full min-h-[400px]">
                        <div className="w-32 h-32 bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 flex items-center justify-center text-white shadow-inner animate-pulse">
                            <Building size={64} className="opacity-80" />
                        </div>
                        <div className="space-y-3">
                            <h3 className="text-3xl font-black font-header tracking-tight">خريطة المنشآت الذكية</h3>
                            <p className="text-indigo-200/80 font-medium text-sm max-w-sm mx-auto leading-relaxed">
                                قم برفع مسقط أفقي للمنشأة أو خريطة طوارئ لسهولة توجيه المراقبين والطلاب إلى قاعاتهم في اليوم الأول.
                            </p>
                        </div>
                        <button
                            onClick={() => alert('ميزة خرائط المباني (Building Maps) ستكون متاحة في التحديث القادم')}
                            className="flex items-center gap-3 px-10 py-5 bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 text-white rounded-[2rem] transition-all font-black text-sm group/btn"
                        >
                            <Upload size={20} className="group-hover/btn:-translate-y-1 transition-transform" />
                            <span>رفع مخطط المبنى</span>
                        </button>
                    </div>
                    {/* Decorative Map Grid overlay */}
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none"></div>
                </div>

                {/* Locations Explorer */}
                <div className="luxury-card p-0 flex flex-col bg-white border-none shadow-premium overflow-hidden">
                    <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                           <Layers size={20} className="text-indigo-500" />
                           <h3 className="font-black text-slate-800 font-header">مستكشف القاعات</h3>
                        </div>
                        <div className="relative">
                           <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                           <input type="text" placeholder="بحث سريع..." className="pr-10 pl-4 py-2 bg-white border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-50/50" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar max-h-[500px]">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-40 opacity-20">
                                <Layers size={48} className="animate-pulse mb-2" />
                            </div>
                        ) : locations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-40 space-y-4 opacity-40">
                                <MapPin size={48} className="text-slate-200" />
                                <p className="font-black text-slate-400 uppercase tracking-widest text-xs">لم يتم تعريف أي قاعات بعد</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {locations.map((loc) => (
                                    <div key={loc.id} className="p-8 hover:bg-indigo-50/30 transition-all flex justify-between items-center group relative">
                                        <div className="space-y-3 relative z-10">
                                            <div className="flex items-center gap-3">
                                                <h4 className="text-xl font-black text-slate-800 font-header">{loc.committee}</h4>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                                    <button
                                                        onClick={() => { setEditingLocation(loc); setIsModalOpen(true); }}
                                                        className="p-2 bg-white text-indigo-600 rounded-xl hover:bg-slate-900 hover:text-white transition-all shadow-sm border border-slate-100"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(loc.id)}
                                                        className="p-2 bg-white text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm border border-slate-100"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                <span className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-full"><Building size={14} className="text-indigo-400" /> {loc.building}</span>
                                                <span className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-full"><MapPin size={14} className="text-violet-400" /> الدور: {loc.floor}</span>
                                            </div>
                                        </div>
                                        <div className="text-right space-y-1 relative z-10">
                                            <div className="px-4 py-2 bg-indigo-600/5 text-indigo-600 rounded-2xl border border-indigo-100">
                                                <span className="text-lg font-black font-header tracking-tight">غرفة {loc.room}</span>
                                            </div>
                                            <div className="text-[10px] font-black text-slate-400 flex items-center justify-end gap-1 opacity-60">
                                                <Users size={12} />
                                                <span>السعة: {loc.capacity} طلاب</span>
                                            </div>
                                        </div>
                                        {/* Decorative side accent */}
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Location Modal ── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border-none relative">
                        <div className="absolute top-0 right-0 w-full h-1.5 bg-gradient-to-l from-indigo-500 via-violet-500 to-indigo-500"></div>

                        <div className="p-10 pb-6 border-b border-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 font-header leading-tight">
                                    {editingLocation ? 'تعديل مكان اللجنة' : 'إضافة موقع لجنة جديد'}
                                </h3>
                                <p className="text-slate-400 font-medium text-xs mt-1">حدد التوزيع الجغرافي للجنة داخل مباني المدرسة</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-4 bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-2xl transition-all shadow-sm">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-10 space-y-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">اللجنة المستهدفة</label>
                                <input required name="committee" defaultValue={editingLocation?.committee} placeholder="مثال: لجنة رقم ١" className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800 transition-all font-header" />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">المبنى / الجناح</label>
                                    <input required name="building" defaultValue={editingLocation?.building} placeholder="مثال: المبنى أ" className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800 transition-all font-header text-center" />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">رقم الدور الدراسي</label>
                                    <input required name="floor" defaultValue={editingLocation?.floor} placeholder="مثال: الأرضي" className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800 transition-all font-header text-center" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">رقم/اسم الغرفة</label>
                                    <input required name="room" defaultValue={editingLocation?.room} className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800 transition-all font-header text-center" />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">السعة الاستيعابية</label>
                                    <input required type="number" name="capacity" defaultValue={editingLocation?.capacity} className="w-full px-6 py-4 bg-slate-50 border border-transparent rounded-2.5xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800 transition-all font-header text-center" />
                                </div>
                            </div>

                            <div className="flex gap-4 mt-6">
                                <button type="submit" className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg hover:bg-indigo-700 shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all">تحديث الموقع</button>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-10 py-5 bg-slate-100 text-slate-500 rounded-3xl font-black hover:bg-slate-200 transition-all text-lg">إلغاء</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CommitteeLocations;
