/**
 * OMR grading — shared between scanner, exams admin, and student portal.
 */

const toNum = (v, fallback = 0) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : fallback;
};

export const grade = (scanned, keys, weights = {}) => {
  let score = 0;
  let totalPossible = 0;
  const details = {};
  const qs = Object.keys(keys || {});

  qs.forEach((q) => {
    const correct = keys[q];
    const got = (scanned?.[q] ?? "").toString();
    const ok = got === correct;
    const weight = toNum(weights?.[q], 1);

    if (ok) score += weight;
    totalPossible += weight;

    details[q] = {
      student_answer: got,
      correct_option: correct,
      is_correct: ok,
      weight,
    };
  });

  const scoreN = toNum(score, 0);
  const totalN = toNum(totalPossible, 0);

  return {
    score: parseFloat(scoreN.toFixed(2)),
    total: parseFloat(totalN.toFixed(2)),
    percentage: totalN > 0 ? ((scoreN / totalN) * 100).toFixed(2) : "0",
    details,
  };
};

export const extractAnswersFromResult = (result) => {
  if (result?.answers && typeof result.answers === "object") {
    const keys = Object.keys(result.answers);
    if (keys.length > 0) return { ...result.answers };
  }
  const out = {};
  for (const [q, d] of Object.entries(result?.details || {})) {
    if (d && typeof d === "object") {
      out[q] = (d.student_answer ?? "").toString();
    }
  }
  return out;
};

export const normalizeExamWeights = (weights = {}) => {
  const out = {};
  for (const [q, w] of Object.entries(weights)) {
    out[q] = toNum(w, 1);
  }
  return out;
};

export const regradeResultWithExam = (result, exam) => {
  const keys = exam?.keys || {};
  if (!keys || Object.keys(keys).length === 0) {
    return { result, changed: false };
  }

  const answers = extractAnswersFromResult(result);
  if (Object.keys(answers).length === 0) {
    return { result, changed: false };
  }

  const graded = grade(answers, keys, normalizeExamWeights(exam?.weights || {}));
  const prevScore = toNum(result?.score, NaN);
  const prevTotal = toNum(result?.total, NaN);
  const prevPct = String(result?.percentage ?? "");

  const changed =
    graded.score !== prevScore ||
    graded.total !== prevTotal ||
    prevPct !== String(graded.percentage) ||
    JSON.stringify(graded.details) !== JSON.stringify(result?.details ?? {});

  return {
    changed,
    result: {
      ...result,
      answers,
      score: graded.score,
      total: graded.total,
      percentage: graded.percentage,
      details: graded.details,
      regradedAt: new Date().toISOString(),
    },
  };
};

export const applyExamKeysToResults = (results, examsList) => {
  const byId = new Map((examsList || []).map((e) => [String(e.id), e]));
  return (results || []).map((r) => {
    const exam = byId.get(String(r.examId ?? ""));
    if (!exam?.keys || Object.keys(exam.keys).length === 0) return r;
    return regradeResultWithExam(r, exam).result;
  });
};