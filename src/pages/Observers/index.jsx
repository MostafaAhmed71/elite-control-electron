import React, { useState, useEffect } from 'react';
import { UserCheck, Plus, Search, Edit2, Trash2, X, Users, ShieldCheck, UserCircle2 } from 'lucide-react';
import { getObservers, saveObserver, deleteObserver } from '../../utils/dataService';

const Observers = () => {
    const [observers, setObservers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingObserver, setEditingObserver] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const data = await getObservers();
        setObservers(data);
        setLoading(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const name = String(formData.get('name') || '').trim();
        if (!name) {
            alert('أدخل اسم المعلم');
            return;
        }
        await saveObserver({
            id: editingObserver?.id,
            name,
        });
        setIsModalOpen(false);
        setEditingObserver(null);
        fetchData();
    };

    const handleDelete = async (id) => {
        if (window.confirm('هل أنت متأكد من حذف هذا المعلم؟')) {
            await deleteObserver(id);
            fetchData();
        }
    };

    const filteredObservers = observers.filter((o) =>
        String(o.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-10 animate-in fade-in duration-700 font-alexandria pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2.5xl flex items-center justify-center text-white shadow-xl shadow-indigo-100">
                            <Users size={24} />
                        </div>
                        <h1 className="text-3xl font-black text-slate-900 font-header tracking-tight">
                            سجل المعلمين / الملاحظين
                        </h1>
                    </div>
                    <p className="text-slate-400 font-medium text-sm flex items-center gap-2">
                        <ShieldCheck size={16} className="text-indigo-400" />
                        إضافة الأسماء فقط — للاستخدام في توزيع وطباعة كشوف الملاحظين
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        setEditingObserver(null);
                        setIsModalOpen(true);
                    }}
                    className="px-8 py-4 bg-indigo-600 text-white rounded-3xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 flex items-center gap-3"
                >
                    <Plus size={20} />
                    إضافة معلم
                </button>
            </div>

            <div className="luxury-card p-6 bg-white/60 backdrop-blur-xl border-white flex flex-col md:flex-row items-center gap-6">
                <div className="relative flex-1 group">
                    <Search
                        className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors"
                        size={20}
                    />
                    <input
                        type="text"
                        placeholder="ابحث باسم المعلم..."
                        className="w-full pl-16 pr-8 py-5 bg-slate-50 border border-transparent rounded-[2rem] focus:bg-white focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-bold text-slate-700"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <span className="text-xs font-black text-indigo-600 uppercase tracking-widest whitespace-nowrap px-4">
                    العدد: {observers.length}
                </span>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-40 opacity-20">
                    <Users size={64} className="animate-pulse mb-4 text-slate-400" />
                    <p className="font-black text-xl text-slate-600">جاري التحميل...</p>
                </div>
            ) : filteredObservers.length === 0 ? (
                <div className="luxury-card py-40 flex flex-col items-center justify-center space-y-4 opacity-40">
                    <UserCircle2 size={64} className="text-slate-200" />
                    <p className="font-black text-slate-400 text-sm">لا يوجد معلمون</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-2">
                    {filteredObservers.map((observer) => (
                        <div
                            key={observer.id}
                            className="luxury-card group p-5 bg-white border-none shadow-premium hover:-translate-y-1 transition-all flex items-center justify-between gap-3"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-12 h-12 shrink-0 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <UserCheck size={22} />
                                </div>
                                <h3 className="text-lg font-black text-slate-800 truncate">
                                    {observer.name || '—'}
                                </h3>
                            </div>
                            <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingObserver(observer);
                                        setIsModalOpen(true);
                                    }}
                                    className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
                                    title="تعديل الاسم"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(observer.id)}
                                    className="p-2.5 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"
                                    title="حذف"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-full h-1.5 bg-gradient-to-l from-indigo-500 to-violet-500" />

                        <div className="p-8 pb-4 flex items-center justify-between border-b border-slate-50">
                            <h3 className="text-xl font-black text-slate-900 font-header">
                                {editingObserver ? 'تعديل اسم المعلم' : 'إضافة معلم جديد'}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-rose-500"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            <label className="block space-y-2">
                                <span className="text-xs font-black text-slate-500">اسم المعلم</span>
                                <input
                                    required
                                    name="name"
                                    autoFocus
                                    defaultValue={editingObserver?.name}
                                    placeholder="مثال: أحمد محمد العتيبي"
                                    className="w-full px-5 py-4 bg-slate-50 border border-transparent rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 font-black text-slate-800"
                                />
                            </label>

                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700"
                                >
                                    {editingObserver ? 'حفظ' : 'إضافة'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Observers;
