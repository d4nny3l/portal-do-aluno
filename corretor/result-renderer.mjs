const ALLOWED_STATUS_CLASSES = new Set(["ok", "err", "warn"]);

export function renderSafeResult(document, answers, key, offset = 0) {
  if (!document || !Array.isArray(answers) || !Array.isArray(key) || !Number.isInteger(offset) || offset < 0) throw new TypeError("Resultado de leitura inválido.");
  const body = document.getElementById("body");
  const score = document.getElementById("score");
  if (!body || !score) throw new Error("A tabela de resultados não está disponível.");
  body.replaceChildren();
  let hits = 0;

  answers.forEach((answer, index) => {
    const answerIndex = offset + index;
    const expected = key[answerIndex];
    const className = answer === "?" ? "warn" : answer === expected ? "ok" : "err";
    if (answer === expected) hits++;
    const row = document.createElement("tr");
    const statusText = answer === "?" ? "⚠ Revisar" : answer === expected ? "✓ Acerto" : "✕ Erro";
    for (const [value, klass] of [[answerIndex + 1, ""], [answer, ""], [expected, ""], [statusText, className]]) {
      const cell = document.createElement("td");
      cell.textContent = String(value ?? "");
      if (klass && ALLOWED_STATUS_CLASSES.has(klass)) cell.className = klass;
      row.appendChild(cell);
    }
    body.appendChild(row);
  });

  score.replaceChildren();
  const total = document.createTextNode(`${hits}/${answers.length}`);
  const detail = document.createElement("small");
  detail.textContent = "questões acertadas";
  score.append(total, detail);
  return hits;
}
