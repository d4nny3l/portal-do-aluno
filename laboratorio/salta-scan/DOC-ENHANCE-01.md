# DOC-ENHANCE-01 — experimental document enhancement

Standalone document scanner only; no changes to camera, OMR capture lab, official Corretor, geometry, PDF, or detection. Default candidate on this branch; append `?enhance=primary` for the original enhancement. Existing appearance controls stay the same. No external dependencies or uploads.

Robust local bright quantiles, coarse neighborhood protection, conservative white balance, local gain, bounded detail enhancement, and Sauvola via sliding sums. The original raster is not mutated. Large filled graphics, abrupt shadows, colored paper, glare and weak pencil remain risks; no physical validation or claim of superiority to PRIMARY STABLE. No OCR or generative restoration.

Synthetic test: gradient, printed strokes, red mark, original, input contract. Run `node --test laboratorio/salta-scan/tests/document-enhance.test.mjs`. JS-isolate run: 9 checks passed; gradient difference 94 to 1 levels (input versus candidate, NOT legacy comparison). No browser tests performed. Baseline commit 7861007f80964e9bbe2082fa36e8fc1422c1f5fc.

## Refined candidate

Preserve enclosed dark panels in continuous-tone modes; conservative warm-paper balance and local matching at hard shadow transitions. Ambiguous enclosed shadows may remain; dark ink near shadow edges can be confused with paper, requiring physical testing. Synthetic same-raster comparison at selected points (not field results):

```json
{
  "panel": {
    "legacy": [
      255,
      255,
      255
    ],
    "candidate": [
      155,
      155,
      155
    ]
  },
  "shadowBoundary": {
    "legacy": [
      123,
      123,
      123
    ],
    "candidate": [
      249,
      249,
      249
    ]
  },
  "warm": {
    "legacy": [
      255,
      254,
      200
    ],
    "candidate": [
      235,
      235,
      227
    ]
  }
}
```
