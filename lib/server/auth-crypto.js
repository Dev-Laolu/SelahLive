// SERVER ONLY. Password hashing (scrypt), RFC 6238 TOTP (Google Authenticator), recovery codes, and HMAC session tokens.
import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// ---- Constant-time string comparison
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) {
    // Still run timingSafeEqual against itself to avoid length-timing leak
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---- Password hashing (scrypt with 16-byte random salt, N=16384, r=8, p=1, keylen=64)
// Uses ':' delimiter so dotenv-expand / shells never interpolate '$' variables in .env files.
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt:16384:8:1:${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  try {
    const parts = storedHash.includes(":") ? storedHash.split(":") : storedHash.split("$");
    if (parts[0] !== "scrypt" || parts.length !== 6) return false;
    const [, nStr, rStr, pStr, salt, expectedHex] = parts;
    const derived = crypto
      .scryptSync(password, salt, 64, {
        N: parseInt(nStr, 10) || 16384,
        r: parseInt(rStr, 10) || 8,
        p: parseInt(pStr, 10) || 1,
      })
      .toString("hex");
    return safeEqual(derived, expectedHex);
  } catch {
    return false;
  }
}

// ---- Base32 encode/decode for RFC 6238 TOTP
export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(str) {
  const clean = String(str || "")
    .toUpperCase()
    .replace(/=+$/, "")
    .replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ---- RFC 6238 TOTP (SHA-1, 30s step, 6 digits)
export function generateTotpAtStep(base32Secret, step) {
  const key = base32Decode(base32Secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(base32Secret, code, lastUsedStep = null, nowMs = Date.now()) {
  if (!base32Secret || !code) return { valid: false };
  const cleanCode = String(code).trim().replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanCode)) return { valid: false };
  const currentStep = Math.floor(nowMs / 30_000);
  for (const offset of [0, -1, 1]) {
    const step = currentStep + offset;
    if (lastUsedStep !== null && step <= lastUsedStep) continue; // Reject replayed time-step
    const expected = generateTotpAtStep(base32Secret, step);
    if (safeEqual(cleanCode, expected)) {
      return { valid: true, step };
    }
  }
  return { valid: false };
}

// ---- Recovery code hashing
export function hashRecoveryCode(code) {
  const clean = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return crypto.createHash("sha256").update(`selah-recovery:${clean}`).digest("hex");
}

// ---- Signed Session Cookie Token
export function signSessionPayload(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySessionToken(token, secret) {
  if (!token || !secret || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  const expectedSig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  if (!safeEqual(sig, expectedSig)) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
