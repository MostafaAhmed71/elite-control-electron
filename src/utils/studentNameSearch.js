/** تطبيع جزء من الاسم للمقارنة (تشكيل، همزات، تاء مربوطة...) */
export function normalizeNamePart(str) {
  return String(str ?? '')
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .toLowerCase();
}

export function splitStudentName(fullName) {
  return String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeNamePart);
}

/**
 * يطابق الاسم الأول فقط، أو الاسم الأول + الثاني.
 * @returns {boolean}
 */
export function matchStudentByNameQuery(student, query) {
  const nameParts = splitStudentName(student?.name);
  if (!nameParts.length) return false;

  const queryParts = String(query ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeNamePart);

  if (!queryParts.length || queryParts.length > 2) return false;

  if (queryParts.length === 1) {
    return nameParts[0] === queryParts[0];
  }

  return nameParts.length >= 2 && nameParts[0] === queryParts[0] && nameParts[1] === queryParts[1];
}

export function searchStudentsByName(students, query) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  return (students || []).filter((s) => matchStudentByNameQuery(s, q));
}
