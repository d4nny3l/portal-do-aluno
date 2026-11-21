// Explicit #85 candidate delta over #74. This is not an audited production release.
export const CONTRACT_BASE='7080d2de0b5a01bbe417b71732221a869e7a4d42';
export const SCORE_FORMAT_RUNTIME_FILES=Object.freeze([
 'assessments-service/definition.mjs',
 'assessments-service/worker.mjs',
 'corretor/v2/assessments/block-scoring.mjs',
 'corretor/v2/assessments/private-contract-adapter.mjs',
 'corretor/v2/assessments/score-format.mjs'
]);
export const SCORE_FORMAT_PATHS=Object.freeze([
 ...SCORE_FORMAT_RUNTIME_FILES,
 'assessments-service/tests/score-format.test.mjs',
 'corretor/v2/tests/block-scoring-p1.test.mjs',
 'plataforma/tests/corretor-integrated-planner-p1.test.mjs',
 'docs/avaliacoes/FORMATO_NOTA_P1_85.md',
 '.github/workflows/test-assessments-service.yml'
]);
export const SCORE_FORMAT_DOWNGRADE_GUARD=` // An older client must not silently erase an explicitly saved presentation choice.
 if (a&&!Object.hasOwn(definition.display,'scoreDecimals')) {
  const previous=await load(db,actor,ring,id,a.current_revision);
  if (Object.hasOwn(previous.definition.display,'scoreDecimals'))
   deny(409,'score_format_required','Reabra com um cliente compatível antes de salvar o formato da nota.');
 }
`;
