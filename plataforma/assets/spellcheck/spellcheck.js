const fields = [...document.querySelectorAll("[data-salta-spellcheck]")];
const states = new Map();
const pendingChecks = new Map();
const pendingSuggestions = new Map();
const ignoredKey = "saltaSpellcheckIgnoredPtBr";
let worker = null;
let requestId = 0;

if (fields.length) {
  const style = document.createElement("style");
  style.textContent = `
    .salta-spellcheck-wrap{position:relative;display:block;width:100%;}
    .salta-spellcheck-layer{position:absolute;inset:0;z-index:1;overflow:hidden;box-sizing:border-box;border:1px solid transparent;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere;}
    .salta-spellcheck-layer[hidden]{display:none!important;}
    .salta-spell-input.salta-spell-active{position:relative;z-index:2;color:transparent!important;-webkit-text-fill-color:transparent!important;background:transparent!important;caret-color:#252744;}
    .salta-spell-input.salta-spell-active::selection{background:rgba(0,113,227,.22);color:transparent;-webkit-text-fill-color:transparent;}
    .salta-spell-error{text-decoration-line:underline;text-decoration-style:wavy;text-decoration-color:#d04444;text-decoration-thickness:1.4px;text-underline-offset:3px;}
    .salta-spell-placeholder{color:#85858d;}
    .salta-spell-popup{position:absolute;z-index:5;top:calc(100% + 6px);left:0;display:flex;flex-wrap:wrap;gap:6px;max-width:min(100%,420px);padding:8px;border:1px solid #e1e2e8;border-radius:12px;background:#fff;box-shadow:0 10px 28px rgba(24,28,45,.15);}
    .salta-spell-popup[hidden]{display:none!important;}
    .salta-spell-popup button{border:0;border-radius:8px;padding:7px 10px;background:#f1f1fb;color:#34346f;font:inherit;font-size:12px;line-height:1.2;font-weight:600;cursor:pointer;}
    .salta-spell-popup button:hover{background:#e6e6fa;}
    .salta-spell-popup .salta-spell-ignore{background:transparent;color:#6b6d78;font-weight:500;}
  `;
  document.head.append(style);
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./spellcheck-worker.bundle.js", import.meta.url), { type: "module" });
    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", event => {
      console.error("Falha no corretor ortográfico do SALTA.", event.message, event.filename, event.lineno);
      worker?.terminate();
      worker = null;
    }, { once: true });
  }
  return worker;
}

function ignoredWords() {
  try {
    const value = JSON.parse(localStorage.getItem(ignoredKey) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function syncOverlayStyle(state) {
  const computed = getComputedStyle(state.control);
  const layer = state.layer;
  ["font", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "textAlign", "textTransform", "whiteSpace", "overflowWrap", "padding", "borderRadius"].forEach(property => {
    layer.style[property] = computed[property];
  });
  ["Top", "Right", "Bottom", "Left"].forEach(side => {
    layer.style[`border${side}Width`] = computed[`border${side}Width`];
  });
  layer.style.whiteSpace = state.control.tagName === "TEXTAREA" ? "pre-wrap" : "pre";
}

function renderOverlay(state, errors) {
  const { control, layer } = state;
  const text = control.value;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  errors.forEach(error => {
    if (error.start < cursor || error.end > text.length) return;
    if (error.start > cursor) fragment.append(document.createTextNode(text.slice(cursor, error.start)));
    const mark = document.createElement("span");
    mark.className = "salta-spell-error";
    mark.dataset.start = String(error.start);
    mark.dataset.end = String(error.end);
    mark.textContent = text.slice(error.start, error.end);
    fragment.append(mark);
    cursor = error.end;
  });
  if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
  if (!text && control.placeholder) {
    const placeholder = document.createElement("span");
    placeholder.className = "salta-spell-placeholder";
    placeholder.textContent = control.placeholder;
    fragment.append(placeholder);
  } else if (!text) {
    fragment.append(document.createTextNode("\u00a0"));
  }
  layer.replaceChildren(fragment);
  layer.scrollTop = control.scrollTop;
  layer.scrollLeft = control.scrollLeft;
}

function wordAtCursor(control) {
  const text = control.value;
  let position = control.selectionStart ?? text.length;
  if (position === text.length || !/[\p{L}]/u.test(text[position] || "")) position--;
  if (position < 0) return null;
  const pattern = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
  let match;
  while ((match = pattern.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (position >= start && position < end) return { word: match[0], start, end };
  }
  return null;
}

function requestSuggestions(state) {
  const range = wordAtCursor(state.control);
  if (!range || !state.errors.some(error => error.start === range.start && error.end === range.end)) {
    state.popup.hidden = true;
    return;
  }
  const id = ++requestId;
  pendingSuggestions.set(id, { state, range });
  state.popup.replaceChildren();
  state.popup.hidden = false;
  getWorker().postMessage({ type: "suggest", id, word: range.word });
}

function preserveCase(original, suggestion) {
  if (original === original.toLocaleUpperCase("pt-BR")) return suggestion.toLocaleUpperCase("pt-BR");
  if (original[0] === original[0]?.toLocaleUpperCase("pt-BR")) {
    return suggestion[0].toLocaleUpperCase("pt-BR") + suggestion.slice(1);
  }
  return suggestion;
}

function applyAccentCorrections(state, errors, text) {
  const fixes = errors.filter(error => error.accent && error.end <= text.length);
  if (!fixes.length || state.control.value !== text) return false;
  const control = state.control;
  let updated = text;
  let caret = control.selectionStart ?? text.length;
  fixes.slice().reverse().forEach(error => {
    const original = updated.slice(error.start, error.end);
    const corrected = preserveCase(original, error.accent);
    updated = updated.slice(0, error.start) + corrected + updated.slice(error.end);
    if (error.end <= caret) caret += corrected.length - original.length;
  });
  if (updated === text) return false;
  control.value = updated;
  control.setSelectionRange(caret, caret);
  control.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function handleWorkerMessage(event) {
  const message = event.data || {};
  if (message.type === "checked") {
    const pending = pendingChecks.get(message.id);
    pendingChecks.delete(message.id);
    if (!pending || pending.state.latestCheckId !== message.id) return;
    const { state, text, allowAccentCorrection } = pending;
    if (state.control.value !== text) return;
    if (allowAccentCorrection && applyAccentCorrections(state, message.errors, text)) return;
    state.errors = message.errors;
    state.control.spellcheck = false;
    state.control.classList.add("salta-spell-input", "salta-spell-active");
    state.layer.hidden = false;
    renderOverlay(state, state.errors);
  } else if (message.type === "suggestions") {
    const pending = pendingSuggestions.get(message.id);
    pendingSuggestions.delete(message.id);
    if (!pending) return;
    const { state, range } = pending;
    const current = wordAtCursor(state.control);
    if (!current || current.start !== range.start || current.word !== range.word) return;
    showSuggestionPopup(state, range, message.suggestions || []);
  } else if (message.type === "error") {
    console.error("Falha no corretor ortográfico do SALTA.", message.message);
  }
}

function showSuggestionPopup(state, range, suggestions) {
  const fragment = document.createDocumentFragment();
  suggestions.forEach(suggestion => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preserveCase(range.word, suggestion);
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => {
      const control = state.control;
      const corrected = preserveCase(range.word, suggestion);
      control.setRangeText(corrected, range.start, range.end, "end");
      state.popup.hidden = true;
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.focus({ preventScroll: true });
    });
    fragment.append(button);
  });
  const ignore = document.createElement("button");
  ignore.type = "button";
  ignore.className = "salta-spell-ignore";
  ignore.textContent = "Adicionar ao dicionário";
  ignore.addEventListener("mousedown", event => event.preventDefault());
  ignore.addEventListener("click", () => {
    const words = ignoredWords();
    const word = range.word.toLocaleLowerCase("pt-BR");
    if (!words.includes(word)) {
      words.push(word);
      try { localStorage.setItem(ignoredKey, JSON.stringify(words)); } catch {}
    }
    state.popup.hidden = true;
    scheduleCheck(state, false, 0);
  });
  fragment.append(ignore);
  state.popup.replaceChildren(fragment);
  state.popup.hidden = false;
}

function scheduleCheck(state, allowAccentCorrection, delay = 170) {
  clearTimeout(state.timer);
  state.popup.hidden = true;
  state.timer = setTimeout(() => {
    const id = ++requestId;
    const text = state.control.value;
    state.latestCheckId = id;
    pendingChecks.set(id, { state, text, allowAccentCorrection });
    getWorker().postMessage({ type: "check", id, text, ignored: ignoredWords() });
  }, delay);
}

function wrapField(control) {
  const wrapper = document.createElement("span");
  wrapper.className = "salta-spellcheck-wrap";
  wrapper.style.margin = getComputedStyle(control).margin;
  const layer = document.createElement("span");
  layer.className = "salta-spellcheck-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.hidden = true;
  const popup = document.createElement("span");
  popup.className = "salta-spell-popup";
  popup.hidden = true;
  const state = { control, wrapper, layer, popup, errors: [], latestCheckId: 0, timer: null };
  states.set(control, state);
  control.parentNode.insertBefore(wrapper, control);
  control.style.margin = "0";
  wrapper.append(layer, control, popup);
  syncOverlayStyle(state);
  control.spellcheck = true;
  control.addEventListener("focus", () => scheduleCheck(state, false, 0));
  control.addEventListener("input", event => {
    const caret = control.selectionStart ?? control.value.length;
    const boundary = caret > 0 && /[\s.,!?;:)]/u.test(control.value[caret - 1]);
    scheduleCheck(state, boundary, boundary ? 70 : 170);
  });
  control.addEventListener("blur", () => scheduleCheck(state, true, 0));
  control.addEventListener("click", () => requestSuggestions(state));
  control.addEventListener("keyup", event => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) requestSuggestions(state);
  });
  control.addEventListener("scroll", () => {
    layer.scrollTop = control.scrollTop;
    layer.scrollLeft = control.scrollLeft;
  });
  control.form?.addEventListener("reset", () => setTimeout(() => scheduleCheck(state, false, 0), 0));
  window.addEventListener("resize", () => syncOverlayStyle(state), { passive: true });
  return state;
}

fields.forEach(wrapField);
