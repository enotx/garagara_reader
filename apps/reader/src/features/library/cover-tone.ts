/** Deterministic cover tone so the same book always gets the same color. */
export function coverTone(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return (hash % 6) + 1;
}
