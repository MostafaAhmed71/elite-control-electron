import React, { useEffect, useState } from 'react';
import { Save, SlidersHorizontal, X } from 'lucide-react';
import { saveAppSettings } from '../utils/dataService';
import AttendanceLayoutStudio, { cloneAttendanceConfig } from './AttendanceLayoutStudio';

/**
 * نافذة منبثقة لضبط المواضع (للكشوف الحضور). طباعة الكشوف تستخدم الشاشة المنفصلة.
 */
const AttendanceLayoutEditor = ({ appConfig, onClose, onSaved }) => {
    const [draft, setDraft] = useState(() => cloneAttendanceConfig(appConfig?.attendance));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraft(cloneAttendanceConfig(appConfig?.attendance));
    }, [appConfig]);

    const handleSave = async () => {
        if (!appConfig) return;
        setSaving(true);
        try {
            const next = { ...appConfig, attendance: cloneAttendanceConfig(draft) };
            await saveAppSettings(next);
            onSaved?.(next);
            alert('تم حفظ مواضع كشف التوقيع');
            onClose();
        } catch (err) {
            console.error(err);
            alert('فشل الحفظ. تحقق من الاتصال.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm font-alexandria"
            dir="rtl"
        >
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <SlidersHorizontal size={22} className="text-indigo-600" />
                        <div>
                            <h2 className="text-xl font-black text-slate-900 font-header">
                                ضبط مواضع كشف التوقيع
                            </h2>
                            <p className="text-slate-400 text-xs font-bold mt-0.5">
                                للمعاينة الكاملة مع الطباعة: صفحة طباعة الكشوف → معاينة وضبط
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-3 rounded-2xl bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8">
                    <AttendanceLayoutStudio draft={draft} setDraft={setDraft} />
                </div>

                <div className="flex items-center justify-end gap-3 px-8 py-6 border-t border-slate-100 bg-slate-50/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 rounded-2xl font-black text-sm text-slate-500 hover:bg-white"
                    >
                        إلغاء
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save size={18} />
                        {saving ? 'جاري الحفظ...' : 'حفظ المواضع'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AttendanceLayoutEditor;
