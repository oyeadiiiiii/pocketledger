export const normalizeForHash = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Deterministic fingerprint for duplicate detection (not a security hash). */
export function fingerprint(input: string): string {
  const t = normalizeForHash(input);
  let h1 = 0x811c9dc5;
  let h2 = 0x5bd1e995;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + t.length.toString(16);
}