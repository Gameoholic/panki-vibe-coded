/**
 * A random id, as the API takes for a card or a file. Made by hand from random bytes because `crypto.randomUUID`
 * only exists on a secure page, and the panel opens on any page, http ones included.
 */
export function uuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // The two fixed fields of a random id: its version (4) and its variant.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
