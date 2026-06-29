import React, { useEffect, useState } from 'react';
import {
    BookMarked,
    SlidersHorizontal,
    Plus,
    Pencil,
    Trash2,
    GraduationCap,
    School,
    Download,
} from 'lucide-react';
import CoverExportDialog from '../../components/CoverExportDialog';
import { getCoverTemplate, resolveCoverLayout } from '../../utils/coverTemplates';
import { getAppSettings, saveAppSettings, getStudents, getCommittees } from '../../utils/dataService';
import CoverPrintPanel from '../../components/CoverPrintPanel';
import {
    COVER_STAGES,
    getCoverTemplatesByStage,
    normalizeCoverConfig,
    removeCoverTemplate,
} from '../../utils/coverTemplates';
import CoverLayoutStudio from '../../components/CoverLayoutStudio';
import CoverTemplateForm from '../../components/CoverTemplateForm';

const stageTabClass = (active) =>
    `flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm transition-all ${
        active
            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
            : 'bg-slate-50 text-slate-600 hover:bg-indigo-50'
    }`;

const Covers = () => {
    const [appConfig, setAppConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeStage, setActiveStage] = useState('secondary');
    const [layoutTemplateId, setLayoutTemplateId] = useState(null);
    const [formState, setFormState] = useState(null);
    const [exportTemplateId, setExportTemplateId] = useState(null);
    const [students, setStudents] = useState([]);
    const [committees, setCommittees] = useState([]);

    const load = () =>
        Promise.all([getAppSettings(), getStudents(), getCommittees()]).then(([cfg, s, c]) => {
            setAppConfig(normalizeCoverConfig(cfg));
            setStudents(s);
            setCommittees(c);
        });

    useEffect(() => {
        load().finally(() => setLoading(false));
    }, []);

    const templates = appConfig ? getCoverTemplatesByStage(appConfig, activeStage) : [];

    const handleDelete = async (t) => {
        if (
            !window.confirm(
                `حذف «${t.name}»؟ سيتم حذف القالب ومواضع النصوص المرتبطة به.`
            )
        ) {
            return;
        }
        try {
            const next = removeCoverTemplate(appConfig, t.id);
            await saveAppSettings(next);
            setAppConfig(next);
        } catch (err) {
            console.error(err);
            alert('تعذّر الحذف.');
        }
    };

    const StageIcon = activeStage === 'middle' ? School : GraduationCap;

    return (
        <div className="p-4 md:p-8 space-y-8 animate-fade-in font-alexandria text-slate-800" dir="rtl">
            <div className="luxury-card p-8 bg-gradient-to-br from-white via-indigo-50/30 to-white border-none">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                        <div className="p-4 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                            <BookMarked size={28} />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black text-slate-900 font-header">
                                أغلفة
                            </h1>
                            <p className="text-slate-500 text-sm mt-2 font-medium max-w-xl leading-relaxed">
                                اربط الحقول ببيانات اللجان والكشوف والطلاب تلقائياً — بدون إدخال يدوي.
                                قوالب منفصلة للمتوسطة والثانوية.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setFormState({ mode: 'create' })}
                        className="flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 shrink-0"
                    >
                        <Plus size={20} />
                        إنشاء غلاف جديد
                    </button>
                </div>
            </div>

            <div className="flex gap-2 p-1 bg-white rounded-[1.25rem] border border-slate-100 shadow-sm">
                <button
                    type="button"
                    onClick={() => setActiveStage('secondary')}
                    className={stageTabClass(activeStage === 'secondary')}
                >
                    <GraduationCap size={18} />
                    {COVER_STAGES.secondary.label}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveStage('middle')}
                    className={stageTabClass(activeStage === 'middle')}
                >
                    <School size={18} />
                    {COVER_STAGES.middle.label}
                </button>
            </div>

            {loading ? (
                <p className="text-center text-slate-400 font-bold py-12">جاري التحميل...</p>
            ) : (
                <section className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <StageIcon size={18} className="text-indigo-600" />
                        <h2 className="text-sm font-black text-slate-600">
                            قوالب {COVER_STAGES[activeStage].label}
                            <span className="text-slate-400 font-bold mr-2">({templates.length})</span>
                        </h2>
                    </div>

                    {templates.length === 0 ? (
                        <div className="luxury-card p-12 text-center border-dashed">
                            <p className="text-slate-500 font-bold mb-4">
                                لا توجد أغلفة لهذه المرحلة بعد
                            </p>
                            <button
                                type="button"
                                onClick={() => setFormState({ mode: 'create' })}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm"
                            >
                                <Plus size={18} />
                                إنشاء أول غلاف
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {templates.map((t) => (
                                <article
                                    key={t.id}
                                    className="luxury-card p-6 flex flex-col gap-4 hover:shadow-lg transition-shadow"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h3 className="text-lg font-black text-slate-900">{t.name}</h3>
                                            {t.description && (
                                                <p className="text-xs text-slate-500 font-medium mt-1">
                                                    {t.description}
                                                </p>
                                            )}
                                            <p className="text-[10px] text-indigo-600 font-black mt-2">
                                                {t.fields?.length || 0} حقول مربوطة — {t.width}×{t.height}
                                            </p>
                                        </div>
                                    </div>

                                    {t.template && (
                                        <div className="rounded-xl overflow-hidden border border-slate-100 bg-slate-50 max-h-44 flex items-center justify-center">
                                            <img
                                                src={t.template}
                                                alt={t.name}
                                                className="max-h-full w-full object-contain"
                                            />
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-1">
                                        {(t.fields || []).slice(0, 5).map((f) => (
                                            <span
                                                key={f.key}
                                                className="text-[10px] font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-lg"
                                                title={f.binding}
                                            >
                                                {f.label}
                                            </span>
                                        ))}
                                        {(t.fields?.length || 0) > 5 && (
                                            <span className="text-[10px] text-slate-400 font-bold">
                                                +{t.fields.length - 5}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-auto grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setLayoutTemplateId(t.id)}
                                            className="col-span-2 flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs hover:bg-indigo-700"
                                        >
                                            <SlidersHorizontal size={16} />
                                            ضبط المعايير
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setExportTemplateId(t.id)}
                                            className="col-span-2 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs hover:bg-emerald-700"
                                        >
                                            <Download size={16} />
                                            تصدير PDF
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormState({ mode: 'edit', template: t })}
                                            className="flex items-center justify-center gap-1 py-3 bg-slate-50 text-slate-700 rounded-xl font-black text-xs hover:bg-slate-100"
                                        >
                                            <Pencil size={14} />
                                            تعديل
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(t)}
                                            className="col-span-2 flex items-center justify-center gap-1 py-3 bg-rose-50 text-rose-600 rounded-xl font-black text-xs hover:bg-rose-100"
                                        >
                                            <Trash2 size={14} />
                                            حذف
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {!loading && appConfig && (
                <CoverPrintPanel appConfig={appConfig} activeStage={activeStage} />
            )}

            {layoutTemplateId && appConfig && (
                <CoverLayoutStudio
                    templateId={layoutTemplateId}
                    appConfig={appConfig}
                    students={students}
                    committees={committees}
                    onClose={() => setLayoutTemplateId(null)}
                    onSaved={(next) => setAppConfig(next)}
                />
            )}

            {exportTemplateId && appConfig && (
                <CoverExportDialog
                    open
                    onClose={() => setExportTemplateId(null)}
                    appConfig={appConfig}
                    template={getCoverTemplate(appConfig, exportTemplateId)}
                    layoutDraft={resolveCoverLayout(appConfig, exportTemplateId)}
                    students={students}
                    committees={committees}
                />
            )}

            {formState && appConfig && (
                <CoverTemplateForm
                    appConfig={appConfig}
                    template={formState.mode === 'edit' ? formState.template : null}
                    stage={formState.mode === 'create' ? activeStage : undefined}
                    onClose={() => setFormState(null)}
                    onSaved={(next) => {
                        setAppConfig(next);
                        setFormState(null);
                    }}
                />
            )}
        </div>
    );
};

export default Covers;
