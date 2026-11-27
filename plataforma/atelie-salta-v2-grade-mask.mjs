(function registerGradeMask(){
 'use strict';
 // DESIGN-SALTA-04: somente a entrada manual do Ateliê; não interpreta importações.
 const F=window.SALTA_ATELIE_02;if(!F)throw Error('Fixtures do Ateliê ausentes');
 const validPrecision=p=>Number.isInteger(p)&&p>=0&&p<=2;
 function config(p,max){
  if(!validPrecision(p)||!Number.isInteger(max)||max<0||max>10)return null;
  return {p,max,limit:BigInt(max)*10n**BigInt(p)};
 }
 function formatScaled(scaled,p){
  const raw=String(scaled);
  if(p===0)return raw;
  const padded=raw.padStart(p+1,'0');
  return padded.slice(0,-p)+','+padded.slice(-p);
 }
 function manual(digits,p,max){
  const cfg=config(p,max);
  if(!cfg||typeof digits!=='string'||!/^[0-9]*$/.test(digits))return {ok:false};
  if(digits==='')return {ok:true,text:'',digits:'',scaled:0n};
  if(digits.length>32)return {ok:false};
  const scaled=BigInt(digits);
  if(scaled>cfg.limit)return {ok:false};
  return {ok:true,text:formatScaled(scaled,p),digits:String(scaled),scaled};
 }
 function external(text,p,max){
  const cfg=config(p,max);
  if(!cfg||typeof text!=='string'||text.length>32)return {ok:false};
  if(text==='')return {ok:true,text:'',digits:'',scaled:0n};
  // Inteiro colado significa inteiro decimal CONVENCIONAL, não dígitos mascarados.
  const m=/^(\d+)(?:([,.])(\d+))?$/.exec(text);
  if(!m||((m[3]||'').length>p))return {ok:false};
  const fraction=(m[3]||'').padEnd(p,'0');
  const scaled=BigInt(m[1])*10n**BigInt(p)+BigInt(fraction||'0');
  if(scaled>cfg.limit)return {ok:false};
  return {ok:true,text:formatScaled(scaled,p),digits:String(scaled),scaled};
 }
 // Entrada preexistente é texto do fixture, sem máscara retroativa.
 function previous(text,p,max){
  if(text===''||text==='—')return {ok:true,digits:'',text:''};
  return external(String(text),p,max);
 }
 F.gradeMask={validPrecision,config,formatScaled,manual,external,previous};
})();
