// Presentation contract v1. No storage, answers, geometry or floating-point math.
export const SCORE_FORMAT_VERSION='salta-score-format-v1';
export const DEFAULT_SCORE_DECIMALS=2;
const fail=message=>{throw new TypeError(message)};
export function scoreDecimals(value=DEFAULT_SCORE_DECIMALS){
 if(!Number.isInteger(value)||value<0||value>2)fail('Formato da nota inválido.');
 return value;
}
export function validateScoreDisplay(display){
 if(!display||typeof display!=='object'||Array.isArray(display))fail('Exibição de pontuação inválida.');
 const keys=Object.keys(display).sort().join('|');
 if(!['score','score|scoreDecimals'].includes(keys)||!['final','blocks','both'].includes(display.score))
  fail('Exibição de pontuação fora do contrato.');
 if(Object.hasOwn(display,'scoreDecimals')&&display.scoreDecimals===undefined)fail('Formato da nota inválido.');
 return scoreDecimals(display.scoreDecimals);
}
// Existing exact formatter remains available for lossless editor serialization.
export function formatExact(n,d=1n,places=2){
 n=BigInt(n);d=BigInt(d);
 if(n<0n||d<=0n||!Number.isInteger(places)||places<0||places>4)fail('Valor fracionário inválido.');
 const pow=10n**BigInt(places),rounded=(n*pow*2n+d)/(2n*d);
 const value=rounded.toString().padStart(places+1,'0');
 return places?value.slice(0,-places)+','+value.slice(-places):value;
}
export function formatScore(n,d=1n,places=DEFAULT_SCORE_DECIMALS){
 return formatExact(n,d,scoreDecimals(places));
}
// Apply only to newly entered/edited amounts, never to recovered historical units.
export function assertScoreInputUnits(valueUnits,places=DEFAULT_SCORE_DECIMALS){
 const precision=scoreDecimals(places),n=BigInt(valueUnits);
 if(n<0n||n%(10n**BigInt(4-precision))!==0n)fail('Valor incompatível com o formato da nota.');
 return valueUnits;
}
