const SHARE_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const SHARE_ID_LENGTH = 10;

export function createShareId(length = SHARE_ID_LENGTH) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));

  return Array.from(bytes, (byte) => SHARE_ID_ALPHABET[byte % SHARE_ID_ALPHABET.length]).join("");
}

