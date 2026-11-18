import {importCardManifest} from '../corretor/v2/omr/manifest.mjs';
import {renderTemplateSvg} from '../corretor/v2/omr/render.mjs';

const fail = message => { throw new TypeError(message); };
export const opaqueId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(value);
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function exact(value, fields) {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...fields].sort().join('|')) fail('Campos fora do contrato.');
}
function text(value, max) {
 if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/u.test(value)) fail('Texto inválido.');
 return value;
}
export function validateDefinition(input) {
 exact(input, ['schemaVersion','title','subject','kind','date','manifest','blocks','answers','display']);
 if (input.schemaVersion !== 'salta-assessment-definition-v2') fail('Versão de definição inválida.');
 text(input.title,160); text(input.subject,120); text(input.kind,80);
 if (input.date !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date+'T12:00:00Z')) || new Date(input.date+'T12:00:00Z').toISOString().slice(0,10) !== input.date)) fail('Data inválida.');
 const {template} = importCardManifest(input.manifest);
 if (template.mode !== 'full-page' || template.questions.some(q => !['A-D','A-E','C-E'].includes(q.type))) fail('Modelo objetivo A4 não suportado.');
 if (input.manifest.identityCode?.student && Object.values(input.manifest.identityCode.student).some(Boolean)) fail('Não cadastrar dados nominais no modelo reutilizável.');
 for (const logo of input.manifest.panels?.header?.logos||[]) if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo.href)) fail('Use logotipo incorporado, sem referência externa.');
 exact(input.display,['score']);
 if (!['final','blocks','both'].includes(input.display.score)) fail('Exibição de pontuação inválida.');
 if (!Array.isArray(input.blocks) || !input.blocks.length || input.blocks.length > 32 || input.blocks.length > template.questions.length) fail('Blocos inválidos.');
 const questions = new Map(template.questions.map(q => [q.questionId,q])), seen = new Set(), blockIds = new Set();
 let totalUnits = 0;
 for (const block of input.blocks) {
  exact(block,['blockId','label','valueUnits','questionIds']);
  if (typeof block.blockId!=='string' || !block.blockId || block.blockId.length>80 || blockIds.has(block.blockId)) fail('ID de bloco inválido ou repetido.');
  blockIds.add(block.blockId); text(block.label,64);
  // Same decimal precision and positive-value bounds as the Executor PR #63.
  // Decimal integer strings cross JSON without BigInt serialization/rounding.
  if (typeof block.valueUnits!=='string' || !/^[1-9][0-9]{0,7}$/.test(block.valueUnits)) fail('Valor de bloco inválido.');
  if (!Array.isArray(block.questionIds) || !block.questionIds.length) fail('Bloco sem questões.');
  for (const id of block.questionIds) { if (!questions.has(id) || questions.get(id).sectionId!==block.blockId || seen.has(id)) fail('Questão ausente, alheia ou repetida nos blocos.'); seen.add(id); }
  totalUnits += Number(block.valueUnits);
 }
 if (seen.size !== questions.size || !Number.isSafeInteger(totalUnits) || totalUnits>100_000_000) fail('Revise os blocos e o total de até 10.000 pontos.');
 if (!Array.isArray(input.answers) || input.answers.length !== questions.size) fail('Gabarito incompleto.');
 const keyed = new Set();
 for (const answer of input.answers) {
  exact(answer,['questionId','correct']); const q = questions.get(answer.questionId);
  if (!q || keyed.has(q.questionId) || !q.choices.includes(answer.correct)) fail('Gabarito incompatível com o manifesto.');
  keyed.add(q.questionId);
 }
 return {definition:structuredClone(input), totalUnits:String(totalUnits), scoreScale:10000};
}
export function printArtifact(record) {
 const {template} = importCardManifest(record.definition.manifest);
 // Explicit projection: no definition, key, score, digest of answers or editor JSON.
 return {schemaVersion:'salta-assessment-print-binding-v1', assessmentId:record.id, revision:record.revision,
  manifestHash:record.manifestHash, svg:renderTemplateSvg(template,{manifest:record.definition.manifest})};
}
