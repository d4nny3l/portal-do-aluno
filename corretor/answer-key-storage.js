(function exposeAnswerKeyStorage(root) {
  "use strict";

  function normalizeSavedAnswerKey(raw) {
    if (typeof raw !== "string" || raw.length > 8192) return null;
    let stored;
    try { stored = JSON.parse(raw); } catch { return null; }
    const answers = Array.isArray(stored) ? stored : stored?.answers;
    const declaredCount = Array.isArray(stored) ? stored.length : Number(stored?.count);
    if (!Array.isArray(answers) || !Number.isInteger(declaredCount) || declaredCount < 1 || declaredCount > 50 || answers.length !== declaredCount) return null;
    if (!answers.every(answer => answer === "" || ["A", "B", "C", "D", "E"].includes(answer))) return null;
    return Object.freeze({ count: declaredCount, answers: Object.freeze([...answers]) });
  }

  const api = Object.freeze({ normalizeSavedAnswerKey });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SaltaAnswerKeyStorage = api;
})(globalThis);
