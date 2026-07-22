/** Small deterministic text helpers for the engine detectors (pure, no deps). */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at",
  "for", "with", "as", "by", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had", "you", "your", "i", "me", "my",
  "we", "us", "our", "it", "its", "that", "this", "these", "those", "there",
  "here", "what", "when", "where", "who", "how", "why", "can", "could", "would",
  "will", "shall", "should", "may", "might", "about", "any", "some", "so",
  "just", "then", "than", "them", "they", "he", "she", "his", "her", "him",
  "from", "into", "up", "down", "out", "off", "over", "under", "again", "not",
  "no", "yes", "get", "got", "go", "going", "tell", "told", "know", "like",
  "feel", "feeling", "felt", "thing", "things", "am", "more", "very", "really",
]);

export function normalize(text: string): string {
  // Hyphens become word separators so "self-reduced" tokenizes to
  // "self"/"reduced" and matches "reduced" used elsewhere. Apostrophes kept
  // for contractions ("we'll", "it's").
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}

/** Crude morphological stem — strips common English suffixes so "titrate",
 *  "titrating", "titrated" collapse to a shared stem. */
export function stem(word: string): string {
  let w = word.toLowerCase();
  // Strip "ion(s)" not "ation(s)" so the -ate/-ation family unifies:
  // "titration" -> "titrat", matching "titrate"/"titrating"/"titrated".
  for (const suf of ["ically", "ions", "ion", "ing", "edly", "ed", "es", "ly", "s"]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  // Collapse a trailing silent 'e' so "titrate" and "titrating" share a stem.
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

export function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Content-word stems from text (stopwords + very short words removed). */
export function salientStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokens(text)) {
    if (t.length < 3 || STOPWORDS.has(t)) continue;
    out.add(stem(t));
  }
  return out;
}

/** True when `text` contains `term` as a whole word, morphology-aware
 *  (matches the term's stem against each token's stem). */
export function containsTerm(text: string, term: string): boolean {
  const termStem = stem(normalize(term).replace(/\s+/g, ""));
  const termNorm = normalize(term);
  // Multi-word terms: substring match on the normalized phrase.
  if (termNorm.includes(" ")) return normalize(text).includes(termNorm);
  return tokens(text).some((t) => stem(t) === termStem || t === termNorm);
}

/** Split into rough sentences for same-sentence checks. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

export function hasQuestion(text: string): boolean {
  return /\?/.test(text);
}
