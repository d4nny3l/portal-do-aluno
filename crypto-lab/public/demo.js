import {
  createSaltaIdentity,
  createSaltaScope,
  EncryptedRepository,
  fingerprintPublicKey,
  serializeIdentityPublicKey,
  unwrapScopeKey
} from "../../security/crypto/index.js";

const status = document.querySelector("#status");
const button = document.querySelector("#run");
const results = document.querySelector("#results");
const setStatus = (message, state = "") => {
  status.textContent = message;
  status.dataset.state = state;
};

async function localRequest(path, body) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "A operação local falhou.");
  return result;
}

async function runDemo() {
  if (!["localhost","127.0.0.1","::1"].includes(location.hostname)) {
    throw new Error("Este ensaio só pode ser executado em localhost.");
  }
  const tenantId = crypto.randomUUID();
  const scopeId = crypto.randomUUID();
  const teacherOneId = crypto.randomUUID();
  const teacherTwoId = crypto.randomUUID();
  const teacherOneMembership = crypto.randomUUID();
  const teacherTwoMembership = crypto.randomUUID();
  setStatus("Gerando identidades sintéticas no navegador…");
  const [one, two] = await Promise.all([
    createSaltaIdentity({ tenantId, userId: teacherOneId, keyVersion: 1 }),
    createSaltaIdentity({ tenantId, userId: teacherTwoId, keyVersion: 1 })
  ]);

  const onePublic = await serializeIdentityPublicKey(one.identity.publicKey);
  const twoPublic = await serializeIdentityPublicKey(two.identity.publicKey);
  const oneFingerprint = await fingerprintPublicKey(onePublic);
  const twoFingerprint = await fingerprintPublicKey(twoPublic);
  await localRequest("/__lab/seed", {
    tenant_id: tenantId,
    scope_id: scopeId,
    academic_year: new Date().getFullYear(),
    members: [
      { user_id: teacherOneId, membership_id: teacherOneMembership, role: "tenant_admin", public_key: one.publicKey, fingerprint: oneFingerprint, can_read: 1, can_write: 1, can_share: 1 },
      { user_id: teacherTwoId, membership_id: teacherTwoMembership, role: "teacher", public_key: two.publicKey, fingerprint: twoFingerprint, can_read: 1, can_write: 1, can_share: 0 }
    ]
  });

  setStatus("Criando chave de turma e envelopes HPKE…");
  const scope = await createSaltaScope({
    tenantId,
    scopeId,
    keyVersion: 1,
    recipients: [
      { recipientId: teacherOneId, publicKey: one.identity.publicKey, confirmedFingerprint: oneFingerprint },
      { recipientId: teacherTwoId, publicKey: two.identity.publicKey, confirmedFingerprint: twoFingerprint }
    ]
  });
  const repoOne = new EncryptedRepository({
    endpoint: "",
    actorId: teacherOneId,
    membershipId: teacherOneMembership,
    tenantId,
    scopeId,
    keyVersion: 1,
    scopeKey: scope.key,
    permissions: ["read","write","share"],
    labPrincipalHeader: true
  });
  for (const envelope of scope.envelopes) await repoOne.publishEnvelope(envelope);

  const objectId = crypto.randomUUID();
  const syntheticDiary = {
    student_label: "Estudante Sintético A",
    subject_label: "Matemática",
    bimesters: [
      { period: 1, grades: [{ item: "Avaliação sintética 1", value: 8.5, maximum: 10 }], attendance: { present: 18, total: 20 } },
      { period: 2, grades: [{ item: "Avaliação sintética 2", value: 7.5, maximum: 10 }], attendance: { present: 19, total: 20 } }
    ]
  };
  setStatus("Cifrando e gravando dados sintéticos…");
  await repoOne.save({ type: "diary.student.v1", data: syntheticDiary, objectId });

  const repoTwoWithoutKey = new EncryptedRepository({
    endpoint: "",
    actorId: teacherTwoId,
    membershipId: teacherTwoMembership,
    tenantId,
    scopeId,
    keyVersion: 1,
    permissions: ["read","write"],
    labPrincipalHeader: true
  });
  const envelope = await repoTwoWithoutKey.getMyEnvelope();
  const teacherTwoScopeKey = await unwrapScopeKey(envelope, two.identityKeyPair, {
    tenantId, scopeId, recipientId: teacherTwoId, keyVersion: 1
  });
  const repoTwo = new EncryptedRepository({
    endpoint: "",
    actorId: teacherTwoId,
    membershipId: teacherTwoMembership,
    tenantId,
    scopeId,
    keyVersion: 1,
    scopeKey: teacherTwoScopeKey,
    permissions: ["read","write"],
    labPrincipalHeader: true
  });
  const opened = await repoTwo.load({ objectId });
  const scores = opened.bimesters.flatMap(item => item.grades.map(grade => grade.value));
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const page = await repoTwo.listEncrypted({ limit: 10 });
  results.hidden = false;
  results.innerHTML = "";
  const rows = [
    ["Instituição sintética", tenantId],
    ["Professores autorizados", "2 identidades locais"],
    ["Registros armazenados", String(page.objects.length) + " ciphertext"],
    ["Aluno", opened.student_label],
    ["Média calculada no navegador", average.toFixed(2).replace(".", ",")],
    ["Frequência calculada no navegador", opened.bimesters.map(item => String(item.attendance.present) + "/" + String(item.attendance.total)).join(" · ")],
    ["Envelope recuperado", "HPKE · versão de chave 1"]
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    title.textContent = label;
    detail.textContent = value;
    row.append(title,detail);
    results.append(row);
  }
  setStatus("Fluxo local concluído. O Worker recebeu ciphertext, envelope de chave e metadados; a média foi calculada aqui.", "success");
}

button.addEventListener("click", async () => {
  button.disabled = true;
  results.hidden = true;
  try {
    await runDemo();
  } catch (error) {
    setStatus(error?.message || "O experimento falhou.", "error");
  } finally {
    button.disabled = false;
  }
});
