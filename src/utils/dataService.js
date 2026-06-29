import { createClient } from '@supabase/supabase-js';
import { normalizeCoverConfig } from './coverTemplates.js';
import { normalizeObserverSheetsConfig } from './observerSheetTemplates.js';
import {
    enrichOmrResultForSave,
    getStudentNationalId,
    getStudentSeatNumber,
    normalizeStudentId,
} from './studentIdentity.js';

const OMR_PORTAL_NORM_COLUMNS = [
    'portal_national_norm',
    'portal_student_id_norm',
    'portal_detected_id_norm',
    'portal_norm_detected_id_norm',
];

/** أعمدة Postgres مولَّدة أو metadata — يُحذفها من jsonb `data` قبل upsert */
const STRIP_FROM_JSONB_PAYLOAD = new Set([
    'created_at',
    'updated_at',
    'portal_national_norm',
    'portal_seat_norm',
    'portal_student_id_norm',
    'portal_detected_id_norm',
    'portal_norm_detected_id_norm',
]);

const toJsonbPayload = (item) => {
    if (!item || typeof item !== 'object') return {};
    const payload = { ...item };
    for (const k of STRIP_FROM_JSONB_PAYLOAD) {
        delete payload[k];
    }
    return payload;
};

// --- API Endpoints (Local services) ---
// Browser/Vite dev: relative proxy paths. Packaged Electron: direct localhost (no reverse proxy).
// Override via VITE_OMR_API_BASE / VITE_WHATSAPP_API_BASE at build time if needed.
const isElectron =
    typeof window !== 'undefined' &&
    typeof window.electronAPI !== 'undefined';
const defaultOmrBase = isElectron ? 'http://127.0.0.1:8000' : '/api/omr';
const defaultWaBase = isElectron ? 'http://127.0.0.1:3001' : '/api/whatsapp';

export const OMR_API_BASE = (import.meta.env.VITE_OMR_API_BASE || defaultOmrBase).replace(/\/$/, '');
export const WHATSAPP_API_BASE = (import.meta.env.VITE_WHATSAPP_API_BASE || defaultWaBase).replace(
    /\/$/,
    ''
);

/** عنوان WhatsApp الفعلي: إعدادات التطبيق ← متغير البناء ← افتراضي محلي/بروكسي */
export function resolveWhatsAppApiBase(appConfig) {
    const fromSettings = appConfig?.whatsappApiBase?.trim();
    if (fromSettings) return fromSettings.replace(/\/$/, '');
    const fromEnv = import.meta.env.VITE_WHATSAPP_API_BASE?.trim();
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    return WHATSAPP_API_BASE;
}

export async function getWhatsAppApiBase() {
    try {
        const cfg = await getAppSettings();
        return resolveWhatsAppApiBase(cfg);
    } catch {
        return resolveWhatsAppApiBase(null);
    }
}

// --- Supabase Configuration ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase credentials are missing! Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Connection state (subscribable) ---
let _connectionListeners = [];
let _isConnected = true;

export const subscribeToConnection = (fn) => {
    _connectionListeners.push(fn);
    return () => { _connectionListeners = _connectionListeners.filter(f => f !== fn); };
};

const _setConnected = (state) => {
    if (_isConnected === state) return;
    _isConnected = state;
    _connectionListeners.forEach(fn => fn(state));
};

// --- Error class ---
export class SupabaseError extends Error {
    constructor(table, operation, originalMessage) {
        super(`[${table}/${operation}]: ${originalMessage}`);
        this.table = table;
        this.operation = operation;
        this.originalMessage = originalMessage;
    }
}

// --- Generic Helpers ---
// نُبقي على systemViewImage (صورة مدمجة بصيغة JPEG q65) لتمكين عرض الورقة في
// «كشف المعتمدين». ونحذف reviewRois لأنّها قطع base64 ضخمة لكل سؤال على حدة.
const slimOmrResult = (item) => {
    if (!item || typeof item !== 'object') return item;
    const { reviewRois: _b, ...rest } = item;
    return rest;
};

/** للرصد: بدون صور الورقة لتقليل حجم الجلب وتجنّب انقطاع QUIC على آلاف السجلات */
const slimOmrResultForGrading = (item) => {
    if (!item || typeof item !== 'object') return item;
    const {
        reviewRois: _a,
        systemViewImage: _b,
        systemViewImageThumb: _c,
        sheetImage: _d,
        scanImage: _e,
        originalImage: _f,
        ...rest
    } = item;
    return rest;
};

// --- Core CRUD helpers (Supabase only, throws on error) ---

const mapDataRow = (row) => ({
    id: row.id,
    ...(typeof row.data === 'object' && row.data !== null ? row.data : {}),
});

/** أعمدة الجلب لتجنّب SELECT * على omr_results (PostgREST يولّد استعلاماً ثقيلاً ومهلة 57014 على الجداول الكبيرة). */
const collectionSelect = (tableName) => (tableName === 'omr_results' ? 'id, data' : '*');

const fetchCollection = async (tableName) => {
    const { data, error } = await supabase
        .from(tableName)
        .select(collectionSelect(tableName))
        .range(0, 1999); // Safety cap: max 2000 records per fetch

    if (error) {
        _setConnected(false);
        throw new SupabaseError(tableName, 'fetch', error.message);
    }

    _setConnected(true);
    return (data || []).map(mapDataRow);
};

/** استعلامات أقصر لتجنّب statement timeout على جداول فيها JSONB كبير (مثل صور الورقة). */
const isTimeoutLike = (msg) => {
    const m = String(msg || '').toLowerCase();
    return m.includes('timeout') || m.includes('canceling statement');
};

const isRetryableFetchError = (msg) => {
    const m = String(msg || '').toLowerCase();
    return (
        isTimeoutLike(m) ||
        m.includes('failed to fetch') ||
        m.includes('network') ||
        m.includes('quic') ||
        m.includes('aborted') ||
        m.includes('load failed') ||
        m.includes('connection')
    );
};

/** Supabase Fair Use / تجاوز الحصة (402) */
export const isSupabaseQuotaError = (error) => {
    if (!error) return false;
    const status = error.status ?? error.statusCode;
    if (status === 402) return true;
    const m = String(error.message || error.originalMessage || error).toLowerCase();
    return m.includes('402') || m.includes('quota') || m.includes('egress') || m.includes('fair use');
};

const GRADING_CACHE_KEY = 'elite_omr_grading_cache_v1';
const GRADING_CACHE_TTL_MS = 20 * 60 * 1000;

const readGradingCache = () => {
    try {
        const raw = localStorage.getItem(GRADING_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.at || !Array.isArray(parsed.rows)) return null;
        if (Date.now() - parsed.at > GRADING_CACHE_TTL_MS) {
            localStorage.removeItem(GRADING_CACHE_KEY);
            return null;
        }
        const rows = parsed.rows;
        if (parsed.partial) rows._partialFetch = true;
        return rows;
    } catch {
        return null;
    }
};

const writeGradingCache = (rows) => {
    try {
        localStorage.setItem(
            GRADING_CACHE_KEY,
            JSON.stringify({
                at: Date.now(),
                partial: Boolean(rows?._partialFetch),
                rows: [...rows],
            })
        );
    } catch {
        /* private mode / quota */
    }
};

export const invalidateOmrGradingCache = () => {
    try {
        localStorage.removeItem(GRADING_CACHE_KEY);
    } catch {
        /* ignore */
    }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mapPagedRow = (row, tableName, opts) => {
    const item = mapDataRow(row);
    if (opts.slim === 'grading' && tableName === 'omr_results') return slimOmrResultForGrading(item);
    if (opts.slim && tableName === 'omr_results') return slimOmrResult(item);
    return item;
};

/**
 * جلب الجدول على دفعات (range). يقلّل حجم كل استعلام ويُجنّب انتهاء مهلة السيرفر.
 * @param {string} tableName
 * @param {{ pageSize?: number, maxRows?: number }} [opts]
 */
const fetchCollectionPaged = async (tableName, opts = {}) => {
    const pageSize = Math.max(10, Math.min(opts.pageSize ?? 80, 500));
    const maxRows = Math.max(pageSize, Math.min(opts.maxRows ?? 20000, 100000));
    const partialOnError = opts.partialOnError === true;
    const maxAttempts = Math.max(3, Math.min(opts.maxAttempts ?? 5, 8));
    const all = [];
    let from = 0;

    while (from < maxRows) {
        const to = from + pageSize - 1;
        let lastErr = null;
        let chunkLoaded = false;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            let req = supabase.from(tableName).select(collectionSelect(tableName));
            if (tableName === 'omr_results') {
                req = req.order('id', { ascending: true });
            }
            const { data, error } = await req.range(from, to);

            if (!error) {
                const chunk = (data || []).map((row) => mapPagedRow(row, tableName, opts));
                all.push(...chunk);
                chunkLoaded = true;
                if (!data || data.length < pageSize) {
                    _setConnected(true);
                    return all;
                }
                from += pageSize;
                if (tableName === 'omr_results') {
                    await sleep(opts.pageDelayMs ?? 120);
                }
                break;
            }

            lastErr = error;
            if (isSupabaseQuotaError(error)) {
                _setConnected(false);
                throw new SupabaseError(tableName, 'fetch', error.message);
            }
            if (attempt < maxAttempts - 1 && isRetryableFetchError(error.message)) {
                await sleep(600 * (attempt + 1));
                continue;
            }
            break;
        }

        if (chunkLoaded) continue;

        const errMsg = lastErr?.message || 'Failed to fetch';
        if (isSupabaseQuotaError(lastErr)) {
            _setConnected(false);
            throw new SupabaseError(tableName, 'fetch', errMsg);
        }
        if (partialOnError && all.length > 0) {
            console.warn(
                `[${tableName}] partial fetch stopped at offset ${from}: ${errMsg} — returning ${all.length} rows`
            );
            all._partialFetch = true;
            _setConnected(true);
            return all;
        }

        _setConnected(false);
        throw new SupabaseError(tableName, 'fetch', errMsg);
    }

    _setConnected(true);
    return all;
};

const saveDocument = async (tableName, item) => {
    const docData = { ...item };
    if (!docData.id) {
        docData.id = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
    }

    const persisted =
        tableName === 'omr_results'
            ? slimOmrResult(enrichOmrResultForSave(docData))
            : docData;

    const rowId = String(persisted.id);
    const { error } = await supabase
        .from(tableName)
        .upsert({ id: rowId, data: toJsonbPayload(persisted) });

    if (error) {
        _setConnected(false);
        throw new SupabaseError(tableName, 'save', error.message);
    }

    _setConnected(true);
    return persisted;
};

const deleteDocument = async (tableName, id) => {
    const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', String(id));

    if (error) {
        _setConnected(false);
        throw new SupabaseError(tableName, 'delete', error.message);
    }

    _setConnected(true);
};

// --- API Methods ---

export const getCommittees   = () => fetchCollection('committees');
export const saveCommittee   = (c) => saveDocument('committees', c);
export const deleteCommittee = (id) => deleteDocument('committees', id);

export const getObservers    = () => fetchCollection('observers');
export const saveObserver    = (o) => saveDocument('observers', o);
export const deleteObserver  = (id) => deleteDocument('observers', id);

export const getLocations    = () => fetchCollection('locations');
export const saveLocation    = (l) => saveDocument('locations', l);
export const deleteLocation  = (id) => deleteDocument('locations', id);

export const getStudents     = () => fetchCollection('students');

/** يحدّث نتائج OMR المرتبطة بالهوية القديمة أو برقم الجلوس عند تغيير هوية الطالب. */
export const syncOmrResultsForStudentNationalIdChange = async ({
    previousNationalId,
    nextNationalId,
    seatNumber,
}) => {
    const oldNat = normalizeStudentId(previousNationalId);
    const newNat = normalizeStudentId(nextNationalId);
    if (!newNat) return { updated: 0, scanned: 0 };

    const seatNorm = normalizeStudentId(seatNumber);
    const norms = [...new Set([oldNat, seatNorm].filter(Boolean))];
    const seen = new Set();
    let scanned = 0;
    let updated = 0;

    for (const norm of norms) {
        for (const col of OMR_PORTAL_NORM_COLUMNS) {
            const { data, error } = await supabase
                .from('omr_results')
                .select('id, data')
                .eq(col, norm)
                .limit(500);

            if (error) {
                const em = String(error.message || '');
                if (error.code !== '42703' && !em.includes('portal_')) {
                    console.warn('[syncOmrResults] فهرس', col, error.message || error);
                }
                continue;
            }

            for (const row of data || []) {
                const rid = row?.id != null ? String(row.id) : '';
                if (!rid || seen.has(rid)) continue;
                seen.add(rid);
                scanned++;

                const d = row.data && typeof row.data === 'object' ? row.data : {};
                const patch = enrichOmrResultForSave({
                    ...d,
                    id: rid,
                    nationalId: newNat,
                });
                const prevNat = normalizeStudentId(d.nationalId || d.national_id);
                const prevSid = normalizeStudentId(d.studentId);
                if (prevNat === newNat && prevSid === newNat) continue;

                await saveOmrResult(patch);
                updated++;
            }
        }
    }

    return { updated, scanned };
};

export const saveStudent = async (s) => {
    let previousNationalId = '';
    let previousSeat = '';

    if (s?.id) {
        const { data } = await supabase
            .from('students')
            .select('id, data')
            .eq('id', String(s.id))
            .maybeSingle();
        if (data?.data && typeof data.data === 'object') {
            previousNationalId = getStudentNationalId(data.data);
            previousSeat = getStudentSeatNumber(data.data);
        }
    }

    const saved = await saveDocument('students', s);
    const newNat = getStudentNationalId(saved);
    const newSeat = getStudentSeatNumber(saved) || previousSeat;
    const oldNorm = normalizeStudentId(previousNationalId);
    const newNorm = normalizeStudentId(newNat);

    if (newNorm && oldNorm && oldNorm !== newNorm) {
        try {
            const { updated } = await syncOmrResultsForStudentNationalIdChange({
                previousNationalId,
                nextNationalId: newNat,
                seatNumber: newSeat,
            });
            if (updated > 0) {
                console.info(
                    `[saveStudent] تم تحديث هوية ${updated} نتيجة OMR بعد تغيير الهوية (${oldNorm} → ${newNorm}).`
                );
            }
        } catch (e) {
            console.error('[saveStudent] فشل مزامنة نتائج OMR:', e);
        }
    }

    return saved;
};

export const deleteStudent   = (id) => deleteDocument('students', id);

export const saveStudentsBulk = async (studentList) => {
    const list = Array.isArray(studentList) ? studentList : [];
    const normalized = list.map((s) => ({
        ...s,
        id: String(s.id || `${Date.now()}${Math.floor(Math.random() * 10000)}`),
    }));
    const newIds = new Set(normalized.map((s) => String(s.id)));

    const { data: existingRows, error: fetchErr } = await supabase
        .from('students')
        .select('id')
        .range(0, 1999);

    if (fetchErr) {
        _setConnected(false);
        throw new SupabaseError('students', 'bulk-sync-fetch', fetchErr.message);
    }

    const toDelete = (existingRows || [])
        .map((r) => String(r.id))
        .filter((id) => !newIds.has(id));

    const DEL_CHUNK = 150;
    for (let i = 0; i < toDelete.length; i += DEL_CHUNK) {
        const chunk = toDelete.slice(i, i + DEL_CHUNK);
        const { error: delErr } = await supabase.from('students').delete().in('id', chunk);
        if (delErr) {
            _setConnected(false);
            throw new SupabaseError('students', 'bulk-sync-delete', delErr.message);
        }
    }

    const CHUNK = 100;
    for (let i = 0; i < normalized.length; i += CHUNK) {
        const batch = normalized.slice(i, i + CHUNK);
        const rows = batch.map((s) => ({
            id: String(s.id),
            data: toJsonbPayload(s),
        }));
        const { error } = await supabase.from('students').upsert(rows);
        if (error) {
            _setConnected(false);
            throw new SupabaseError('students', 'bulk-save', error.message);
        }
    }
    _setConnected(true);
    return normalized;
};

import { normalizeAssignments } from './observerAssignments';

// --- Assignments ---
export const getAssignments = async () => {
    const { data, error } = await supabase
        .from('settings')
        .select('data')
        .eq('id', 'assignments')
        .maybeSingle();

    if (error) {
        _setConnected(false);
        throw new SupabaseError('settings/assignments', 'fetch', error.message);
    }

    _setConnected(true);
    if (!data) {
        await supabase.from('settings').upsert({ id: 'assignments', data: {} });
        return normalizeAssignments({});
    }
    return normalizeAssignments(data.data || {});
};

export const saveAssignments = async (assignments) => {
    const { error } = await supabase
        .from('settings')
        .upsert({ id: 'assignments', data: assignments });

    if (error) {
        _setConnected(false);
        throw new SupabaseError('settings/assignments', 'save', error.message);
    }
    _setConnected(true);
    return assignments;
};

// --- App Settings ---
const DEFAULT_APP_SETTINGS = {
    platformName: 'Elite Control System',
    managerName: 'اسم المدير هنا',
    academicWeight: '2025/2026',
    primaryColor: '#4f46e5',
    examSchedule: {
        dayDates: {
            الأحد: '',
            الاثنين: '',
            الثلاثاء: '',
            الأربعاء: '',
            الخميس: '',
        },
        entries: [],
    },
    attendance: {
        headerSubject: { top: 22.5, right: 10, fontSize: 0.85, show: false, bold: true },
        headerDay: { top: 22.5, right: 24, fontSize: 0.85, show: false, bold: true },
        headerDate: { top: 22.5, right: 36, fontSize: 0.85, show: false, bold: true },
        headerPeriod: { top: 22.5, right: 48, fontSize: 0.85, show: false, bold: true },
        headerCommittee: { top: 22.5, right: 60, fontSize: 0.82, show: true },
        headerGrade: { top: 22.5, right: 55, fontSize: 0.85, show: false },
        headerCount: { top: 22.5, right: 76, fontSize: 0.82, show: true },
        table: {
            startTop: 34.2,
            rowHeight: 2.05,
            fontSize: 0.62,
            indexShow: true,
            indexRight: 6.5,
            indexTop: 0,
            nameShow: true,
            nameRight: 15,
            nameTop: 0,
            nameWidthPct: 38,
            seatShow: true,
            seatRight: 46,
            seatTop: 0,
            gradeShow: true,
            gradeRight: 53,
            gradeTop: 0,
            omrShow: false,
            signatureShow: false,
            signatureRight: 78,
            signatureTop: 0,
            rowOverrides: {},
        },
        maxRows: 25, // ATTENDANCE_PAGE_ROWS — قالب ثابت 25 صف
        sheetMetaPreview: {},
    },
    seating: {
        name:       { top: 20, right: 10, fontSize: 1.2 },
        seatNumber: { top: 40, right: 10, fontSize: 1.5 },
        grade:      { top: 60, right: 10, fontSize: 1.0 },
        committee:  { top: 80, right: 10, fontSize: 1.0 },
    },
    seatCard: {
        name: {
            top: 42,
            left: 11,
            fontSize: 1.05,
            color: '#0f172a',
            textAlign: 'left',
            shrinkToFit: true,
            maxWidthPct: 46,
            minFontSize: 0.88,
        },
        grade:      { top: 52, left: 14, fontSize: 0.95, color: '#0f172a', textAlign: 'left' },
        seatNumber: { top: 62, left: 14, fontSize: 2.2, color: '#2563eb', textAlign: 'left' },
    },
    notifyCard: {
        name: {
            top: 22,
            right: 12,
            fontSize: 1.1,
            color: '#111827',
            textAlign: 'right',
            shrinkToFit: true,
            maxWidthPct: 55,
            minFontSize: 0.85,
        },
        seatNumber: { top: 38, right: 12, fontSize: 1.8, color: '#4f46e5', textAlign: 'right' },
        grade: { top: 52, right: 12, fontSize: 0.95, color: '#1f2937', textAlign: 'right' },
        committee: { top: 66, right: 12, fontSize: 1.05, color: '#065f46', textAlign: 'right' },
    },
    coverLibrary: {
        items: [],
    },
    covers: {},
    observerSheets: {},
    /** إنتاج: خادم WPP على VPS */
    whatsappApiBase: 'https://wpp.northelite0.com',
    messages: {
        committee: 'عزيزي ولي أمر الطالب {name}، موعد اختبار ابنكم في لجنة {committee}، رقم الجلوس: {seatNumber}',
        result:    'تم إعلان نتائج {name}. يمكنك الاطلاع عليها عبر البوابة.',
    },
};

function normalizeAppSettings(config = {}) {
    const next = { ...DEFAULT_APP_SETTINGS, ...config };
    const wa = String(next.whatsappApiBase ?? DEFAULT_APP_SETTINGS.whatsappApiBase ?? '').trim();
    next.whatsappApiBase = wa ? wa.replace(/\/$/, '') : '';
    return next;
}

export const getAppSettings = async () => {
    const { data, error } = await supabase
        .from('settings')
        .select('data')
        .eq('id', 'app_config')
        .maybeSingle();

    if (error) {
        _setConnected(false);
        throw new SupabaseError('settings/app_config', 'fetch', error.message);
    }

    _setConnected(true);
    if (!data) {
        const initial = normalizeObserverSheetsConfig(
            normalizeCoverConfig(normalizeAppSettings(DEFAULT_APP_SETTINGS))
        );
        await supabase.from('settings').upsert({ id: 'app_config', data: initial });
        return initial;
    }
    return normalizeObserverSheetsConfig(
        normalizeCoverConfig(normalizeAppSettings({ ...DEFAULT_APP_SETTINGS, ...data.data }))
    );
};

export const saveAppSettings = async (config) => {
    const data = normalizeObserverSheetsConfig(normalizeCoverConfig(normalizeAppSettings(config)));
    const { error } = await supabase
        .from('settings')
        .upsert({ id: 'app_config', data });

    if (error) {
        _setConnected(false);
        throw new SupabaseError('settings/app_config', 'save', error.message);
    }
    _setConnected(true);
    return data;
};

// --- OMR Subjects (persisted in Supabase) ---
const DEFAULT_SUBJECTS = [
    { id: '1', name: 'لغة عربية', grades: ['All'] },
    { id: '2', name: 'رياضيات', grades: ['All'] },
    { id: '3', name: 'علوم', grades: ['All'] },
    { id: '4', name: 'دراسات اجتماعية', grades: ['All'] },
    { id: '5', name: 'تربية إسلامية', grades: ['All'] },
    { id: '6', name: 'لغة إنجليزية', grades: ['All'] },
    { id: '7', name: 'حاسب آلي', grades: ['All'] },
    { id: '8', name: 'تربية وطنية', grades: ['All'] },
    { id: '9', name: 'تربية بدنية', grades: ['All'] },
    { id: '10', name: 'تربية فنية', grades: ['All'] },
];

export const getOmrSubjects = async () => {
    const { data, error } = await supabase
        .from('settings')
        .select('data')
        .eq('id', 'omr_subjects')
        .maybeSingle();

    if (error) {
        _setConnected(false);
        throw new SupabaseError('settings/omr_subjects', 'fetch', error.message);
    }

    _setConnected(true);
    if (!data) {
        await supabase.from('settings').upsert({ id: 'omr_subjects', data: DEFAULT_SUBJECTS });
        return [...DEFAULT_SUBJECTS];
    }
    return data.data || [...DEFAULT_SUBJECTS];
};

export const saveOmrSubjects = async (subjects) => {
    const { error } = await supabase
        .from('settings')
        .upsert({ id: 'omr_subjects', data: subjects });

    if (error) {
        _setConnected(false);
        throw new SupabaseError('settings/omr_subjects', 'save', error.message);
    }
    _setConnected(true);
    return subjects;
};

// --- OMR Methods ---
const examIsArchived = (e) => {
    if (!e || typeof e !== 'object') return false;
    const v = e.archived;
    return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
};

/** @param {{ includeArchived?: boolean }} [opts] — if false (default), rows with `archived: true` are omitted */
export const getOmrExams = async (opts = {}) => {
    const { includeArchived = false } = opts;
    const rows = await fetchCollection('omr_exams');
    if (includeArchived) return rows;
    return rows.filter((e) => !examIsArchived(e));
};
export const saveOmrExam    = (e) => saveDocument('omr_exams', e);
export const deleteOmrExam  = (id) => deleteDocument('omr_exams', id);

/** نتائج OMR: جلب صفحي (صفوف أقل لكل استعلام) لأن حقل data قد يحتوي صوراً كبيرة وتسبب statement timeout */
export const getOmrResults = () =>
    fetchCollectionPaged('omr_results', { pageSize: 50, maxRows: 25000, partialOnError: true });

const mapGradingRpcRow = (row) => ({
    id: row.id,
    ...(typeof row.payload === 'object' && row.payload !== null ? row.payload : {}),
});

/** جلب خفيف عبر RPC (بدون صور) — يقلّل Egress بشكل كبير */
const fetchOmrResultsGradingViaRpc = async (opts = {}) => {
    const pageSize = Math.max(20, Math.min(opts.pageSize ?? 80, 200));
    const maxRows = Math.max(pageSize, Math.min(opts.maxRows ?? 25000, 100000));
    const partialOnError = opts.partialOnError === true;
    const all = [];
    let offset = 0;

    while (offset < maxRows) {
        let lastErr = null;
        let chunk = null;

        for (let attempt = 0; attempt < 4; attempt++) {
            const { data, error } = await supabase.rpc('fetch_omr_results_grading_page', {
                p_limit: pageSize,
                p_offset: offset,
            });

            if (!error) {
                chunk = (data || []).map(mapGradingRpcRow);
                break;
            }

            lastErr = error;
            const missingFn =
                error.code === 'PGRST202' ||
                String(error.message || '').includes('fetch_omr_results_grading_page');
            if (missingFn) return null;

            if (isSupabaseQuotaError(error)) throw new SupabaseError('omr_results/rpc', 'fetch', error.message);

            if (attempt < 3 && isRetryableFetchError(error.message)) {
                await sleep(700 * (attempt + 1));
                continue;
            }
            break;
        }

        if (chunk) {
            all.push(...chunk);
            if (chunk.length < pageSize) {
                _setConnected(true);
                return all;
            }
            offset += pageSize;
            await sleep(opts.pageDelayMs ?? 80);
            continue;
        }

        const errMsg = lastErr?.message || 'Failed to fetch';
        if (partialOnError && all.length > 0) {
            all._partialFetch = true;
            _setConnected(true);
            return all;
        }
        _setConnected(false);
        throw new SupabaseError('omr_results/rpc', 'fetch', errMsg);
    }

    _setConnected(true);
    return all;
};

/**
 * نتائج للرصد: RPC خفيف (إن وُجد) + كاش محلي 20 دقيقة + fallback بدون صور.
 */
export const getOmrResultsForGrading = async (opts = {}) => {
    if (!opts.forceRefresh) {
        const cached = readGradingCache();
        if (cached) return cached;
    }

    let rows = await fetchOmrResultsGradingViaRpc({
        pageSize: 80,
        maxRows: 25000,
        partialOnError: true,
        pageDelayMs: 80,
    });

    if (rows === null) {
        rows = await fetchCollectionPaged('omr_results', {
            pageSize: 35,
            maxRows: 25000,
            partialOnError: true,
            slim: 'grading',
            pageDelayMs: 150,
            maxAttempts: 6,
        });
    }

    writeGradingCache(rows);
    return rows;
};

export const saveOmrResult = async (r) => {
    const out = await saveDocument('omr_results', r);
    invalidateOmrGradingCache();
    return out;
};

export const deleteOmrResult = async (id) => {
    await deleteDocument('omr_results', id);
    invalidateOmrGradingCache();
};

// --- Clear All Data (Supabase) ---
export const clearAllData = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف جميع البيانات من قاعدة البيانات السحابية؟ لا يمكن التراجع عن هذا الإجراء.')) return;

    const tables = ['students', 'committees', 'observers', 'locations', 'omr_exams', 'omr_results'];
    const errors = [];

    for (const table of tables) {
        const { error } = await supabase.from(table).delete().neq('id', '__placeholder__');
        if (error) errors.push(`${table}: ${error.message}`);
    }

    // Reset settings to defaults
    await supabase.from('settings').upsert({ id: 'app_config',   data: DEFAULT_APP_SETTINGS });
    await supabase.from('settings').upsert({ id: 'assignments',  data: {} });
    await supabase.from('settings').upsert({ id: 'omr_subjects', data: DEFAULT_SUBJECTS });

    if (errors.length > 0) {
        console.error('⚠️ بعض الجداول فشلت في الحذف:', errors);
    }

    window.location.reload();
};
