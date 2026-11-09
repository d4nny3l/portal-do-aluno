import { layoutTemplate } from "../omr/template.mjs";
export function makeFixture(template, { marked={}, double=[], blank=[], noise=0, blur=false, rotate=0 }={}) {
  const width=794,height=1123,pixels=new Uint8Array(width*height).fill(255),layout=layoutTemplate(template,{width,height});
  const paint=(cx,cy,r,value)=>{for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r){const xx=cx+x,yy=cy+y;if(xx>=0&&yy>=0&&xx<width&&yy<height)pixels[yy*width+xx]=value}};
  for(const f of layout.fiducials)paint(Math.round(f.x),Math.round(f.y),3,0);
  for(const c of layout.cells){if(blank.includes(c.number))continue;const vals=[...(marked[c.number]||[])];if(double.includes(c.number)){vals.push(c.bubbles[0]?.choice,c.bubbles[1]?.choice)}for(const b of c.bubbles)if(vals.includes(b.choice))paint(Math.round(b.x),Math.round(b.y),Math.round(c.bubbleRadius*.65),0)}
  if(noise)for(let i=0;i<pixels.length;i+=17)pixels[i]=Math.max(0,pixels[i]-noise);
  if(blur){const copy=pixels.slice();for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){let s=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)s+=copy[(y+j)*width+x+i];pixels[y*width+x]=s/9}}
  if(rotate) return {pixels,width,height,rotation:rotate,labels:{marked,double,blank}};
  return {pixels,width,height,labels:{marked,double,blank}};
}
