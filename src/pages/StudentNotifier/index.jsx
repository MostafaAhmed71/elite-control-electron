import React, { useState, useEffect, useMemo } from 'react';
import { getStudents, getAppSettings, getWhatsAppApiBase } from '../../utils/dataService';
import {
    renderNotifyCardToCanvas,
    getNotifyCardPixelSize,
    downloadNotifyCardJpeg,
    downloadNotifyCardsAsZip,
    exportNotifyCardsPdfPerCommittee,
    groupStudentsByCommittee,
} from '../../utils/pdfExport';
import NotifyCardLayoutEditor from '../../components/NotifyCardLayoutEditor';
import {
    Send,
    Loader2,
    Move,
    CheckCircle,
    AlertCircle,
    UploadCloud,
    Users,
    X,
    Zap,
    Maximize2,
    CreditCard,
    FileStack,
    Search,
    Hash,
    UsersRound,
    ImageDown,
    Download,
    Eye,
    FileDown,
    CheckSquare,
    Square,
    Clock,
} from 'lucide-react';
import { WhatsAppBadge, WhatsAppSetupPanel } from '../../components/WhatsAppStatus';
import { useWhatsAppConnection } from '../../hooks/useWhatsAppConnection';
import { COMMITTEE_STAGES } from '../../utils/committeeUtils';
import { compareStudentsBySeatNumber } from '../../utils/seatNumberGenerator';

/** تأخير الإرسال الجماعي — يقلّل خطر حظر واتساب */
const WA_BULK_CONFIG = {
    messageDelaySec: 10,
    batchSize: 50,
    batchPauseSec: 60,
};

function estimateBulkDurationSec(count) {
    if (count <= 1) return 0;
    const gaps = count - 1;
    const batchPauses = Math.floor(gaps / WA_BULK_CONFIG.batchSize);
    return gaps * WA_BULK_CONFIG.messageDelaySec + batchPauses * WA_BULK_CONFIG.batchPauseSec;
}

function formatBulkDurationHint(count) {
    const sec = estimateBulkDurationSec(count);
    if (sec <= 0) return '';
    const min = Math.ceil(sec / 60);
    return min <= 1 ? 'أقل من دقيقة تقريباً' : `~${min} دقيقة تقريباً`;
}

async function waitBulkSendGap(messageIndex, total, setBulkProgress) {
    if (messageIndex >= total - 1) return;
    const sentSoFar = messageIndex + 1;
    const isBatchEnd = sentSoFar % WA_BULK_CONFIG.batchSize === 0;
    const waitSec = isBatchEnd ? WA_BULK_CONFIG.batchPauseSec : WA_BULK_CONFIG.messageDelaySec;
    const phase = isBatchEnd ? 'batch_pause' : 'waiting';

    for (let s = waitSec; s > 0; s--) {
        setBulkProgress((prev) => (prev ? { ...prev, phase, secondsLeft: s } : prev));
        await new Promise((r) => setTimeout(r, 1000));
    }
}

function bulkSendConfirmMessage(count, itemLabel = 'طالب') {
    const durationHint = formatBulkDurationHint(count);
    return (
        `إرسال عبر واتساب إلى ${count} ${itemLabel}؟\n\n` +
        `• انتظار ${WA_BULK_CONFIG.messageDelaySec} ثوانٍ بين كل رسالة والأخرى (لتقليل خطر الحظر)\n` +
        `• توقف ${WA_BULK_CONFIG.batchPauseSec} ثانية كل ${WA_BULK_CONFIG.batchSize} رسالة\n` +
        (durationHint ? `• الوقت المتوقع: ${durationHint}\n` : '') +
        `\nلا تغلق الصفحة أثناء الإرسال.`
    );
}

function getBulkProgressMessage(progress) {
    if (!progress) return '';
    const { current, total, phase, secondsLeft, label } = progress;
    if (phase === 'sending') {
        return `جاري الإرسال ${current} من ${total}${label ? ` — ${label}` : ''}`;
    }
    if (phase === 'batch_pause') {
        return `توقف مؤقت بعد ${current} رسالة — متبقٍ ${secondsLeft} ثانية`;
    }
    return `انتظار ${WA_BULK_CONFIG.messageDelaySec} ثوانٍ قبل الرسالة التالية — متبقٍ ${secondsLeft} ثانية`;
}

const committeeKey = (committee) => String(committee ?? '').trim() || '__none__';

const safeFilePart = (s) =>
    String(s ?? '')
        .trim()
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 40) || 'طالب';

function notifyCardFilename(student) {
    const seat = student.seatNumber ? `_جلوس${safeFilePart(student.seatNumber)}` : '';
    return `بطاقة_${safeFilePart(student.name)}${seat}.jpg`;
}

function buildSeatCardCaption(template, student) {
    return (template || 'بطاقة جلوس الطالب: *{name}*')
        .replace(/\{name\}/g, student.name || '')
        .replace(/\{committee\}/g, student.committee || '—')
        .replace(/\{seatNumber\}/g, student.seatNumber ?? '—')
        .replace(/\{grade\}/g, student.grade || '');
}

const StudentNotifier = ({ activeSystem = 'control' }) => {
    const isGrading = activeSystem === 'grading';
    const [activeTab, setActiveTab] = useState(isGrading ? 'results' : 'committees');
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sendingId, setSendingId] = useState(null);
    const [statusMap, setStatusMap] = useState({});
    const [appConfig, setAppConfig] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [stageFilter, setStageFilter] = useState('all');
    const [gradeFilter, setGradeFilter] = useState('all');
    const [committeeFilter, setCommitteeFilter] = useState('all');
    const [exportSelectedCommittees, setExportSelectedCommittees] = useState(() => new Set());
    const [selectedStudentIds, setSelectedStudentIds] = useState(() => new Set());

    const [resultFiles, setResultFiles] = useState([]);
    const [bulkSending, setBulkSending] = useState(false);
    const [bulkProgress, setBulkProgress] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    const [bulkDownloading, setBulkDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(null);
    const wa = useWhatsAppConnection();

    useEffect(() => {
        const init = async () => {
            const data = await getAppSettings();
            setAppConfig(data);
            await loadStudents();
        };
        init();
    }, []);

    const loadStudents = async () => {
        setLoading(true);
        const data = await getStudents();
        setStudents(data);
        setLoading(false);
    };

    const stats = useMemo(() => {
        const withPhone = students.filter((s) => s.phone).length;
        const withCommittee = students.filter((s) => s.committee).length;
        const withSeat = students.filter((s) => s.seatNumber).length;
        const sentOk = Object.values(statusMap).filter((s) => s.status === 'success').length;
        const resultsReady = resultFiles.filter((f) => f.matchedStudentId && f.status !== 'success').length;
        const resultsDone = resultFiles.filter((f) => f.status === 'success').length;
        return { withPhone, withCommittee, withSeat, sentOk, resultsReady, resultsDone };
    }, [students, statusMap, resultFiles]);

    const committees = useMemo(
        () => [...new Set(students.map((s) => s.committee).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'ar')),
        [students]
    );

    const grades = useMemo(
        () =>
            [...new Set(students.map((s) => s.grade).filter(Boolean))].sort((a, b) =>
                String(a).localeCompare(String(b), 'ar', { numeric: true })
            ),
        [students]
    );

    const matchSearch = (s, q) => {
        if (!q) return true;
        return (
            (s.name || '').toLowerCase().includes(q) ||
            String(s.seatNumber ?? '').includes(q) ||
            (s.phone || '').includes(q) ||
            (s.grade || '').toLowerCase().includes(q) ||
            String(s.committee ?? '').includes(q)
        );
    };

    const committeePickerRows = useMemo(() => {
        let list = students;
        if (stageFilter !== 'all') list = list.filter((s) => s.stage === stageFilter);
        const map = new Map();
        for (const s of list) {
            const k = committeeKey(s.committee);
            if (!map.has(k)) {
                map.set(k, {
                    key: k,
                    label: k === '__none__' ? 'بدون لجنة' : s.committee,
                    count: 0,
                });
            }
            map.get(k).count += 1;
        }
        return [...map.values()].sort((a, b) => {
            if (a.key === '__none__') return 1;
            if (b.key === '__none__') return -1;
            return String(a.label).localeCompare(String(b.label), 'ar', { numeric: true });
        });
    }, [students, stageFilter]);

    const committeePickerKey = useMemo(
        () => committeePickerRows.map((r) => r.key).join('|'),
        [committeePickerRows]
    );

    useEffect(() => {
        setExportSelectedCommittees(new Set(committeePickerRows.map((r) => r.key)));
    }, [stageFilter, committeePickerKey]);

    const filteredStudents = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let list = students;
        if (stageFilter !== 'all') list = list.filter((s) => s.stage === stageFilter);
        if (gradeFilter !== 'all') list = list.filter((s) => s.grade === gradeFilter);
        list = list.filter((s) => matchSearch(s, q));
        if (activeTab === 'committees' && committeeFilter !== 'all') {
            list = list.filter((s) => s.committee === committeeFilter);
        }
        if (activeTab === 'download') {
            list = [...list].sort(compareStudentsBySeatNumber);
        }
        return list;
    }, [students, searchQuery, stageFilter, gradeFilter, activeTab, committeeFilter]);

    const selectedSendTargets = useMemo(
        () => filteredStudents.filter((s) => selectedStudentIds.has(s.id) && s.phone),
        [filteredStudents, selectedStudentIds]
    );

    const allFilteredSelected =
        filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.has(s.id));

    const toggleStudentSelection = (id) => {
        setSelectedStudentIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllFilteredStudents = () => {
        if (allFilteredSelected) {
            setSelectedStudentIds(new Set());
            return;
        }
        setSelectedStudentIds(new Set(filteredStudents.map((s) => s.id)));
    };

    const clearStudentSelection = () => setSelectedStudentIds(new Set());

    const studentsForPdfExport = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let list = students;
        if (stageFilter !== 'all') list = list.filter((s) => s.stage === stageFilter);
        list = list.filter((s) => matchSearch(s, q));
        if (!exportSelectedCommittees.size) return [];
        return list
            .filter((s) => exportSelectedCommittees.has(committeeKey(s.committee)))
            .sort(compareStudentsBySeatNumber);
    }, [students, stageFilter, searchQuery, exportSelectedCommittees]);

    const committeeExportGroups = useMemo(
        () => groupStudentsByCommittee(studentsForPdfExport),
        [studentsForPdfExport]
    );

    const toggleExportCommittee = (key) => {
        setExportSelectedCommittees((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const selectAllExportCommittees = () => {
        setExportSelectedCommittees(new Set(committeePickerRows.map((r) => r.key)));
    };

    const clearExportCommittees = () => setExportSelectedCommittees(new Set());

    const handleFilesUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const newResultFiles = [];
        for (const file of files) {
            const fileName = file.name.replace(/\.[^/.]+$/, '');
            let bestMatchId = null;
            const matchedStudent = students.find(
                (s) => s.name === fileName || fileName.includes(s.name) || s.name.includes(fileName)
            );
            if (matchedStudent) bestMatchId = matchedStudent.id;

            const preview = URL.createObjectURL(file);
            newResultFiles.push({
                id: Math.random().toString(36).substr(2, 9),
                file,
                fileName,
                preview,
                matchedStudentId: bestMatchId,
                status: 'pending',
                msg: '',
            });
        }
        setResultFiles((prev) => [...prev, ...newResultFiles]);
        e.target.value = null;
    };

    const handleMatchChange = (fileId, studentId) => {
        setResultFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, matchedStudentId: studentId } : f)));
    };

    const removeFile = (fileId) => {
        setResultFiles((prev) => prev.filter((f) => f.id !== fileId));
    };

    const sendBulkResults = async () => {
        const readyFiles = resultFiles.filter((f) => f.matchedStudentId && f.status !== 'success');
        if (readyFiles.length === 0) return;
        if (!window.confirm(bulkSendConfirmMessage(readyFiles.length, 'نتيجة'))) return;

        setBulkSending(true);
        setBulkProgress({ current: 0, total: readyFiles.length, phase: 'sending', secondsLeft: 0, label: '' });
        for (let i = 0; i < readyFiles.length; i++) {
            const rf = readyFiles[i];
            const student = students.find((s) => s.id === rf.matchedStudentId);
            setBulkProgress({
                current: i + 1,
                total: readyFiles.length,
                phase: 'sending',
                secondsLeft: 0,
                label: student?.name || rf.fileName,
            });
            setResultFiles((prev) =>
                prev.map((f) => (f.id === rf.id ? { ...f, status: 'sending', msg: 'جاري الإرسال...' } : f))
            );

            try {
                if (!student || !student.phone) throw new Error('لا يوجد رقم جوال.');

                const base64Data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = (error) => reject(error);
                    reader.readAsDataURL(rf.file);
                });

                const caption = (appConfig?.messages?.result || 'درجات الطالب: *{name}*').replace(
                    '{name}',
                    student.name
                );

                const waBase = await getWhatsAppApiBase();
                const res = await fetch(`${waBase}/send-image`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: student.phone, imageBase64: base64Data, caption }),
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'ERROR');

                setResultFiles((prev) =>
                    prev.map((f) => (f.id === rf.id ? { ...f, status: 'success', msg: 'تم الإرسال ✓' } : f))
                );
            } catch (error) {
                setResultFiles((prev) =>
                    prev.map((f) => (f.id === rf.id ? { ...f, status: 'error', msg: error.message } : f))
                );
            }
            await waitBulkSendGap(i, readyFiles.length, setBulkProgress);
        }
        setBulkProgress(null);
        setBulkSending(false);
    };

    const sendBulkSeatCards = async () => {
        const targets = selectedSendTargets;
        if (!targets.length) {
            alert('حدّد طلاباً لديهم أرقام جوال.');
            return;
        }
        if (!window.confirm(bulkSendConfirmMessage(targets.length))) {
            return;
        }

        setBulkSending(true);
        setBulkProgress({ current: 0, total: targets.length, phase: 'sending', secondsLeft: 0, label: '' });
        for (let i = 0; i < targets.length; i++) {
            const student = targets[i];
            setBulkProgress({
                current: i + 1,
                total: targets.length,
                phase: 'sending',
                secondsLeft: 0,
                label: student.name,
            });
            await generateAndSendSeatCard(student);
            await waitBulkSendGap(i, targets.length, setBulkProgress);
        }
        setBulkProgress(null);
        setBulkSending(false);
    };

    const closePreview = () => {
        if (previewImage?.startsWith('blob:')) URL.revokeObjectURL(previewImage);
        setPreviewImage(null);
    };

    const handlePreviewNotifyCard = async (student) => {
        try {
            const { width, height } = getNotifyCardPixelSize();
            const canvas = await renderNotifyCardToCanvas(student, appConfig, width * 2, height * 2);
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(
                    (b) => (b ? resolve(b) : reject(new Error('فشل المعاينة'))),
                    'image/jpeg',
                    0.9
                );
            });
            if (previewImage?.startsWith('blob:')) URL.revokeObjectURL(previewImage);
            setPreviewImage(URL.createObjectURL(blob));
        } catch (err) {
            alert(err.message || 'تعذّر إنشاء المعاينة');
        }
    };

    const handleDownloadNotifyCard = async (student) => {
        setDownloadingId(student.id);
        try {
            await downloadNotifyCardJpeg(student, appConfig, notifyCardFilename(student));
        } catch (err) {
            alert(err.message || 'فشل تحميل البطاقة');
        } finally {
            setDownloadingId(null);
        }
    };

    const bulkFileLabel = () => {
        const stagePart = stageFilter !== 'all' ? safeFilePart(stageFilter) : 'كل_المراحل';
        const committeePart =
            exportSelectedCommittees.size === 1
                ? safeFilePart([...exportSelectedCommittees][0])
                : exportSelectedCommittees.size > 1
                  ? `${exportSelectedCommittees.size}_لجان`
                  : 'لجان';
        const date = new Date().toISOString().slice(0, 10);
        return { stagePart, committeePart, date };
    };

    const handleDownloadAllPdf = async () => {
        if (!exportSelectedCommittees.size) {
            alert('حدّد لجنة واحدة على الأقل للتصدير.');
            return;
        }
        const groups = committeeExportGroups.filter((g) => g.students.length > 0);
        if (!groups.length) {
            alert('لا يوجد طلاب في اللجان المحددة (تحقق من المرحلة والبحث).');
            return;
        }
        const { date } = bulkFileLabel();
        const totalStudents = groups.reduce((n, g) => n + g.students.length, 0);
        const stageLabel =
            stageFilter === 'all'
                ? 'كل المراحل'
                : COMMITTEE_STAGES.find((s) => s.id === stageFilter)?.label || stageFilter;
        if (
            !window.confirm(
                `تصدير ${groups.length} ملف PDF (ملف منفصل لكل لجنة) — ${totalStudents} بطاقة.\nالمرحلة: ${stageLabel}\n8 بطاقات في كل صفحة A4.`
            )
        ) {
            return;
        }
        setBulkDownloading(true);
        try {
            const { fileCount } = await exportNotifyCardsPdfPerCommittee(studentsForPdfExport, appConfig, {
                dateSuffix: date,
                cardsPerPage: 8,
                committeeKeys: exportSelectedCommittees,
                stageSuffix: stageFilter !== 'all' ? stageFilter : undefined,
                onCommitteeStart: (info) =>
                    setDownloadProgress({
                        committee: info.committee,
                        committeeIndex: info.committeeIndex,
                        totalCommittees: info.totalCommittees,
                        studentCount: info.studentCount,
                    }),
                onProgress: (p) => setDownloadProgress(p),
            });
            alert(`تم تنزيل ${fileCount} ملف PDF — ملف لكل لجنة.`);
        } catch (err) {
            alert(err?.message || 'فشل تصدير PDF');
        } finally {
            setBulkDownloading(false);
            setDownloadProgress(null);
        }
    };

    const handleDownloadAllZip = async () => {
        if (!studentsForPdfExport.length) {
            alert('حدّد لجاناً تحتوي على طلاب للتصدير.');
            return;
        }
        if (!window.confirm(`تحميل ${studentsForPdfExport.length} بطاقة كصور JPG داخل ملف ZIP؟`)) {
            return;
        }
        setBulkDownloading(true);
        const { stagePart, committeePart, date } = bulkFileLabel();
        const zipName = `بطاقات_جلوس_${stagePart}_${committeePart}_${date}.zip`;
        try {
            const { ok, fail } = await downloadNotifyCardsAsZip(
                studentsForPdfExport,
                appConfig,
                zipName,
                {
                    onProgress: (p) => setDownloadProgress(p),
                    filenameFor: notifyCardFilename,
                }
            );
            alert(
                fail
                    ? `تم إنشاء ZIP بـ ${ok} بطاقة. فشل ${fail}.`
                    : `تم تحميل ${ok} بطاقة في ملف ZIP.`
            );
        } catch (err) {
            alert(err?.message || 'فشل إنشاء ZIP');
        } finally {
            setBulkDownloading(false);
            setDownloadProgress(null);
        }
    };

    const generateAndSendSeatCard = async (student) => {
        if (!student.phone) {
            setStatusMap((prev) => ({ ...prev, [student.id]: { status: 'error', msg: 'رقم الجوال مفقود' } }));
            return;
        }

        setSendingId(student.id);
        try {
            const { width, height } = getNotifyCardPixelSize();
            const scale = 2;
            const canvas = await renderNotifyCardToCanvas(student, appConfig, width * scale, height * scale);
            const base64Data = canvas.toDataURL('image/jpeg', 0.92);
            const caption = buildSeatCardCaption(appConfig?.messages?.committee, student);

            const waBase = await getWhatsAppApiBase();
            const res = await fetch(`${waBase}/send-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: student.phone, imageBase64: base64Data, caption }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Server Error');
            setStatusMap((prev) => ({ ...prev, [student.id]: { status: 'success', msg: 'تم الإرسال' } }));
        } catch (error) {
            setStatusMap((prev) => ({ ...prev, [student.id]: { status: 'error', msg: error.message } }));
        } finally {
            setSendingId(null);
        }
    };

    if (!appConfig) {
        return (
            <div className="flex flex-col items-center justify-center py-32 font-alexandria">
                <div className="w-20 h-20 rounded-[2rem] bg-indigo-50 flex items-center justify-center mb-6">
                    <Loader2 size={36} className="animate-spin text-indigo-500" />
                </div>
                <p className="font-black text-lg text-slate-600">جاري تحميل مركز الإشعارات...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 font-alexandria pb-16 max-w-full overflow-x-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 shrink-0">
                            <Send size={22} />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black text-slate-900 font-header tracking-tight">
                                مركز الإشعارات
                            </h1>
                            <p className="text-slate-500 text-sm font-medium mt-0.5">
                                القالب: <span className="text-indigo-600 font-bold">w.jpeg</span>
                                {isGrading
                                    ? ' — نتائج وبطاقات الجلوس'
                                    : ' — بطاقات الجلوس للأهالي'}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <WhatsAppBadge wa={wa} />
                    <button
                        type="button"
                        onClick={() => setLayoutEditorOpen(true)}
                        className="px-6 py-3.5 bg-amber-50 text-amber-800 rounded-2xl font-black text-sm hover:bg-amber-100 transition-all border border-amber-100 flex items-center gap-2"
                    >
                        <Move size={18} />
                        ضبط مواضع القالب
                    </button>
                </div>
            </div>

            <WhatsAppSetupPanel wa={wa} />

            {bulkSending && bulkProgress && (
                <div className="luxury-card p-4 bg-amber-50 border-amber-100 flex items-start gap-3 animate-in fade-in">
                    <Loader2 size={20} className="animate-spin text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-black text-amber-900 text-sm">{getBulkProgressMessage(bulkProgress)}</p>
                        <p className="text-xs font-bold text-amber-700 mt-1">
                            لا تغلق الصفحة — يُنتظر {WA_BULK_CONFIG.messageDelaySec} ثوانٍ بين كل رسالة
                        </p>
                    </div>
                </div>
            )}

            <div className="luxury-card p-4 bg-indigo-50/50 border-indigo-100 flex items-start gap-3">
                <Clock size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-sm font-bold text-slate-700 leading-relaxed">
                    <span className="font-black text-indigo-900">الإرسال الجماعي:</span> يُرسل رسالة ثم ينتظر{' '}
                    <span className="font-black text-indigo-700">{WA_BULK_CONFIG.messageDelaySec} ثوانٍ</span> قبل
                    التالية، مع توقف {WA_BULK_CONFIG.batchPauseSec} ثانية كل {WA_BULK_CONFIG.batchSize} رسالة — لتقليل
                    خطر حظر واتساب. يُفضّل الإرسال لجنة أو صف في كل مرة بدل تحديد الجميع دفعة واحدة.
                </p>
            </div>

            {/* Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="inline-flex p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80 w-full max-w-full overflow-x-auto custom-scrollbar sm:w-auto">
                    <button
                        type="button"
                        onClick={() => setActiveTab('committees')}
                        className={`flex-1 sm:flex-none shrink-0 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 sm:py-3.5 rounded-xl font-black text-xs sm:text-sm transition-all
                          ${
                              activeTab === 'committees'
                                  ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100/50'
                                  : 'text-slate-500 hover:text-slate-800'
                          }`}
                    >
                        <CreditCard size={18} />
                        إرسال واتساب
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('download')}
                        className={`flex-1 sm:flex-none shrink-0 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 sm:py-3.5 rounded-xl font-black text-xs sm:text-sm transition-all
                          ${
                              activeTab === 'download'
                                  ? 'bg-white text-amber-600 shadow-md shadow-amber-100/50'
                                  : 'text-slate-500 hover:text-slate-800'
                          }`}
                    >
                        <ImageDown size={18} />
                        تحميل البطاقات
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('results')}
                        className={`flex-1 sm:flex-none shrink-0 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-3 sm:py-3.5 rounded-xl font-black text-xs sm:text-sm transition-all
                          ${
                              activeTab === 'results'
                                  ? 'bg-white text-emerald-600 shadow-md shadow-emerald-100/50'
                                  : 'text-slate-500 hover:text-slate-800'
                          }`}
                    >
                        <FileStack size={18} />
                        النتائج والشهادات
                    </button>
                </div>
                {activeTab === 'download' && exportSelectedCommittees.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleDownloadAllPdf}
                            disabled={bulkDownloading || loading || !studentsForPdfExport.length}
                            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-600 text-white font-black text-sm hover:bg-amber-700 disabled:opacity-50"
                        >
                            {bulkDownloading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <FileDown size={18} />
                            )}
                            PDF — {exportSelectedCommittees.size} لجنة (ملف لكل لجنة)
                            {downloadProgress?.committee && (
                                <span className="text-[10px] opacity-90">
                                    {downloadProgress.totalCommittees > 1
                                        ? `لجنة ${downloadProgress.committeeIndex}/${downloadProgress.totalCommittees}`
                                        : downloadProgress.page != null
                                          ? `ص ${downloadProgress.page}/${downloadProgress.totalPages}`
                                          : downloadProgress.committee}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadAllZip}
                            disabled={bulkDownloading || loading}
                            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white text-amber-800 border border-amber-200 font-black text-sm hover:bg-amber-50 disabled:opacity-50"
                        >
                            <Download size={18} />
                            ZIP
                        </button>
                    </div>
                )}
                {activeTab === 'results' && resultFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-[10px] font-black">
                        <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-600">
                            {resultFiles.length} ملف
                        </span>
                        <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700">
                            جاهز للإرسال: {stats.resultsReady}
                        </span>
                        <span className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700">
                            تم: {stats.resultsDone}
                        </span>
                    </div>
                )}
            </div>

            {/* WhatsApp send tab */}
            {activeTab === 'committees' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="luxury-card p-4 md:p-5 flex flex-col md:flex-row gap-3 md:items-center">
                        <div className="relative flex-1">
                            <Search
                                size={18}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                            />
                            <input
                                type="search"
                                placeholder="بحث بالاسم، رقم الجلوس، الجوال، الصف..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pr-12 pl-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-200"
                            />
                        </div>
                        <select
                            value={stageFilter}
                            onChange={(e) => setStageFilter(e.target.value)}
                            className="md:w-52 px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100"
                            title="فلترة المرحلة"
                        >
                            <option value="all">كل المراحل</option>
                            {COMMITTEE_STAGES.map((st) => (
                                <option key={st.id} value={st.id}>
                                    {st.label}
                                </option>
                            ))}
                        </select>
                        <select
                            value={gradeFilter}
                            onChange={(e) => setGradeFilter(e.target.value)}
                            className="md:w-48 px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100"
                            title="فلترة الصف"
                        >
                            <option value="all">كل الصفوف</option>
                            {grades.map((g) => (
                                <option key={g} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                        <select
                            value={committeeFilter}
                            onChange={(e) => setCommitteeFilter(e.target.value)}
                            className="md:w-48 px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100"
                        >
                            <option value="all">كل اللجان</option>
                            {committees.map((c) => (
                                <option key={c} value={c}>
                                    لجنة {c}
                                </option>
                            ))}
                        </select>
                    </div>

                    {!loading && filteredStudents.length > 0 && (
                        <div className="luxury-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/40 border-indigo-100">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={selectAllFilteredStudents}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-800 text-xs font-black border border-indigo-100 hover:bg-indigo-50"
                                >
                                    {allFilteredSelected ? (
                                        <CheckSquare size={16} className="text-indigo-600" />
                                    ) : (
                                        <Square size={16} className="text-indigo-400" />
                                    )}
                                    {allFilteredSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'} ({filteredStudents.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={clearStudentSelection}
                                    disabled={selectedStudentIds.size === 0}
                                    className="px-4 py-2.5 rounded-xl bg-slate-50 text-slate-600 text-xs font-black border border-slate-100 hover:bg-slate-100 disabled:opacity-40"
                                >
                                    إلغاء التحديد
                                </button>
                                {selectedStudentIds.size > 0 && (
                                    <span className="text-xs font-black text-indigo-700 px-3 py-2 rounded-xl bg-white border border-indigo-100">
                                        محدّد: {selectedStudentIds.size}
                                        {selectedSendTargets.length !== selectedStudentIds.size &&
                                            ` · ${selectedSendTargets.length} قابل للإرسال`}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={sendBulkSeatCards}
                                disabled={
                                    bulkSending ||
                                    sendingId ||
                                    selectedSendTargets.length === 0
                                }
                                className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm hover:bg-emerald-700 disabled:opacity-40 shadow-lg shadow-emerald-100"
                            >
                                {bulkSending ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        {bulkProgress?.phase === 'waiting'
                                            ? `انتظار ${bulkProgress.secondsLeft} ث…`
                                            : bulkProgress?.phase === 'batch_pause'
                                              ? `توقف ${bulkProgress.secondsLeft} ث…`
                                              : 'جاري الإرسال…'}
                                    </>
                                ) : (
                                    <Send size={18} />
                                )}
                                إرسال المحدد ({selectedSendTargets.length})
                            </button>
                        </div>
                    )}

                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div
                                    key={i}
                                    className="h-40 rounded-2xl bg-slate-100 animate-pulse border border-slate-50"
                                />
                            ))}
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="luxury-card p-16 text-center">
                            <Users size={48} className="mx-auto text-slate-200 mb-4" />
                            <p className="font-black text-slate-600">لا يوجد طلاب مطابقون للبحث</p>
                            <p className="text-sm text-slate-400 font-bold mt-2">جرّب تغيير كلمة البحث أو الفلتر</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredStudents.map((student) => {
                                const st = statusMap[student.id];
                                const canSend = Boolean(student.phone);
                                const isSending = sendingId === student.id;
                                const isSelected = selectedStudentIds.has(student.id);

                                return (
                                    <article
                                        key={student.id}
                                        className={`luxury-card p-5 flex flex-col gap-4 hover:shadow-lg transition-shadow border-slate-100/80 group ${
                                            isSelected ? 'ring-2 ring-indigo-400 border-indigo-200' : ''
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <button
                                                type="button"
                                                onClick={() => toggleStudentSelection(student.id)}
                                                className="shrink-0 mt-1 p-1 rounded-lg hover:bg-indigo-50 transition-colors"
                                                title={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                                            >
                                                {isSelected ? (
                                                    <CheckSquare size={20} className="text-indigo-600" />
                                                ) : (
                                                    <Square size={20} className="text-slate-300" />
                                                )}
                                            </button>
                                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-md shadow-indigo-100">
                                                {(student.name || '?').charAt(0)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-header font-black text-slate-900 truncate">
                                                    {student.name}
                                                </h3>
                                                <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                                                    {student.grade}
                                                    {student.class ? ` · فصل ${student.class}` : ''}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {student.committee ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-black border border-indigo-100">
                                                    <UsersRound size={12} />
                                                    لجنة {student.committee}
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-400 text-[10px] font-bold">
                                                    بدون لجنة
                                                </span>
                                            )}
                                            {student.seatNumber ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-[10px] font-black border border-amber-100">
                                                    <Hash size={12} />
                                                    جلوس {student.seatNumber}
                                                </span>
                                            ) : null}
                                        </div>

                                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-50">
                                            {student.phone ? (
                                                <span
                                                    className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100"
                                                    dir="ltr"
                                                >
                                                    {student.phone}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-black text-rose-500 flex items-center gap-1">
                                                    <AlertCircle size={12} />
                                                    بدون جوال
                                                </span>
                                            )}

                                            {st && (
                                                <span
                                                    className={`text-[10px] font-black px-2 py-1 rounded-lg flex items-center gap-1
                                                      ${
                                                          st.status === 'success'
                                                              ? 'bg-emerald-50 text-emerald-700'
                                                              : 'bg-rose-50 text-rose-600'
                                                      }`}
                                                >
                                                    {st.status === 'success' ? (
                                                        <CheckCircle size={12} />
                                                    ) : (
                                                        <AlertCircle size={12} />
                                                    )}
                                                    {st.msg}
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            disabled={!canSend || isSending}
                                            onClick={() => generateAndSendSeatCard(student)}
                                            className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all
                                              ${
                                                  !canSend
                                                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-100 active:scale-[0.98]'
                                              }`}
                                        >
                                            {isSending ? (
                                                <Loader2 size={18} className="animate-spin" />
                                            ) : (
                                                <Send size={18} />
                                            )}
                                            إرسال البطاقة عبر واتساب
                                        </button>
                                    </article>
                                );
                            })}
                        </div>
                    )}

                    {!loading && filteredStudents.length > 0 && (
                        <p className="text-center text-[11px] font-bold text-slate-400">
                            عرض {filteredStudents.length} من {students.length} طالب
                            {stats.sentOk > 0 && ` · تم إرسال ${stats.sentOk} بطاقة هذه الجلسة`}
                        </p>
                    )}
                </div>
            )}

            {/* Download cards tab */}
            {activeTab === 'download' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="luxury-card p-5 bg-amber-50/60 border-amber-100">
                        <p className="text-sm font-bold text-amber-900 leading-relaxed">
                            تحميل صورة بطاقة الجلوس من القالب{' '}
                            <span className="font-black">w.jpeg</span> — نفس البطاقة المُرسلة عبر واتساب،
                            بصيغة JPG جاهزة للطباعة أو المشاركة.
                        </p>
                    </div>

                    <div className="luxury-card p-4 md:p-5 flex flex-col md:flex-row gap-3 md:items-center">
                        <div className="relative flex-1">
                            <Search
                                size={18}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                            />
                            <input
                                type="search"
                                placeholder="بحث بالاسم، رقم الجلوس، الصف..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pr-12 pl-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-amber-100 focus:border-amber-200"
                            />
                        </div>
                        <select
                            value={stageFilter}
                            onChange={(e) => setStageFilter(e.target.value)}
                            className="md:w-52 px-4 py-3.5 rounded-2xl bg-slate-50 border border-amber-200 text-sm font-black text-slate-700 outline-none focus:ring-4 focus:ring-amber-100"
                            title="فلترة المرحلة"
                        >
                            <option value="all">كل المراحل</option>
                            {COMMITTEE_STAGES.map((st) => (
                                <option key={st.id} value={st.id}>
                                    {st.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {committeePickerRows.length > 0 && (
                        <div className="luxury-card p-4 md:p-5 bg-white border-amber-100 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <p className="text-sm font-black text-amber-900">
                                    تحديد اللجان للتصدير (ملف PDF منفصل لكل لجنة — 8 بطاقات/صفحة)
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={selectAllExportCommittees}
                                        className="px-3 py-1.5 rounded-xl bg-amber-50 text-amber-900 text-[11px] font-black border border-amber-100 hover:bg-amber-100"
                                    >
                                        تحديد الكل
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearExportCommittees}
                                        className="px-3 py-1.5 rounded-xl bg-slate-50 text-slate-600 text-[11px] font-black border border-slate-100 hover:bg-slate-100"
                                    >
                                        إلغاء التحديد
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {committeePickerRows.map((row) => {
                                    const selected = exportSelectedCommittees.has(row.key);
                                    const exportCount =
                                        committeeExportGroups.find((g) => g.committeeKey === row.key)
                                            ?.students.length ?? 0;
                                    return (
                                        <button
                                            key={row.key}
                                            type="button"
                                            onClick={() => toggleExportCommittee(row.key)}
                                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-right text-sm font-bold border transition-colors ${
                                                selected
                                                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                                                    : 'bg-slate-50 border-slate-100 text-slate-500'
                                            }`}
                                        >
                                            {selected ? (
                                                <CheckSquare size={18} className="shrink-0 text-amber-600" />
                                            ) : (
                                                <Square size={18} className="shrink-0 text-slate-300" />
                                            )}
                                            <span className="flex-1 min-w-0 truncate">
                                                {row.key === '__none__' ? row.label : `لجنة ${row.label}`}
                                            </span>
                                            <span className="text-[10px] font-black shrink-0 text-amber-800/80">
                                                {selected && searchQuery.trim()
                                                    ? `${exportCount}/${row.count}`
                                                    : row.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {exportSelectedCommittees.size > 0 && (
                                <p className="text-[11px] font-bold text-slate-500">
                                    للتصدير: {exportSelectedCommittees.size} لجنة —{' '}
                                    {studentsForPdfExport.length} بطاقة
                                    {stageFilter !== 'all' &&
                                        ` · ${
                                            COMMITTEE_STAGES.find((s) => s.id === stageFilter)?.label ||
                                            stageFilter
                                        }`}
                                </p>
                            )}
                        </div>
                    )}

                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div
                                    key={i}
                                    className="h-48 rounded-2xl bg-slate-100 animate-pulse border border-slate-50"
                                />
                            ))}
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="luxury-card p-16 text-center">
                            <ImageDown size={48} className="mx-auto text-slate-200 mb-4" />
                            <p className="font-black text-slate-600">لا يوجد طلاب مطابقون</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredStudents.map((student) => {
                                const isDownloading = downloadingId === student.id;
                                return (
                                    <article
                                        key={student.id}
                                        className="luxury-card p-5 flex flex-col gap-4 border-slate-100/80"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center font-black text-lg shrink-0">
                                                {(student.name || '?').charAt(0)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-header font-black text-slate-900 truncate">
                                                    {student.name}
                                                </h3>
                                                <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                                                    {student.grade}
                                                    {student.committee
                                                        ? ` · لجنة ${student.committee}`
                                                        : ''}
                                                </p>
                                            </div>
                                        </div>

                                        {student.seatNumber ? (
                                            <span className="inline-flex w-fit items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 text-[10px] font-black border border-amber-100">
                                                <Hash size={12} />
                                                جلوس {student.seatNumber}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-slate-400">
                                                بدون رقم جلوس — تُعرض البطاقة بدونه
                                            </span>
                                        )}

                                        <div className="flex flex-wrap gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => handlePreviewNotifyCard(student)}
                                                className="flex-1 min-w-[7rem] py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                                            >
                                                <Eye size={16} />
                                                معاينة
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isDownloading || bulkDownloading}
                                                onClick={() => handleDownloadNotifyCard(student)}
                                                className="flex-1 min-w-[7rem] py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                                            >
                                                {isDownloading ? (
                                                    <Loader2 size={16} className="animate-spin" />
                                                ) : (
                                                    <ImageDown size={16} />
                                                )}
                                                تحميل JPG
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}

                    {!loading && filteredStudents.length > 0 && (
                        <p className="text-center text-[11px] font-bold text-slate-400">
                            عرض {filteredStudents.length} بطاقة
                            {exportSelectedCommittees.size > 0 &&
                                ` · تصدير ${exportSelectedCommittees.size} لجنة (${studentsForPdfExport.length} بطاقة)`}
                        </p>
                    )}
                </div>
            )}

            {/* Results tab */}
            {activeTab === 'results' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <label className="luxury-card block p-10 md:p-14 border-2 border-dashed border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 to-white cursor-pointer group hover:border-emerald-300 transition-colors">
                        <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handleFilesUpload}
                            className="hidden"
                        />
                        <div className="flex flex-col items-center text-center gap-6 pointer-events-none">
                            <div className="w-20 h-20 rounded-[1.75rem] bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform shadow-inner">
                                <UploadCloud size={40} />
                            </div>
                            <div className="space-y-2 max-w-lg">
                                <h2 className="text-2xl font-black text-slate-900 font-header">
                                    رفع صور النتائج والشهادات
                                </h2>
                                <p className="text-slate-500 text-sm font-bold leading-relaxed">
                                    اسم الملف يُطابق اسم الطالب تلقائياً. بعد الربط يمكنك الإرسال الجماعي عبر واتساب.
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-100 group-hover:bg-emerald-700 transition-colors">
                                <Zap size={20} />
                                اختر الصور أو اسحبها هنا
                            </span>
                        </div>
                    </label>

                    {resultFiles.length > 0 && (
                        <div className="luxury-card p-0 overflow-hidden border-slate-100">
                            <div className="p-5 md:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                                        <FileStack size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-header font-black text-slate-900">
                                            حزمة الإرسال ({resultFiles.length})
                                        </h3>
                                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                                            {stats.resultsReady} جاهز · {stats.resultsDone} مُرسل
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={sendBulkResults}
                                    disabled={bulkSending || stats.resultsReady === 0}
                                    className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-sm hover:bg-black transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
                                >
                                    {bulkSending ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            {bulkProgress?.phase === 'waiting'
                                                ? `انتظار ${bulkProgress.secondsLeft} ث…`
                                                : bulkProgress?.phase === 'batch_pause'
                                                  ? `توقف ${bulkProgress.secondsLeft} ث…`
                                                  : 'جاري الإرسال…'}
                                        </>
                                    ) : (
                                        <Send size={18} className="text-emerald-400" />
                                    )}
                                    إرسال الكل ({stats.resultsReady})
                                </button>
                            </div>

                            <div className="divide-y divide-slate-50">
                                {resultFiles.map((rf) => (
                                    <div
                                        key={rf.id}
                                        className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 hover:bg-slate-50/50 transition-colors"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setPreviewImage(rf.preview)}
                                            className="relative w-14 h-[4.5rem] rounded-xl overflow-hidden border-2 border-white shadow-md shrink-0 group/img"
                                        >
                                            <img
                                                src={rf.preview}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity">
                                                <Maximize2 size={14} />
                                            </div>
                                        </button>

                                        <div className="flex-1 min-w-0 space-y-2">
                                            <p
                                                className="font-mono text-[11px] font-black text-slate-500 truncate"
                                                dir="ltr"
                                            >
                                                {rf.fileName}
                                            </p>
                                            <select
                                                value={rf.matchedStudentId || ''}
                                                onChange={(e) => handleMatchChange(rf.id, e.target.value)}
                                                className={`w-full max-w-md px-4 py-2.5 rounded-xl text-xs font-black border outline-none focus:ring-4
                                                  ${
                                                      rf.matchedStudentId
                                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-100 focus:ring-emerald-100'
                                                          : 'bg-rose-50 text-rose-800 border-rose-100 focus:ring-rose-100'
                                                  }`}
                                            >
                                                <option value="" disabled>
                                                    — اختر الطالب —
                                                </option>
                                                {students.map((s) => (
                                                    <option key={s.id} value={s.id}>
                                                        {s.name}
                                                        {s.phone ? ` · ${s.phone}` : ' · بدون جوال'}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            {!rf.matchedStudentId ? (
                                                <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg">
                                                    بانتظار الربط
                                                </span>
                                            ) : rf.status === 'pending' ? (
                                                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                                                    جاهز
                                                </span>
                                            ) : null}
                                            {rf.status !== 'pending' && (
                                                <span
                                                    className={`text-[10px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1.5
                                                      ${
                                                          rf.status === 'success'
                                                              ? 'bg-emerald-50 text-emerald-700'
                                                              : rf.status === 'sending'
                                                                ? 'bg-indigo-50 text-indigo-700'
                                                                : 'bg-rose-50 text-rose-700'
                                                      }`}
                                                >
                                                    {rf.status === 'sending' && (
                                                        <Loader2 size={12} className="animate-spin" />
                                                    )}
                                                    {rf.msg}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => removeFile(rf.id)}
                                                className="p-2.5 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                                aria-label="حذف"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {layoutEditorOpen && appConfig && (
                <NotifyCardLayoutEditor
                    appConfig={appConfig}
                    onClose={() => setLayoutEditorOpen(false)}
                    onSaved={(next) => setAppConfig(next)}
                />
            )}

            {previewImage && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6 md:p-10 animate-in fade-in duration-200"
                    onClick={closePreview}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="relative max-w-5xl w-full flex flex-col items-center gap-5"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={previewImage}
                            alt="معاينة بطاقة الجلوس"
                            className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain ring-1 ring-white/10"
                        />
                        <div className="flex flex-wrap gap-3 justify-center">
                            <button
                                type="button"
                                onClick={closePreview}
                                className="px-8 py-3 bg-white text-slate-900 rounded-full font-black text-sm flex items-center gap-2 hover:bg-slate-200 transition-colors"
                            >
                                <X size={18} />
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentNotifier;
