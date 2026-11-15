-- Synthetic principals/grants; never applied to an academic database.
INSERT OR IGNORE INTO assessment_principals VALUES
 ('a1111111-1111-4111-8111-111111111111','lab:teacher-one','Professor sintético A'),
 ('b2222222-2222-4222-8222-222222222222','lab:teacher-two','Professor sintético B');
INSERT OR IGNORE INTO assessment_grants VALUES
 ('a1111111-1111-4111-8111-111111111111','c1111111-1111-4111-8111-111111111111','p2026-4','Turma sintética A · 4º bimestre',1),
 ('b2222222-2222-4222-8222-222222222222','c2222222-2222-4222-8222-222222222222','p2026-4','Turma sintética B · 4º bimestre',1);
