// Reconstruct the exact pre-G3 source, refusing unknown edits. The only
// exceptions to frozen shared files are the explicit opt-in parameter and veto.
const veto="    if (reviewEvidence && (analysis.state === 'read' || analysis.state === 'blank')) {\n      const suspects = cell.bubbles.filter(b => b.choice !== (analysis.state === 'read' ? analysis.winner : null)\n        && reviewEvidence(b, cell.bubbleRadius, pixels, width, height)).map(b => b.choice);\n      if (suspects.length) {\n        analysis.state = 'review';\n        analysis.marks = [...new Set([...analysis.marks, ...suspects])];\n        analysis.recognition = null;\n      }\n    }\n";
function one(source,from,to){
 if(source.split(from).length!==2)throw Error('Unexpected scoped optical edit: '+from.slice(0,60));
 return source.replace(from,()=>to);
}
export const SCOPED_OPTICS=['corretor/v2/omr/reader.mjs','corretor/v2/omr/normalize.mjs'];
export function legacyOpticalSource(file,source){
 if(file===SCOPED_OPTICS[0]){
  source=one(source,', reviewEvidence = null } = {}) {',' } = {}) {');
  return one(source,veto,'');
 }
 if(file===SCOPED_OPTICS[1])return one(source,'{manifest=null,strictPhysical=false}={}) {\n  const geometry=embeddedGeometry(manifest) || (strictPhysical ? {horizontal:194,vertical:281} : null);','{manifest=null}={}) {\n  const geometry=embeddedGeometry(manifest);');
 return source;
}
