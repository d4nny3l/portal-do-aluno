import { layoutTemplate } from "./template.mjs";

const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
export function renderTemplateSvg(template, { width = 794, height = 1123 } = {}) {
  const g=layoutTemplate(template,{width,height});
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cartão de respostas SALTA">`,`<rect width="100%" height="100%" fill="white"/>`,`<text x="${width/2}" y="${g.margin+10}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="700">CARTÃO DE RESPOSTAS · SALTA</text>`,`<text x="${g.margin}" y="${g.margin+18}" font-family="Arial" font-size="9">TEMPLATE ${esc(g.templateId)} · ${esc(g.version)} · REV ${g.revision}</text>`,`<text x="${g.margin}" y="${g.margin+34}" font-family="Arial" font-size="10">Nome: __________________________________________________________</text>`];
  for(const f of g.fiducials)parts.push(`<rect x="${f.x-f.size/2}" y="${f.y-f.size/2}" width="${f.size}" height="${f.size}" fill="#000"/>`);
  for(const c of g.cells){parts.push(`<text x="${c.x+22}" y="${c.y+3}" text-anchor="end" font-family="Arial" font-size="9">${String(c.number).padStart(3,"0")}</text>`);for(const b of c.bubbles)parts.push(`<circle cx="${b.x}" cy="${b.y}" r="${c.bubbleRadius}" fill="white" stroke="black" stroke-width="1.1"/><text x="${b.x}" y="${b.y+c.bubbleRadius+7}" text-anchor="middle" font-family="Arial" font-size="6">${b.choice}</text>`)}
  parts.push("</svg>");return parts.join("");
}
