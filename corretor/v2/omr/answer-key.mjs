// Answer numbers are display labels; stable question IDs are the association key.
export function parseAnswerKey(text, questions) {
 const raw=String(text||'').trim();
 if(!raw)return {valid:false,error:'Informe o gabarito para calcular a nota provisória.'};
 const rows=new Map();
 for(const line of raw.split(/\n+/)){
  const match=line.trim().match(/^(\d{1,3})\s*[:.)-]?\s*([A-E])$/i);
  if(!match)return {valid:false,error:'Use uma resposta por linha no formato “1 A”.'};
  const number=Number(match[1]);
  if(rows.has(number))return {valid:false,error:`A questão ${number} aparece mais de uma vez no gabarito.`};
  rows.set(number,match[2].toUpperCase());
 }
 if(rows.size!==questions.length)return {valid:false,error:`O gabarito deve conter as ${questions.length} questões.`};
 const answers=new Map();
 for(const question of questions){
  const answer=rows.get(question.number);
  if(!question.choices.includes(answer))return {valid:false,error:`Resposta inválida na questão ${question.number} para o formato ${question.type}.`};
  answers.set(question.questionId,answer);
 }
 return {valid:true,answers};
}
