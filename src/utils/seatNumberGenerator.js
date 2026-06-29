const STORAGE_KEY = 'elite_seat_gen_cursor';

/** اسم العرض للترتيب (يدعم حقولاً بديلة) */
export function getStudentSortName(student) {
  return String(student?.name ?? student?.studentName ?? student?.fullName ?? '').trim();
}

/** توحيد الحروف العربية قبل المقارنة */
export function normalizeArabicSortKey(text) {
  return String(text)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .toLowerCase();
}

/** ترتيب حسب رقم الجلوس ثم الاسم */
export function compareStudentsBySeatNumber(a, b) {
  const na = parseSeatNumber(a?.seatNumber);
  const nb = parseSeatNumber(b?.seatNumber);
  if (na != null && nb != null) {
    const d = na - nb;
    if (d !== 0) return d;
  } else if (na != null) return -1;
  else if (nb != null) return 1;
  return compareStudentNames(a, b);
}

/** مقارنة أبجدية عربية موحّدة — للتوليد والعرض */
export function compareStudentNames(a, b) {
  const ka = normalizeArabicSortKey(getStudentSortName(a));
  const kb = normalizeArabicSortKey(getStudentSortName(b));
  const cmp = ka.localeCompare(kb, 'ar', { sensitivity: 'base', numeric: true });
  if (cmp !== 0) return cmp;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'ar');
}

export function matchesStageGrade(student, stage, grade) {
  return (
    String(student?.stage ?? '').trim() === String(stage ?? '').trim() &&
    String(student?.grade ?? '').trim() === String(grade ?? '').trim()
  );
}

export function parseSeatNumber(seat) {
  const n = parseInt(String(seat ?? '').replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

export function loadStageSeatCursors() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStageSeatCursor(stage, nextNumber) {
  if (!stage) return;
  const cursors = loadStageSeatCursors();
  cursors[stage] = nextNumber;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cursors));
}

/** أعلى رقم جلوس مسجّل في المرحلة */
export function getMaxSeatInStage(students, stage) {
  const nums = students
    .filter((s) => s.stage === stage)
    .map((s) => parseSeatNumber(s.seatNumber))
    .filter((n) => n != null);
  return nums.length ? Math.max(...nums) : null;
}

/**
 * الرقم التالي المقترح: يكمل من آخر صف في نفس المرحلة
 * (محفوظ محلياً أو من أرقام الطلاب الحالية).
 */
export function getSuggestedSeatStart(students, stage) {
  const cursors = loadStageSeatCursors();
  const cursor = cursors[stage];
  const maxInStage = getMaxSeatInStage(students, stage);
  const nextFromDb = maxInStage != null ? maxInStage + 1 : null;

  if (cursor != null && nextFromDb != null) return Math.max(cursor, nextFromDb);
  if (cursor != null) return cursor;
  if (nextFromDb != null) return nextFromDb;
  return 1001;
}

/** تعيين أرقام متسلسلة لطلاب صف واحد — الترتيب أبجدي بالاسم ثم 1001، 1002، ... */
export function assignSeatsToGrade(students, stage, grade, startNum) {
  const targets = students
    .filter((s) => matchesStageGrade(s, stage, grade))
    .sort(compareStudentNames);

  const idToSeat = new Map();
  let cursor = startNum;
  for (const t of targets) {
    idToSeat.set(String(t.id), String(cursor++));
  }

  const updated = students.map((s) => {
    const seat = idToSeat.get(String(s.id));
    if (seat == null) return s;
    return { ...s, seatNumber: seat };
  });

  return {
    updated,
    count: targets.length,
    lastAssigned: targets.length ? cursor - 1 : null,
    nextStart: cursor,
    /** ترتيب التوليد الفعلي (للمراجعة) */
    sortedTargets: targets,
  };
}

const hasSeatNumber = (s) =>
  s.seatNumber != null && String(s.seatNumber).trim() !== '';

/** إزالة أرقام الجلوس لجميع طلاب صف معيّن */
export function clearSeatsForGrade(students, stage, grade) {
  let count = 0;
  const updated = students.map((s) => {
    if (!matchesStageGrade(s, stage, grade)) return s;
    if (!hasSeatNumber(s)) return s;
    count += 1;
    const next = { ...s };
    delete next.seatNumber;
    return next;
  });
  return { updated, count };
}
