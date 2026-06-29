import { EXAM_WEEKDAYS, periodLabel } from './examSchedule';

/** @typedef {{ version: 2, slots: Record<string, Record<string, string[]>> }} ObserverAssignmentStore */

export function assignmentSlotKey(day, period) {
  const p = parseInt(period, 10) === 2 ? 2 : 1;
  const d = EXAM_WEEKDAYS.includes(day) ? day : EXAM_WEEKDAYS[0];
  return `${d}|${p}`;
}

export function parseAssignmentSlotKey(key) {
  const [day, periodStr] = String(key || '').split('|');
  return {
    day: EXAM_WEEKDAYS.includes(day) ? day : null,
    period: parseInt(periodStr, 10) === 2 ? 2 : 1,
  };
}

/** تحويل التنسيق القديم (لجنة → معرفات) إلى v2 حسب اليوم والفترة */
export function normalizeAssignments(raw) {
  if (!raw || typeof raw !== 'object') {
    return { version: 2, slots: {} };
  }
  if (raw.version === 2 && raw.slots && typeof raw.slots === 'object') {
    const slots = {};
    for (const [key, slot] of Object.entries(raw.slots)) {
      if (!slot || typeof slot !== 'object') continue;
      const normalized = {};
      for (const [committeeId, ids] of Object.entries(slot)) {
        if (Array.isArray(ids) && ids.length) normalized[committeeId] = [...ids];
      }
      if (Object.keys(normalized).length) slots[key] = normalized;
    }
    return { version: 2, slots };
  }

  const legacy = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'version' || k === 'slots') continue;
    if (Array.isArray(v) && v.length) legacy[k] = [...v];
  }
  const slots = {};
  if (Object.keys(legacy).length) {
    slots[assignmentSlotKey(EXAM_WEEKDAYS[0], 1)] = legacy;
  }
  return { version: 2, slots };
}

export function getSlotAssignments(store, day, period) {
  const normalized = normalizeAssignments(store);
  const key = assignmentSlotKey(day, period);
  return normalized.slots[key] || {};
}

export function getCommitteeObserverIds(store, day, period, committeeId) {
  const slot = getSlotAssignments(store, day, period);
  return slot[committeeId] || [];
}

/** خريطة لجنة → معرفات للطباعة حسب فلاتر اليوم والفترة */
export function resolveCommitteeAssignmentsMap(assignments, filters = {}) {
  const store = normalizeAssignments(assignments);
  const period = parseInt(filters.period, 10) === 2 ? 2 : 1;
  const day = filters.day;

  if (day && day !== 'الكل') {
    return getSlotAssignments(store, day, period);
  }

  const merged = {};
  for (const [key, slot] of Object.entries(store.slots)) {
    const parsed = parseAssignmentSlotKey(key);
    if (parsed.period !== period) continue;
    for (const [committeeId, ids] of Object.entries(slot || {})) {
      const prev = merged[committeeId] || [];
      merged[committeeId] = [...new Set([...prev, ...(ids || [])])];
    }
  }
  return merged;
}

function committeeLabel(committees, committeeId) {
  const c = (committees || []).find((x) => x.id === committeeId);
  return c?.name || 'لجنة أخرى';
}

/**
 * تحذيرات عند إسناد ملاحظ
 * @returns {{ type: 'sameDayPeriod'|'sameDayOtherPeriod'|'otherDay', message: string, slotKey?: string, committeeId?: string }[]}
 */
export function checkObserverAssignmentWarnings(
  store,
  { day, period, committeeId, observerId, committees = [], observers = [] }
) {
  if (!observerId) return [];
  const normalized = normalizeAssignments(store);
  const slotKey = assignmentSlotKey(day, period);
  const p = parseInt(period, 10) === 2 ? 2 : 1;
  const observerName =
    observers.find((o) => o.id === observerId)?.name || 'الملاحظ';
  const warnings = [];

  const sameSlot = normalized.slots[slotKey] || {};
  for (const [cid, ids] of Object.entries(sameSlot)) {
    if (cid === committeeId) continue;
    if ((ids || []).includes(observerId)) {
      warnings.push({
        type: 'sameDayPeriod',
        committeeId: cid,
        slotKey,
        message: `${observerName} مُسنَد مسبقاً إلى «${committeeLabel(committees, cid)}» في نفس اليوم والفترة.`,
      });
    }
  }

  const otherPeriod = p === 1 ? 2 : 1;
  const otherPeriodKey = assignmentSlotKey(day, otherPeriod);
  const otherPeriodSlot = normalized.slots[otherPeriodKey] || {};
  for (const [cid, ids] of Object.entries(otherPeriodSlot)) {
    if ((ids || []).includes(observerId)) {
      warnings.push({
        type: 'sameDayOtherPeriod',
        committeeId: cid,
        slotKey: otherPeriodKey,
        message: `${observerName} مُسنَد في ${periodLabel(otherPeriod)} من نفس اليوم (لجنة «${committeeLabel(committees, cid)}»).`,
      });
    }
  }

  for (const [key, slot] of Object.entries(normalized.slots)) {
    if (key === slotKey || key === otherPeriodKey) continue;
    const parsed = parseAssignmentSlotKey(key);
    if (!parsed.day) continue;
    for (const [cid, ids] of Object.entries(slot || {})) {
      if (!(ids || []).includes(observerId)) continue;
      warnings.push({
        type: 'otherDay',
        committeeId: cid,
        slotKey: key,
        message: `${observerName} مُسنَد في يوم «${parsed.day}» — ${periodLabel(parsed.period)} (لجنة «${committeeLabel(committees, cid)}»).`,
      });
    }
  }

  return warnings;
}

export function formatWarningConfirmBody(warnings) {
  if (!warnings.length) return '';
  const lines = warnings.map((w, i) => `${i + 1}. ${w.message}`).join('\n');
  return `${lines}\n\nهل تريد إسناده رغم التكرار؟`;
}

export function setCommitteeObservers(store, day, period, committeeId, observerIds) {
  const normalized = normalizeAssignments(store);
  const key = assignmentSlotKey(day, period);
  const nextSlot = { ...(normalized.slots[key] || {}) };
  const ids = [...new Set((observerIds || []).filter(Boolean))];
  if (ids.length) nextSlot[committeeId] = ids;
  else delete nextSlot[committeeId];

  const nextSlots = { ...normalized.slots };
  if (Object.keys(nextSlot).length) nextSlots[key] = nextSlot;
  else delete nextSlots[key];

  return { version: 2, slots: nextSlots };
}

export function addObserverToCommittee(store, day, period, committeeId, observerId) {
  const current = getCommitteeObserverIds(store, day, period, committeeId);
  if (current.includes(observerId)) return normalizeAssignments(store);
  return setCommitteeObservers(store, day, period, committeeId, [...current, observerId]);
}

export function removeObserverFromCommittee(store, day, period, committeeId, observerId) {
  const current = getCommitteeObserverIds(store, day, period, committeeId);
  return setCommitteeObservers(
    store,
    day,
    period,
    committeeId,
    current.filter((id) => id !== observerId)
  );
}

/** ملاحظون مُسنَدون أكثر من مرة في نفس اليوم/الفترة */
export function findSameSlotDuplicates(store, day, period, observers = []) {
  const slot = getSlotAssignments(store, day, period);
  const countByObserver = {};
  for (const ids of Object.values(slot)) {
    for (const id of ids || []) {
      countByObserver[id] = (countByObserver[id] || 0) + 1;
    }
  }
  return Object.entries(countByObserver)
    .filter(([, n]) => n > 1)
    .map(([id, count]) => ({
      observerId: id,
      name: observers.find((o) => o.id === id)?.name || id,
      count,
    }));
}

export { EXAM_WEEKDAYS };
