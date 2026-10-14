import { decodeTrie } from "cspell-trie-lib";

let dictionaryPromise = null;
let dictionary = null;
let pendingCheck = null;
let pendingSuggestions = [];
let processing = false;

function normalizeWord(word) {
  return word.toLocaleLowerCase("pt-BR");
}

function removeAccents(word) {
  return word.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function spellingSuggestions(word, limit = 6) {
  const normalized = normalizeWord(word);
  const entries = dictionary.suggestWithCost(normalized, {
    numSuggestions: limit + 3,
    includeTies: false,
    changeLimit: 3,
    timeout: 35
  });
  return entries
    .map(entry => entry.word)
    .filter((candidate, index, all) =>
      candidate !== normalized &&
      normalizeWord(candidate) !== normalized &&
      dictionary.has(normalizeWord(candidate)) &&
      all.indexOf(candidate) === index
    )
    .slice(0, limit);
}

function accentSuggestion(word) {
  const normalized = normalizeWord(word);
  const entries = dictionary.suggestWithCost(normalized, {
    numSuggestions: 10,
    includeTies: true,
    changeLimit: 2,
    timeout: 30
  });
  const candidates = [...new Set(entries
    .filter(entry => entry.word !== normalized && entry.cost <= 8)
    .map(entry => entry.word)
    .filter(candidate =>
      removeAccents(candidate) === removeAccents(normalized) &&
      dictionary.has(normalizeWord(candidate))
    ))];
  return candidates.length === 1 ? candidates[0] : null;
}

async function loadDictionary() {
  if (!dictionaryPromise) {
    dictionaryPromise = (async () => {
      if (typeof DecompressionStream !== "function") {
        throw new Error("Este navegador não oferece suporte à leitura do dicionário.");
      }
      const response = await fetch(new URL("./pt_BR.trie.gz", import.meta.url), { cache: "force-cache" });
      if (!response.ok || !response.body) throw new Error("O dicionário de português não pôde ser carregado.");
      const decompressed = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
      dictionary = decodeTrie(new TextDecoder("utf-8").decode(decompressed));
      self.postMessage({ type: "ready" });
      return dictionary;
    })().catch(error => {
      dictionaryPromise = null;
      throw error;
    });
  }
  return dictionaryPromise;
}

function checkText(text, ignored) {
  const ignoredWords = new Set((ignored || []).map(normalizeWord));
  const errors = [];
  const wordPattern = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
  let match;
  while ((match = wordPattern.exec(text)) && errors.length < 60) {
    const word = match[0];
    const normalized = normalizeWord(word);
    if (word.length < 3 || word === word.toLocaleUpperCase("pt-BR") || ignoredWords.has(normalized)) continue;
    if (dictionary.has(normalized)) continue;
    errors.push({
      word,
      start: match.index,
      end: match.index + word.length,
      accent: word.length >= 4 ? accentSuggestion(word) : null
    });
  }
  return errors;
}

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    await loadDictionary();
    while (pendingCheck || pendingSuggestions.length) {
      if (pendingCheck) {
        const request = pendingCheck;
        pendingCheck = null;
        self.postMessage({ type: "checked", id: request.id, errors: checkText(request.text, request.ignored) });
      }
      const suggestionRequest = pendingSuggestions.shift();
      if (suggestionRequest) {
        self.postMessage({
          type: "suggestions",
          id: suggestionRequest.id,
          word: suggestionRequest.word,
          suggestions: spellingSuggestions(suggestionRequest.word)
        });
      }
    }
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "Não foi possível iniciar a revisão ortográfica." });
  } finally {
    processing = false;
    if (pendingCheck || pendingSuggestions.length) processQueue();
  }
}

self.addEventListener("message", event => {
  const message = event.data || {};
  if (message.type === "check") {
    pendingCheck = message;
    processQueue();
  } else if (message.type === "suggest") {
    pendingSuggestions = pendingSuggestions.filter(item => item.id !== message.id);
    pendingSuggestions.push(message);
    processQueue();
  }
});
