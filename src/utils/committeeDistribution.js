import { parseSeatNumber, compareStudentsBySeatNumber } from './seatNumberGenerator';
import {
  committeeMatchKey,
  committeesForGrade,
  getStudentsInCommittee,
} from './committeeUtils';

export { compareStudentsBySeatNumber } from './seatNumberGenerator';

export function committeeNameForStudent(committee) {
  return String(committee?.name || '').replace(/^لجنة\s*/i, '').trim();
}

function committeeSortKey(committee) {
  const key = committeeMatchKey(committee?.name);
  const n = parseInt(String(key).replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? String(key) : n;
}

export function sortCommitteesForDistribution(committees) {
  return [...(committees || [])].sort((a, b) => {
    const ka = committeeSortKey(a);
    const kb = committeeSortKey(b);
    if (typeof ka === 'number' && typeof kb === 'number') return ka - kb;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'ar', { numeric: true });
  });
}

/** طلاب الصف — مرتّبون برقم الجلوس */
export function studentsForDistributionPool(students, stage, grade, { requireSeat = true } = {}) {
  let pool = (students || []).filter(
    (s) => s.stage === stage && s.grade === grade
  );
  if (requireSeat) {
    pool = pool.filter((s) => parseSeatNumber(s.seatNumber) != null);
  }
  return pool.sort(compareStudentsBySeatNumber);
}

/** أصغر وأكبر رقم جلوس في الصف (للمعاينة) */
export function getSeatRangeForGrade(students, stage, grade) {
  const pool = studentsForDistributionPool(students, stage, grade);
  if (!pool.length) return null;
  const nums = pool.map((s) => parseSeatNumber(s.seatNumber)).filter((n) => n != null);
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums), count: pool.length };
}

/**
 * توزيع متسلسل حسب ترتيب رقم الجلوس الفعلي (من رقم البداية الذي أُدخل في بطاقات الجلوس)
 * @param {'unassigned' | 'redistribute'} mode
 */
export function planSequentialCommitteeDistribution({
  committees,
  students,
  stage,
  grade,
  mode = 'unassigned',
  targetCommittee = null,
}) {
  const gradeCommittees = sortCommitteesForDistribution(
    committeesForGrade(committees, students, grade, stage)
  );

  const pool = studentsForDistributionPool(students, stage, grade);
  const withoutSeat = (students || []).filter(
    (s) =>
      s.stage === stage &&
      s.grade === grade &&
      parseSeatNumber(s.seatNumber) == null &&
      (mode === 'redistribute' || !String(s.committee || '').trim())
  );

  if (mode === 'redistribute') {
    const activeCommittees = gradeCommittees.filter(
      (c) => getStudentsInCommittee(c, students).length > 0
    );
    if (!activeCommittees.length) {
      return {
        assignments: [],
        toClear: [],
        committees: [],
        skippedNoSeat: withoutSeat.length,
        message: 'لا توجد لجان موزّعة في هذا الصف لإعادة التوزيع.',
      };
    }

    const toClear = [];
    const idSet = new Set();
    for (const committee of activeCommittees) {
      for (const s of getStudentsInCommittee(committee, students)) {
        toClear.push(s);
        idSet.add(String(s.id));
      }
    }

    const queue = pool.filter((s) => idSet.has(String(s.id)));
    const assignments = [];
    let qi = 0;
    for (const committee of activeCommittees) {
      const cap = Math.max(1, parseInt(committee.capacity, 10) || 24);
      for (let i = 0; i < cap && qi < queue.length; i++) {
        assignments.push({
          student: queue[qi],
          committee,
          committeeName: committeeNameForStudent(committee),
        });
        qi++;
      }
    }

    const firstSeat = assignments[0]?.student?.seatNumber;
    const lastSeat = assignments[assignments.length - 1]?.student?.seatNumber;

    return {
      assignments,
      toClear,
      committees: activeCommittees,
      skippedNoSeat: withoutSeat.length,
      remainingInQueue: queue.length - assignments.length,
      firstSeat,
      lastSeat,
    };
  }

  if (targetCommittee) {
    const cap = Math.max(1, parseInt(targetCommittee.capacity, 10) || 24);
    const current = getStudentsInCommittee(targetCommittee, students).length;
    const slots = Math.max(0, cap - current);
    const queue = pool.filter((s) => !String(s.committee || '').trim());
    const assignments = queue.slice(0, slots).map((student) => ({
      student,
      committee: targetCommittee,
      committeeName: committeeNameForStudent(targetCommittee),
    }));

    return {
      assignments,
      toClear: [],
      committees: [targetCommittee],
      skippedNoSeat: withoutSeat.length,
      remainingInQueue: Math.max(0, queue.length - assignments.length),
      firstSeat: assignments[0]?.student?.seatNumber,
      lastSeat: assignments[assignments.length - 1]?.student?.seatNumber,
    };
  }

  const queue = pool.filter((s) => !String(s.committee || '').trim());
  const assignments = [];
  let qi = 0;

  for (const committee of gradeCommittees) {
    const current = getStudentsInCommittee(committee, students).length;
    const cap = Math.max(1, parseInt(committee.capacity, 10) || 24);
    const slots = Math.max(0, cap - current);
    for (let i = 0; i < slots && qi < queue.length; i++) {
      assignments.push({
        student: queue[qi],
        committee,
        committeeName: committeeNameForStudent(committee),
      });
      qi++;
    }
  }

  return {
    assignments,
    toClear: [],
    committees: gradeCommittees,
    skippedNoSeat: withoutSeat.length,
    remainingInQueue: Math.max(0, queue.length - qi),
    firstSeat: assignments[0]?.student?.seatNumber,
    lastSeat: assignments[assignments.length - 1]?.student?.seatNumber,
  };
}

/** تطبيق خطة التوزيع على قائمة الطلاب */
export function applyDistributionPlan(students, plan) {
  const assignMap = new Map(
    (plan.assignments || []).map((a) => [String(a.student.id), a.committeeName])
  );
  const clearIds = new Set((plan.toClear || []).map((s) => String(s.id)));

  return (students || []).map((s) => {
    const id = String(s.id);
    if (assignMap.has(id)) {
      return { ...s, committee: assignMap.get(id) };
    }
    if (clearIds.has(id)) {
      return { ...s, committee: '' };
    }
    return s;
  });
}
