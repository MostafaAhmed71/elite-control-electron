import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '❌ أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في student-portal-standalone/.env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTimeoutLike = (msg) => {
  const m = String(msg || '').toLowerCase();
  return m.includes('timeout') || m.includes('canceling statement');
};

/** أخطاء قد تنجح بعد إعادة المحاولة (شبكة، مهلة Postgres 57014، إلخ). */
const isTransientFetch = (input) => {
  if (input == null) return false;
  const obj =
    typeof input === 'object' && (input.message != null || input.code != null)
      ? input
      : { message: input };
  const m = String(obj.message || '').toLowerCase();
  const code = obj.code != null ? String(obj.code) : '';
  return (
    isTimeoutLike(obj.message) ||
    code === '57014' ||
    m.includes('failed to fetch') ||
    m.includes('network error') ||
    m.includes('load failed') ||
    m.includes('ecconnreset')
  );
};

function throwSupabaseFetch(label, lastError) {
  const err = new Error(lastError?.message || `فشل جلب ${label}`);
  err.code = 'SUPABASE_FETCH';
  err.details = lastError;
  if (lastError && typeof lastError === 'object') {
    err.pgCode = lastError.code;
    err.pgMessage = lastError.message;
    err.pgHint = lastError.hint;
  }
  console.error(`[بوابة الطالب] فشل جلب ${label}:`, lastError);
  throw err;
}

/** إعادة المحاولة عند انقطاع الشبكة أو أخطاء Supabase المؤقتة (لا نُرجع [] وكأن لا توجد نتائج). */
async function selectAllWithRetry(table, mapRow, { retries = 3, label = table } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    const { data, error } = await supabase.from(table).select('*');
    if (!error) {
      return (data || []).map(mapRow);
    }
    lastError = error;
    if (!isTransientFetch(error.message)) {
      throwSupabaseFetch(label, lastError);
    }
    if (attempt < retries - 1) {
      await sleep(350 * (attempt + 1));
    }
  }
  throwSupabaseFetch(label, lastError);
}

/** إزالة حقول ثقيلة من json في المتصفح — استعلام PostgREST يبقى `id,data` فقط (يتجنب timeout و400). */
function stripHeavyOmrPayload(d) {
  if (!d || typeof d !== 'object') return {};
  const out = { ...d };
  for (const k of ['reviewRois', 'systemViewImage', 'sheetPreview', 'previewUrl', 'details']) {
    delete out[k];
  }
  return out;
}

/** صف من الجدول بصيغة نتيجة بوابة — يتوافق مع select('id,data'). */
function mapOmrPortalRowFromDb(row) {
  const d = stripHeavyOmrPayload(row.data && typeof row.data === 'object' ? row.data : {});
  return { id: row.id, _rowCreatedAt: inferRowCreatedFromData(d), ...d };
}

/** أول طابع زمني صالح من حقول النتيجة (للترتيب عند غياب عمود وقت في الجدول). */
const inferRowCreatedFromData = (rest) => {
  const keys = ['timestamp', 'createdAt', 'scannedAt', 'date', 'examDate'];
  for (const k of keys) {
    const v = rest[k];
    if (v == null || String(v).trim() === '') continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return v;
  }
  return null;
};

/**
 * استعلام عبر دالة Postgres `portal_fetch_omr_for_national` (بعد تشغيل supabase/migrations/portal.sql).
 */
export const fetchOmrResultsForNationalViaRpc = async (nationalNorm, onProgress) => {
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'scan', loaded: 0, pageIndex: 0, totalCount: null });
  }
  const { data, error } = await supabase.rpc('portal_fetch_omr_for_national', {
    national_norm: nationalNorm,
  });
  if (error) {
    const quietTimeout = String(error.code || '') === '57014';
    const log = quietTimeout ? console.warn.bind(console) : console.error.bind(console);
    log('[portal_fetch_omr_for_national]', error.code, error.message, error.details);
    const err = new Error(error.message);
    err.code = 'RPC_ERROR';
    err.details = error;
    if (error.code) err.pgCode = error.code;
    throw err;
  }
  const rows = (data || []).map((row) => {
    const d = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const stripped = stripHeavyOmrPayload(d);
    return { id: row.id, _rowCreatedAt: inferRowCreatedFromData(stripped), ...stripped };
  });
  if (typeof onProgress === 'function') {
    onProgress({
      phase: 'scan',
      loaded: rows.length,
      pageIndex: 1,
      totalCount: rows.length,
    });
  }
  return rows;
};

/** يطابق نتائج تظهر للطالب في البوابة (معتمدة أو سجلات قديمة بدرجة). */
export const isApprovedPortalOmrRow = (r) => {
  const t = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  if (t(r?.approved) || t(r?.confirmed)) return true;
  if (r?.approvedAt != null && String(r.approvedAt).trim() !== '') return true;
  const sid = r?.studentId != null ? String(r.studentId).trim() : '';
  if (sid && r?.score != null) return true;
  return false;
};

const PORTAL_ID_NORM_COLUMNS = [
  'portal_national_norm',
  'portal_student_id_norm',
  'portal_detected_id_norm',
  'portal_norm_detected_id_norm',
];

const dedupeRowsById = (rows) => {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const id = r?.id != null ? String(r.id) : '';
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(r);
  }
  return out;
};

const fetchOmrRowsByPortalNormColumn = async (column, norm) => {
  const { data, error } = await supabase
    .from('omr_results')
    .select('id, data')
    .eq(column, norm)
    .limit(500);

  if (error) {
    const em = String(error.message || '');
    if (!em.includes('portal_') && error.code !== '42703') {
      console.warn(`[بوابة الطالب] فهرس ${column}:`, error.message || error);
    }
    return [];
  }

  return (data || [])
    .map(mapOmrPortalRowFromDb)
    .filter(isApprovedPortalOmrRow);
};

const portalNormKey = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const easternArabic = '۰۱۲۳۴۵۶۷۸۹';
  const latin = raw
    .split('')
    .map((ch) => {
      const ia = arabicIndic.indexOf(ch);
      if (ia >= 0) return String(ia);
      const ie = easternArabic.indexOf(ch);
      if (ie >= 0) return String(ie);
      return ch;
    })
    .join('');
  return latin.replace(/[^a-zA-Z0-9]/g, '').replace(/^0+/, '').trim();
};

/** نتائج مربوطة برقم الجلوس عندما تغيّرت هوية الطالب في السجل ولم تُحدَّث النتائج بعد. */
export const fetchOmrResultsByStudentSeats = async (student) => {
  const seats = [student?.seatNumber, student?.seat_number]
    .map((v) => portalNormKey(v))
    .filter(Boolean);
  const uniqueSeats = [...new Set(seats)];
  if (!uniqueSeats.length) return [];

  const cols = [
    'portal_student_id_norm',
    'portal_detected_id_norm',
    'portal_norm_detected_id_norm',
  ];
  const chunks = [];
  for (const seat of uniqueSeats) {
    for (const col of cols) {
      chunks.push(await fetchOmrRowsByPortalNormColumn(col, seat));
    }
  }
  return dedupeRowsById(chunks.flat());
};

/** كل المعرفات المعروفة للطالب (هوية، جلوس، معرف نظام…) بعد التطبيع. */
export const collectStudentIdentityNorms = (student, inputNorm) => {
  const norms = new Set();
  const add = (v) => {
    const k = portalNormKey(v);
    if (k) norms.add(k);
  };
  const n = String(inputNorm || '').trim().replace(/,/g, '');
  if (n) norms.add(n);
  if (student && typeof student === 'object') {
    for (const key of [
      'nationalId',
      'national_id',
      'id',
      'studentId',
      'student_id',
      'seatNumber',
      'seat_number',
    ]) {
      add(student[key]);
    }
  }
  return norms;
};

const omrRowIdentityKeys = (row) =>
  [
    row.nationalId,
    row.national_id,
    row.studentId,
    row.detectedStudentId,
    row.normalizedDetectedStudentId,
    row.seatNumber,
    row.seat_number,
  ]
    .map((f) => portalNormKey(f))
    .filter(Boolean);

const omrRowMatchesIdentityNorms = (row, norms) => {
  if (!isApprovedPortalOmrRow(row)) return false;
  return omrRowIdentityKeys(row).some((k) => norms.has(k));
};

/** مطابقة بالجلوس أو الاسم عند تغيير الهوية دون مزامنة النتائج بعد. */
const omrRowMatchesStudentRecordLoose = (row, student) => {
  if (!student || !isApprovedPortalOmrRow(row)) return false;

  const seatNorm = portalNormKey(student.seatNumber || student.seat_number);
  if (seatNorm && omrRowIdentityKeys(row).includes(seatNorm)) return true;

  const name = String(student.name || '').trim();
  const rName = String(row.studentName || '').trim();
  if (name.length >= 4 && rName.length >= 4 && name === rName) return true;

  return false;
};

const PORTAL_LOOKUP_CACHE_MS = 5 * 60 * 1000;
const _portalLookupCache = new Map();

/** مسح صفحي — فقط عند غياب الفهارس/RPC (محدود + يتوقف عند أول نتائج). */
const fetchOmrResultsClientFallback = async (identityNorms, student, onProgress) => {
  const norms = identityNorms instanceof Set ? identityNorms : new Set(identityNorms);
  if (!norms.size && !student) return [];

  const pageSize = 50;
  const maxPages = 24;
  const out = [];

  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let data = null;
    let error = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await supabase.from('omr_results').select('id, data').range(from, to);
      data = res.data;
      error = res.error;
      if (!error) break;
      if (!isTransientFetch(error)) break;
      await sleep(450 * (attempt + 1));
    }

    if (error) {
      console.warn('[بوابة الطالب] مسح احتياطي omr_results:', error.message || error);
      break;
    }
    if (!data?.length) break;

    for (const row of data) {
      const mapped = mapOmrPortalRowFromDb(row);
      if (omrRowMatchesIdentityNorms(mapped, norms)) out.push(mapped);
      else if (student && omrRowMatchesStudentRecordLoose(mapped, student)) out.push(mapped);
    }

    if (typeof onProgress === 'function') {
      onProgress({
        phase: 'scan',
        loaded: out.length,
        pageIndex: page + 1,
        totalCount: null,
      });
    }

    if (out.length > 0 && page >= 1) break;
    if (data.length < pageSize) break;
  }

  return dedupeRowsById(out);
};

/**
 * بحث شامل للبوابة: فهارس + RPC + كل معرفات الطالب + مسح احتياطي.
 * @returns {{ rows: object[], source: string }}
 */
export const fetchOmrResultsForPortalLookup = async (inputNorm, student, onProgress) => {
  const norm = String(inputNorm || '').trim().replace(/,/g, '');
  if (!norm) return { rows: [], source: 'empty' };

  const cacheKey = `${norm}|${student?.id || ''}`;
  const cached = _portalLookupCache.get(cacheKey);
  if (cached && Date.now() - cached.t < PORTAL_LOOKUP_CACHE_MS) {
    return cached.v;
  }

  const identityNorms = collectStudentIdentityNorms(student, norm);
  let merged = [];
  let source = 'empty';

  try {
    const pack = await fetchOmrResultsForNationalSmart(norm, onProgress);
    merged = pack.rows || [];
    source = pack.source || 'empty';
  } catch (e) {
    if (e?.code !== 'PORTAL_FAST_PATH_FAILED') throw e;
    console.warn('[بوابة الطالب] المسار السريع فشل؛ يُستخدم البحث الموسّع.', e.message);
  }

  if (merged.length > 0) {
    const result = { rows: merged, source };
    _portalLookupCache.set(cacheKey, { t: Date.now(), v: result });
    return result;
  }

  const extraNorms = [...identityNorms].filter((n) => n !== norm);
  const extraQueries = [];
  for (const n of extraNorms) {
    for (const col of PORTAL_ID_NORM_COLUMNS) {
      extraQueries.push(fetchOmrRowsByPortalNormColumn(col, n));
    }
  }
  if (student) {
    extraQueries.push(fetchOmrResultsByStudentSeats(student));
  }
  if (extraQueries.length > 0) {
    const chunks = await Promise.all(extraQueries);
    merged = dedupeRowsById(chunks.flat());
    if (merged.length > 0) source = 'merged';
  }

  if (merged.length > 0) {
    const result = { rows: merged, source };
    _portalLookupCache.set(cacheKey, { t: Date.now(), v: result });
    return result;
  }

  if (identityNorms.size > 0 || student) {
    const scanned = await fetchOmrResultsClientFallback(identityNorms, student, onProgress);
    merged = scanned;
    if (scanned.length) source = 'fallback';
  }

  const result = {
    rows: merged,
    source: merged.length && source === 'empty' ? 'merged' : source,
  };
  if (merged.length > 0) {
    _portalLookupCache.set(cacheKey, { t: Date.now(), v: result });
  }
  return result;
};

/**
 * بحث بالهوية: دمج عدة فهارس + RPC (لا نكتفي بـ nationalId فقط).
 * @returns {{ rows: object[], source: 'index' | 'rpc' | 'merged' | 'empty' }}
 */
export const fetchOmrResultsForNationalSmart = async (nationalNorm, onProgress) => {
  if (typeof onProgress === 'function') {
    onProgress({ phase: 'scan', loaded: 0, pageIndex: 0, totalCount: null });
  }

  const norm = String(nationalNorm || '').trim().replace(/,/g, '');
  if (!norm) return { rows: [], source: 'empty' };

  const indexChunks = await Promise.all(
    PORTAL_ID_NORM_COLUMNS.map((col) => fetchOmrRowsByPortalNormColumn(col, norm))
  );
  let merged = dedupeRowsById(indexChunks.flat());

  if (typeof onProgress === 'function') {
    onProgress({
      phase: 'scan',
      loaded: merged.length,
      pageIndex: 1,
      totalCount: merged.length || null,
    });
  }

  if (merged.length > 0) {
    return { rows: merged, source: 'index' };
  }

  let lastRpcErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rpcRows = (await fetchOmrResultsForNationalViaRpc(norm, onProgress)).filter(
        isApprovedPortalOmrRow
      );
      merged = dedupeRowsById(rpcRows);
      if (typeof onProgress === 'function') {
        onProgress({
          phase: 'scan',
          loaded: merged.length,
          pageIndex: 1,
          totalCount: merged.length,
        });
      }
      if (merged.length > 0) {
        return { rows: merged, source: merged.length === rpcRows.length && indexChunks.every((c) => c.length === 0) ? 'rpc' : 'merged' };
      }
      return { rows: [], source: 'empty' };
    } catch (e) {
      lastRpcErr = e;
      const transient =
        isTransientFetch(e?.details) ||
        isTransientFetch({ message: e?.message, code: e?.pgCode });
      if (attempt < 2 && transient) {
        await sleep(450 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  const msg = String(lastRpcErr?.message || '');
  const pg = String(lastRpcErr?.details?.code || lastRpcErr?.pgCode || '');
  const missingFn =
    pg === '42883' ||
    msg.includes('does not exist') ||
    msg.toLowerCase().includes('portal_fetch');
  const stmtTimeout =
    pg === '57014' ||
    isTimeoutLike(msg) ||
    msg.toLowerCase().includes('canceling statement');

  if (merged.length > 0) {
    return { rows: merged, source: 'index' };
  }

  const err = new Error(
    missingFn
      ? 'الاستعلام السريع غير مفعّل على الخادم. افتح Supabase → SQL Editor ونفِّذ ملف student-portal-standalone/supabase/migrations/portal.sql ثم أعد المحاولة.'
      : stmtTimeout
        ? 'انتهت مهلة الخادم أثناء البحث عن النتائج. أعد المحاولة بعد قليل أو تأكد من تنفيذ آخر نسخة من supabase/migrations/portal.sql.'
        : msg || 'فشل استعلام النتائج من الخادم.'
  );
  err.code = 'PORTAL_FAST_PATH_FAILED';
  err.cause = lastRpcErr;
  throw err;
};

/**
 * @typedef {object} PortalScanProgress
 * @property {'scan'} phase
 * @property {number} loaded
 * @property {number} pageIndex
 * @property {number | null} totalCount — من استعلام count، قد يكون null
 */

const OMR_DETAILS_SELECT = 'id,details:data->details';

/**
 * يجلب حقل details (جدول الإجابات) لصفوف محددة فقط — بعد تصفية البوابة، لتجنب timeout على المسح الكامل.
 * @param {(p: { phase: 'details'; loaded: number; total: number }) => void} [onProgress]
 */
export const hydrateOmrResultsDetails = async (rows, onProgress) => {
  const ids = rows.map((r) => r.id).filter((id) => id != null && String(id).trim() !== '');
  if (ids.length === 0) return rows;

  const detailsById = new Map();
  const chunkSize = 35;
  const totalChunks = Math.ceil(ids.length / chunkSize);
  let chunkDone = 0;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    let data = null;
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await supabase.from('omr_results').select(OMR_DETAILS_SELECT).in('id', slice);
      if (!res.error) {
        data = res.data;
        lastError = null;
        break;
      }
      lastError = res.error;
      if (!isTransientFetch(res.error)) break;
      await sleep(450 * (attempt + 1));
    }

    if (lastError && !data) {
      console.warn('[بوابة الطالب] تعذر جلب تفاصيل الأسئلة:', lastError.message);
      const fallback = await supabase.from('omr_results').select('id,data').in('id', slice);
      if (!fallback.error) {
        for (const row of fallback.data || []) {
          const d = row.data && typeof row.data === 'object' ? row.data.details : undefined;
          if (d != null) detailsById.set(row.id, d);
        }
      }
      continue;
    }

    for (const row of data || []) {
      if (row && row.id != null && row.details != null) detailsById.set(row.id, row.details);
    }

    chunkDone += 1;
    if (typeof onProgress === 'function') {
      onProgress({ phase: 'details', loaded: chunkDone, total: totalChunks });
    }
  }

  return rows.map((r) => {
    if (r.id == null || !detailsById.has(r.id)) return r;
    return { ...r, details: detailsById.get(r.id) };
  });
};

let _studentsCache = { t: 0, v: null };
let _examsCache = { t: 0, v: null };
let _examsPortalCache = { t: 0, v: null };
const META_CACHE_MS = 90_000;
const EXAMS_PORTAL_CACHE_MS = 30 * 60 * 1000;

/** طالب بالهوية — فهرس الخادم ثم مطابقة يدوية على القائمة (يدعم الهوية في id أو studentId). */
export const findStudentByNormalizedNationalId = async (normalizedNationalId) => {
  const n = String(normalizedNationalId || '').trim().replace(/,/g, '');
  if (!n) return null;

  const { data, error } = await supabase
    .from('students')
    .select('id, data')
    .eq('portal_national_norm', n)
    .maybeSingle();

  if (!error && data) return { id: data.id, ...data.data };

  const em = String(error?.message || '');
  if (error && error.code !== 'PGRST116' && error.code !== '42703' && !em.includes('portal_national_norm')) {
    console.warn('[بوابة الطالب] findStudentByNormalizedNationalId:', error.message || error);
  }

  try {
    const students = await getStudentsCached();
    for (const s of students) {
      for (const key of [
        s.nationalId,
        s.national_id,
        s.id,
        s.studentId,
        s.student_id,
      ]) {
        if (portalNormKey(key) === n) return s;
      }
    }
  } catch (e) {
    console.warn('[بوابة الطالب] تعذر تحميل قائمة الطلاب للمطابقة:', e);
  }

  return null;
};

/** اختبارات خفيفة (عنوان + أرشفة) مع تخزين أطول لتقليل حجم النقل */
export const getOmrExamsPortalCached = async () => {
  const now = Date.now();
  if (_examsPortalCache.v && now - _examsPortalCache.t < EXAMS_PORTAL_CACHE_MS) {
    return _examsPortalCache.v;
  }
  const { data, error } = await supabase
    .from('omr_exams')
    .select('id, archived:data->archived, title:data->title, keys:data->keys, weights:data->weights');
  if (!error && data) {
    const v = data.map((row) => ({
      id: row.id,
      archived: row.archived,
      title: row.title,
      keys: row.keys,
      weights: row.weights,
    }));
    _examsPortalCache = { t: now, v };
    return v;
  }
  const v = await getOmrExamsCached();
  _examsPortalCache = { t: now, v };
  return v;
};

/** طلبات إعادة الاختبار للطالب فقط — بدون جلب الجدول بالكامل */
export const getMyRetakeRequestsForNational = async (normalizedNationalId) => {
  const n = String(normalizedNationalId || '').trim().replace(/,/g, '');
  if (!n) return [];
  const mapRows = (rows) =>
    (rows || []).map((row) => ({ id: row.id, _rowCreatedAt: row.created_at, ...row.data }));
  const q = await supabase
    .from('retake_requests')
    .select('*')
    .or(`data->>nationalId.eq.${n},data->>studentId.eq.${n}`);
  if (!q.error) return mapRows(q.data);
  const fb = await supabase.from('retake_requests').select('*');
  if (fb.error) return [];
  return mapRows(fb.data).filter(
    (r) =>
      String(r.nationalId || '').replace(/\D/g, '') === n ||
      String(r.studentId || '').replace(/\D/g, '') === n ||
      String(r.seatNumber || '').replace(/\D/g, '') === n
  );
};
export const getStudentsCached = async () => {
  const now = Date.now();
  if (_studentsCache.v && now - _studentsCache.t < META_CACHE_MS) return _studentsCache.v;
  const v = await getStudents();
  _studentsCache = { t: now, v };
  return v;
};

/** قائمة الاختبارات مع تخزين مؤقت. */
export const getOmrExamsCached = async () => {
  const now = Date.now();
  if (_examsCache.v && now - _examsCache.t < META_CACHE_MS) return _examsCache.v;
  const v = await getOmrExams();
  _examsCache = { t: now, v };
  return v;
};

/**
 * جلب نتائج OMR على دفعات (مثل التطبيق الرئيسي) لتفادي انتهاء مهلة الاستعلام
 * عندما يكون عمود data كبيراً (صور مراجعة، إلخ).
 */
export const getOmrResults = async () => {
  const pageSize = 50;
  const maxRows = 25000;
  const all = [];
  let from = 0;

  while (from < maxRows) {
    const to = from + pageSize - 1;
    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.from('omr_results').select('id, data').range(from, to);

      if (!error) {
        const chunk = (data || []).map(mapOmrPortalRowFromDb);
        all.push(...chunk);
        if (!data || data.length < pageSize) return all;
        from += pageSize;
        lastError = null;
        break;
      }

      lastError = error;
      if (!isTransientFetch(error)) {
        throwSupabaseFetch('omr_results', error);
      }
      if (attempt < 2) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      throwSupabaseFetch('omr_results', error);
    }

    if (lastError) throwSupabaseFetch('omr_results', lastError);
  }

  return all;
};

export const getOmrExams = () =>
  selectAllWithRetry('omr_exams', (item) => ({ id: item.id, ...item.data }), { label: 'الاختبارات' });

/** نفس منطق التطبيق الرئيسي: الاختبار مؤرشف؟ */
export const examIsArchived = (e) => {
  if (!e || typeof e !== 'object') return false;
  const v = e.archived;
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
};

export const getStudents = () =>
  selectAllWithRetry('students', (item) => ({ id: item.id, ...item.data }), { label: 'قائمة الطلاب' });

export const getAppSettings = async () => {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 'app_config').single();
  if (error || !data) return { platformName: 'نظام الكنترول' };
  return data.data;
};

/* ──────────────────────────────────────────────
   Retake Requests (طلبات إعادة الاختبار)
   جدول Supabase المطلوب:  retake_requests
   عمود: id (uuid), data (jsonb) — وقد يوجد created_at حسب إعداد الجدول
─────────────────────────────────────────────── */

/** الاثنين القادم (أو الاثنين التالي لو اليوم اثنين) */
export const getNextMonday = () => {
  const d = new Date();
  const day = d.getDay(); // 0=Sun … 1=Mon … 6=Sat
  let diff = (1 - day + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff);
  d.setHours(8, 0, 0, 0);
  return d;
};

/** مفتاح تاريخ محلي YYYY-MM-DD لمقارنة المواعيد */
export const toLocalDateKey = (isoOrDate) => {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** هل طلب الإعادة لنفس المادة/الاختبار؟ */
export const retakeMatchesResult = (retake, result) => {
  const examId = result.examId != null ? String(result.examId) : '';
  const examTitle = String(result.examTitle || '').trim();
  const rEid = retake.examId != null ? String(retake.examId) : '';
  const rTitle = String(retake.examTitle || '').trim();
  if (examId && rEid && examId === rEid) return true;
  if (examTitle && rTitle && examTitle === rTitle) return true;
  return false;
};

/** طلب نشط = موعده الاثنين القادم (لا يشمل إعادة الأحد أو أي موعد سابق) */
export const isRetakeForUpcomingMonday = (retake) => {
  if (!retake?.scheduledDate) return false;
  return toLocalDateKey(retake.scheduledDate) === toLocalDateKey(getNextMonday());
};

/** تقديم طلب إعادة اختبار */
export const requestRetake = async (payload) => {
  const scheduledDate = getNextMonday();
  const record = {
    ...payload,
    scheduledDate: scheduledDate.toISOString(),
    requestedAt: new Date().toISOString(),
    status: 'pending',
  };
  const { data, error } = await supabase
    .from('retake_requests')
    .insert({ data: record })
    .select()
    .single();
  if (error) {
    console.error('requestRetake error:', error);
    throw error;
  }
  return { id: data.id, _rowCreatedAt: data.created_at, ...record };
};

/** جلب طلبات طالب معين (لاستخدامها في بوابة الطالب) */
export const getMyRetakeRequests = async (studentIdOrSeat) => {
  const { data, error } = await supabase.from('retake_requests').select('*');
  if (error) return [];
  return data
    .map((row) => ({ id: row.id, _rowCreatedAt: row.created_at, ...row.data }))
    .filter(
      (r) =>
        r.studentId === studentIdOrSeat ||
        r.nationalId === studentIdOrSeat ||
        r.seatNumber === studentIdOrSeat
    );
};

/** جلب كل الطلبات (لواجهة الإدارة) */
export const getAllRetakeRequests = async () => {
  const { data, error } = await supabase
    .from('retake_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return [];
  return data.map((row) => ({ id: row.id, _rowCreatedAt: row.created_at, ...row.data }));
};

/** حذف طلب إعادة اختبار (للإدارة) */
export const deleteRetakeRequest = async (id) => {
  const { error } = await supabase.from('retake_requests').delete().eq('id', id);
  if (error) throw error;
  return true;
};
