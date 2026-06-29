/**
 * Student identity: national ID is the stable key; seat number is separate.
 */

const ARABIC_INDIC = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';
const EASTERN_ARABIC = '\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9';

export const normalizeStudentId = (value) => {
  const raw = (value ?? '').toString().trim();
  if (!raw) return '';

  const latinDigits = raw
    .split('')
    .map((ch) => {
      const idxA = ARABIC_INDIC.indexOf(ch);
      if (idxA >= 0) return String(idxA);
      const idxE = EASTERN_ARABIC.indexOf(ch);
      if (idxE >= 0) return String(idxE);
      return ch;
    })
    .join('');

  const alnum = latinDigits.replace(/[^a-zA-Z0-9]/g, '');
  return alnum.replace(/^0+/, '').trim();
};

export const getStudentNationalId = (s) =>
  String(s?.nationalId || s?.national_id || '').trim();

export const getStudentSeatNumber = (s) =>
  String(s?.seatNumber || s?.seat_number || '').trim();

/** Prefer national ID match before seat number. */
export const findStudentByDetectedId = (studentsList, detectedId) => {
  const normalizedDetected = normalizeStudentId(detectedId);
  if (!normalizedDetected) return null;

  const pool = Array.isArray(studentsList) ? studentsList : [];

  const byNational = pool.find((s) => {
    const nat = normalizeStudentId(getStudentNationalId(s));
    return nat && nat === normalizedDetected;
  });
  if (byNational) return byNational;

  const byLegacyStudentId = pool.find((s) => {
    const sid = normalizeStudentId(s?.studentId || s?.student_id || '');
    return sid && sid === normalizedDetected;
  });
  if (byLegacyStudentId) return byLegacyStudentId;

  const bySeat = pool.find((s) => {
    const seat = normalizeStudentId(getStudentSeatNumber(s));
    return seat && seat === normalizedDetected;
  });
  if (bySeat) return bySeat;

  return (
    pool.find((s) => {
      const dbId = normalizeStudentId(s?.id);
      return dbId && dbId === normalizedDetected;
    }) || null
  );
};

export const looksLikeNationalId = (value) => {
  const n = normalizeStudentId(value);
  return n.length >= 8;
};

export const resolveOmrStudentFields = ({ student, omrData, manualMapEntry }) => {
  const detectedRaw = (omrData?.student_id ?? '').toString().trim();
  const detectedNorm = normalizeStudentId(detectedRaw);
  const manual = manualMapEntry || null;

  const nationalFromStudent = getStudentNationalId(student);
  const manualNat = String(manual?.nationalId || '').trim();
  const manualSid = String(manual?.studentId || '').trim();

  let nationalId = nationalFromStudent || manualNat || '';
  if (!nationalId && manualSid && looksLikeNationalId(manualSid)) {
    nationalId = manualSid;
  }
  if (!nationalId && detectedNorm && looksLikeNationalId(detectedRaw)) {
    nationalId = detectedRaw;
  }

  const seatNumber = student
    ? getStudentSeatNumber(student)
    : String(manual?.seatNumber || '').trim();

  const canonicalStudentId =
    nationalId ||
    (student && detectedRaw) ||
    manualSid ||
    detectedRaw ||
    '';

  const studentName = student?.name || manual?.studentName || '';

  return {
    nationalId,
    seatNumber,
    studentId: canonicalStudentId,
    detectedStudentId: detectedRaw,
    normalizedDetectedStudentId: detectedNorm,
    resolvedByManualMap: !student && !!manual,
    studentName,
    studentGrade:
      student?.grade ||
      student?.classroom ||
      manual?.studentGrade ||
      '',
    phone: student?.phone || manual?.phone || '',
  };
};

/** Ensures nationalId is stored so the student portal index can find results. */
export const enrichOmrResultForSave = (doc) => {
  if (!doc || typeof doc !== 'object') return doc;
  const out = { ...doc };

  let nat = String(out.nationalId || out.national_id || '').trim();
  if (!nat) {
    const sid = String(out.studentId || '').trim();
    const det = String(out.detectedStudentId || '').trim();
    if (sid && looksLikeNationalId(sid)) nat = sid;
    else if (det && looksLikeNationalId(det)) nat = det;
  }

  if (nat) {
    out.nationalId = nat;
    if (!out.national_id) out.national_id = nat;
    if (!out.studentId || looksLikeNationalId(out.studentId) || looksLikeNationalId(out.detectedStudentId)) {
      out.studentId = nat;
    }
  }

  return out;
};

export const effectiveOmrScanTemplate = (template) => {
  const t = String(template || 'default').trim();
  if (t.startsWith('custom:')) return 'nafs';
  return t || 'default';
};
