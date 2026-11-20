import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const options = { N: 1 << 17, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const keyLength = 64;
const version = "scrypt-v1";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return [version, salt.toString("hex"), key.toString("hex")].join(":");
}

export async function verifyPassword(
  password: string,
  encoded?: string,
): Promise<boolean> {
  const [algorithm, salt = "", digest = ""] = (encoded ?? "").split(":");
  const valid =
    algorithm === version &&
    /^[a-f0-9]{32}$/.test(salt) &&
    /^[a-f0-9]{128}$/.test(digest);
  const actual = await derive(
    password,
    valid ? Buffer.from(salt, "hex") : Buffer.alloc(16),
  );
  return valid && timingSafeEqual(actual, Buffer.from(digest, "hex"));
}
