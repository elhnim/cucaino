import crypto from "crypto";

const HASH_PREFIX = "v1:";

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(pin, salt);
  return `${HASH_PREFIX}${salt}:${key}`;
}

export async function verifyPin(entered: string, stored: string): Promise<boolean> {
  if (stored.startsWith(HASH_PREFIX)) {
    const rest = stored.slice(HASH_PREFIX.length);
    const [salt, hash] = rest.split(":");
    if (!salt || !hash) return false;
    const key = await scrypt(entered, salt);
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(key, "hex"));
  }
  // Plain-text fallback for PINs set before hashing was introduced
  return entered === stored;
}

export function isPinHashed(stored: string): boolean {
  return stored.startsWith(HASH_PREFIX);
}

function scrypt(pin: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, 32, (err, key) => {
      if (err) reject(err);
      else resolve(key.toString("hex"));
    });
  });
}
