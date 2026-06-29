import React, { useState } from 'react';
import { X, Save, Upload, Plus, Trash2, GripVertical, Image as ImageIcon, Link2 } from 'lucide-react';
import { saveAppSettings } from '../utils/dataService';
import {
    COVER_STAGES,
    createCoverTemplateId,
    fileToCoverImage,
    slugifyFieldKey,
    upsertCoverTemplate,
} from '../utils/coverTemplates';
import {
    COVER_DATA_SOURCES,
    bindingId,
    getBindingMeta,
    parseBindingId,
} from '../utils/coverDataSources';

const CoverTemplateForm = ({ appConfig, template, stage: defaultStage, onClose, onSaved }) => {
    const isEdit = Boolean(template?.id);
    const [name, setName] = useState(template?.name || '');
    const [description, setDescription] = useState(template?.description || '');
    const [stage, setStage] = useState(template?.stage || defaultStage || 'secondary');
    const [imageSrc, setImageSrc] = useState(template?.template || '');
    const [width, setWidth] = useState(template?.width || 864);
    const [height, setHeight] = useState(template?.height || 1222);
    const [fields, setFields] = useState(
        template?.fields?.length ? template.fields.map((f) => ({ ...f })) : []
    );
    const [pickSource, setPickSource] = useState(COVER_DATA_SOURCES[0]?.id || 'committees');
    const [pickField, setPickField] = useState('');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const usedBindings = new Set(fields.map((f) => f.binding).filter(Boolean));

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('يرجى اختيار ملف صورة (JPEG أو PNG)');
            return;
        }
        setUploading(true);
        try {
            const { dataUrl, width: w, height: h } = await fileToCoverImage(file);
            setImageSrc(dataUrl);
            setWidth(w);
            setHeight(h);
        } catch (err) {
            console.error(err);
            alert('تعذّر رفع الصورة.');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const addBindingField = () => {
        if (!pickField) return;
        const binding = bindingId(pickSource, pickField);
        if (usedBindings.has(binding)) {
            alert('هذا الحقل مضاف مسبقاً');
            return;
        }
        const meta = getBindingMeta(binding);
        const keys = fields.map((f) => f.key);
        const { fieldId } = parseBindingId(binding);
        setFields((prev) => [
            ...prev,
            {
                key: slugifyFieldKey(fieldId, keys),
                label: meta.fieldLabel,
                binding,
                color: '#0f172a',
            },
        ]);
        setPickField('');
    };

    const updateField = (index, patch) => {
        setFields((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], ...patch };
            return next;
        });
    };

    const removeField = (index) => {
        setFields((prev) => prev.filter((_, i) => i !== index));
    };

    const moveField = (index, dir) => {
        const j = index + dir;
        if (j < 0 || j >= fields.length) return;
        setFields((prev) => {
            const next = [...prev];
            [next[index], next[j]] = [next[j], next[index]];
            return next;
        });
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert('أدخل اسم الغلاف');
            return;
        }
        if (!imageSrc) {
            alert('ارفع صورة القالب');
            return;
        }
        if (fields.length === 0) {
            alert('أضف حقلاً واحداً على الأقل من مصادر البيانات');
            return;
        }
        for (const f of fields) {
            if (!f.binding) {
                alert('كل الحقول يجب أن تكون مربوطة ببيانات من النظام');
                return;
            }
        }

        setSaving(true);
        try {
            const id = template?.id || createCoverTemplateId();
            const item = {
                id,
                name: name.trim(),
                description: description.trim(),
                stage,
                template: imageSrc,
                width,
                height,
                fields: fields.map((f) => ({
                    key: f.key,
                    label: f.label?.trim() || getBindingMeta(f.binding).fieldLabel,
                    binding: f.binding,
                    color: f.color || '#0f172a',
                })),
                createdAt: template?.createdAt,
            };
            const next = upsertCoverTemplate(appConfig, item, !isEdit);
            await saveAppSettings(next);
            onSaved?.(next);
            onClose();
        } catch (err) {
            console.error(err);
            alert('فشل الحفظ. تحقق من الاتصال.');
        } finally {
            setSaving(false);
        }
    };

    const sourceDef = COVER_DATA_SOURCES.find((s) => s.id === pickSource);
    const availableFields = (sourceDef?.fields || []).filter(
        (f) => !usedBindings.has(bindingId(pickSource, f.id))
    );

    return (
        <div
            className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm font-alexandria"
            dir="rtl"
        >
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">
                            {isEdit ? 'تعديل الغلاف' : 'إنشاء غلاف جديد'}
                        </h2>
                        <p className="text-xs text-slate-400 font-bold mt-1">
                            اختر حقولاً من اللجان، الكشوف، الطلاب، أو الإعدادات — بيانات حقيقية عند الطباعة
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-50 text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="block space-y-1">
                            <span className="text-xs font-black text-slate-500">اسم الغلاف</span>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                            />
                        </label>
                        <label className="block space-y-1">
                            <span className="text-xs font-black text-slate-500">المرحلة</span>
                            <select
                                value={stage}
                                onChange={(e) => setStage(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold"
                            >
                                {Object.values(COVER_STAGES).map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <label className="block space-y-1">
                        <span className="text-xs font-black text-slate-500">وصف (اختياري)</span>
                        <input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 font-bold text-sm"
                        />
                    </label>

                    <div className="space-y-3">
                        <span className="text-xs font-black text-slate-500">صورة القالب</span>
                        <label className="flex flex-col sm:flex-row gap-4 items-center p-6 border-2 border-dashed border-indigo-200 rounded-2xl cursor-pointer hover:bg-indigo-50/40">
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleImageUpload}
                            />
                            {imageSrc ? (
                                <img
                                    src={imageSrc}
                                    alt=""
                                    className="max-h-40 rounded-lg border object-contain"
                                />
                            ) : (
                                <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl">
                                    <ImageIcon size={32} />
                                </div>
                            )}
                            <div className="flex-1 text-center sm:text-right">
                                <p className="font-black text-slate-800">
                                    {uploading ? 'جاري الرفع...' : 'رفع صورة الغلاف'}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {width}×{height} px
                                </p>
                            </div>
                        </label>
                    </div>

                    <div className="space-y-3 p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                        <p className="text-xs font-black text-indigo-800 flex items-center gap-2">
                            <Link2 size={14} />
                            إضافة حقل من بيانات النظام
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <select
                                value={pickSource}
                                onChange={(e) => {
                                    setPickSource(e.target.value);
                                    setPickField('');
                                }}
                                className="px-3 py-2.5 rounded-xl border font-bold text-sm bg-white"
                            >
                                {COVER_DATA_SOURCES.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={pickField}
                                onChange={(e) => setPickField(e.target.value)}
                                className="px-3 py-2.5 rounded-xl border font-bold text-sm bg-white sm:col-span-2"
                            >
                                <option value="">— اختر الحقل —</option>
                                {availableFields.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={addBindingField}
                            disabled={!pickField}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            <Plus size={16} />
                            إضافة للقالب
                        </button>
                    </div>

                    <div className="space-y-2">
                        {fields.map((f, i) => {
                            const meta = f.binding ? getBindingMeta(f.binding) : null;
                            return (
                                <div
                                    key={`${f.key}-${i}`}
                                    className="flex flex-wrap gap-2 items-center p-3 bg-slate-50 rounded-xl border"
                                >
                                    <GripVertical size={16} className="text-slate-300" />
                                    <div className="flex-1 min-w-[140px]">
                                        <p className="text-sm font-black text-slate-800">{f.label}</p>
                                        <p className="text-[10px] text-indigo-600 font-bold">
                                            {meta?.label || f.binding}
                                        </p>
                                    </div>
                                    <input
                                        type="color"
                                        value={f.color}
                                        onChange={(e) => updateField(i, { color: e.target.value })}
                                        className="w-10 h-9 rounded cursor-pointer"
                                    />
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => moveField(i, -1)}
                                            disabled={i === 0}
                                            className="px-2 py-1 text-xs font-black bg-white rounded-lg border disabled:opacity-30"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveField(i, 1)}
                                            disabled={i === fields.length - 1}
                                            className="px-2 py-1 text-xs font-black bg-white rounded-lg border disabled:opacity-30"
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeField(i)}
                                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        {fields.length === 0 && (
                            <p className="text-sm text-slate-400 font-bold text-center py-6">
                                لم تُضف حقول بعد — اختر مصدر البيانات ثم الحقل
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 px-8 py-5 border-t bg-slate-50/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-3 rounded-2xl font-black text-sm border"
                    >
                        إلغاء
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        <Save size={18} />
                        {saving ? 'جاري الحفظ...' : 'حفظ الغلاف'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CoverTemplateForm;
