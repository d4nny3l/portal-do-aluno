import test from "node:test";
import assert from "node:assert/strict";
import { detectFiducials, normalizeCard, warpFromFiducials } from "../omr/normalize.mjs";
import { createTemplate, layoutTemplate } from "../omr/template.mjs";
import { readRaster } from "../omr/reader.mjs";

function markerRaster(width, height, points) {
  const pixels = new Uint8Array(width * height).fill(255);
  for (const { x: cx, y: cy } of points) {
    for (let y = Math.round(cy) - 8; y <= Math.round(cy) + 8; y++) {
      for (let x = Math.round(cx) - 12; x <= Math.round(cx) + 12; x++) {
        if (x >= 0 && x < width && y >= 0 && y < height) pixels[y * width + x] = 0;
      }
    }
  }
  return pixels;
}

test("localiza os quatro marcadores em uma foto sintética inclinada", () => {
  const width = 900, height = 800;
  const expected = [{ x: 250, y: 88 }, { x: 650, y: 105 }, { x: 703, y: 710 }, { x: 204, y: 686 }];
  const result = detectFiducials(markerRaster(width, height, expected), width, height);
  assert.equal(result.found, true);
  assert.equal(result.corners.length, 4);
  assert.ok(result.confidence >= 0.62);
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(result.corners[i].x - expected[i].x) < 2);
    assert.ok(Math.abs(result.corners[i].y - expected[i].y) < 2);
  }
});

test("normaliza perspectiva para proporção A4 sem distorcer marcadores", () => {
  const width = 900, height = 800;
  const points = [{ x: 250, y: 88 }, { x: 650, y: 105 }, { x: 703, y: 710 }, { x: 204, y: 686 }];
  const result = normalizeCard(markerRaster(width, height, points), width, height, { outputWidth: 420 });
  assert.equal(result.width, 420);
  assert.equal(result.height, 594);
  assert.equal(result.pixels.length, 420 * 594);
  assert.ok(result.confidence >= 0.62);
  assert.ok(result.pixels.some(pixel => pixel < 20));
});

test("localiza e gira um cartão fotografado em orientação paisagem", () => {
  const width = 1000, height = 800;
  const expected = [{ x: 120, y: 250 }, { x: 820, y: 210 }, { x: 850, y: 650 }, { x: 150, y: 690 }];
  const result = detectFiducials(markerRaster(width, height, expected), width, height);
  assert.equal(result.found, true);
  assert.ok(result.confidence >= 0.62);
  const normalized = normalizeCard(markerRaster(width, height, expected), width, height, { outputWidth: 360 });
  assert.equal(normalized.height, 509);
});

test("não inventa uma leitura quando os marcadores não foram localizados", () => {
  const pixels = new Uint8Array(320 * 480).fill(255);
  assert.equal(detectFiducials(pixels, 320, 480).found, false);
  assert.throws(() => normalizeCard(pixels, 320, 480), /Não foi possível ler o cartão/);
});

test("solicita novo enquadramento quando um marcador ficou fora da fotografia", () => {
  const width = 900, height = 800;
  const pixels = markerRaster(width, height, [{ x: 250, y: 88 }, { x: 650, y: 105 }, { x: 703, y: 710 }]);
  assert.equal(detectFiducials(pixels, width, height).found, false);
  assert.throws(() => normalizeCard(pixels, width, height), /Não foi possível ler o cartão/);
});

test("permite normalizar com quatro pontos informados manualmente", () => {
  const width = 500, height = 700;
  const points = [{ x: 50, y: 50 }, { x: 450, y: 55 }, { x: 445, y: 650 }, { x: 55, y: 645 }];
  const result = warpFromFiducials(markerRaster(width, height, points), width, height, points, { outputWidth: 300 });
  assert.equal(result.width, 300);
  assert.equal(result.height, 424);
});

test("recusa pontos manuais fora da imagem ou sem formar um quadrilátero válido", () => {
  const pixels = new Uint8Array(500 * 700).fill(255);
  assert.throws(() => warpFromFiducials(pixels, 500, 700, [{x:-1,y:2},{x:450,y:2},{x:450,y:650},{x:40,y:650}], { outputWidth: 300 }), /dentro da imagem/);
  assert.throws(() => warpFromFiducials(pixels, 500, 700, [{x:50,y:50},{x:450,y:650},{x:450,y:50},{x:50,y:650}], { outputWidth: 300 }), /enquadramento válido/);
});

test("normalização preserva as coordenadas v4 e permite ler uma resposta marcada", () => {
  const template = createTemplate([{ type: "A-D", count: 10, label: "Itens" }]);
  const width = 420, height = 594;
  const geometry = layoutTemplate(template, { width, height });
  const pixels = new Uint8Array(width * height).fill(255);
  for (const marker of geometry.fiducials) {
    const half = Math.round(marker.size / 2);
    for (let y = Math.round(marker.y) - half; y <= Math.round(marker.y) + half; y++) {
      for (let x = Math.round(marker.x) - half; x <= Math.round(marker.x) + half; x++) pixels[y * width + x] = 0;
    }
  }
  const selected = geometry.cells[0].bubbles[1];
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) pixels[(Math.round(selected.y) + y) * width + Math.round(selected.x) + x] = 0;
  const normalized = normalizeCard(pixels, width, height, { outputWidth: 420 });
  const result = readRaster(template, normalized.pixels, normalized.width, normalized.height);
  assert.equal(result.observations[0].state, "read");
  assert.equal(result.observations[0].answer, "B");
});

test('poses próximas nunca espelham nem alternam o topo por desempate numérico',()=>{
  for(let n=0;n<20;n++){
    const width=900,height=1000,points=[{x:130+n*2,y:80+n},{x:660-n,y:110},{x:700,y:890-n*2},{x:120,y:860}];
    const raster=markerRaster(width,height,points),detection=detectFiducials(raster,width,height);
    assert.equal(detection.found,true);
    const order=detection.corners.map(p=>points.findIndex(q=>Math.hypot(p.x-q.x,p.y-q.y)<3));
    assert.deepEqual(order,[0,1,2,3],`pose ${n}: ${order}`);
    const automatic=normalizeCard(raster,width,height,{outputWidth:300});
    const manual=warpFromFiducials(raster,width,height,points,{outputWidth:300});
    assert.deepEqual(automatic.pixels,manual.pixels);
  }
});

test('mapeia cada marcador para o canto físico correto após mudança retrato/paisagem',()=>{
  for(const points of [
    [{x:120,y:80},{x:650,y:100},{x:680,y:890},{x:100,y:870}],
    [{x:850,y:120},{x:830,y:650},{x:40,y:680},{x:60,y:100}],
  ]){
    const width=1000,height=1000,detected=detectFiducials(markerRaster(width,height,points),width,height);
    assert.deepEqual(detected.corners.map(p=>points.findIndex(q=>Math.hypot(p.x-q.x,p.y-q.y)<3)),[0,1,2,3]);
  }
});

test('três marcadores externos e um ponto interno não formam uma folha convexa',()=>{
 const width=900,height=1000,points=[{x:120,y:100},{x:700,y:100},{x:700,y:890},{x:460,y:430}];
 assert.equal(detectFiducials(markerRaster(width,height,points),width,height).found,false);
});


test('o ajuste manual recusa ordem refletida em vez de espelhar a folha',()=>{
 const width=500,height=700,points=[{x:50,y:50},{x:450,y:50},{x:450,y:650},{x:50,y:650}];
 assert.throws(()=>warpFromFiducials(markerRaster(width,height,points),width,height,[points[0],points[3],points[2],points[1]],{outputWidth:300}),/ordem invertida/);
});
