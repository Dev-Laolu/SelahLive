#!/usr/bin/env node
// CLI tool: npm run admin:setup-mfa
import crypto from "node:crypto";
import { base32Encode, hashRecoveryCode } from "../lib/server/auth-crypto.js";

const username = process.env.ADMIN_USERNAME || "devlaolu";
const issuer = "SelahLive";
const secretBytes = crypto.randomBytes(20);
const secretBase32 = base32Encode(secretBytes);
const otpauth = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

const recoveryCodes = [];
const recoveryHashes = [];
for (let i = 0; i < 10; i++) {
  const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
  const formatted = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  recoveryCodes.push(formatted);
  recoveryHashes.push(hashRecoveryCode(formatted));
}

console.log("==========================================================");
console.log("  SELAH LIVE — ADMIN MFA (GOOGLE AUTHENTICATOR) SETUP");
console.log("==========================================================");
console.log(`Account:        ${username}`);
console.log(`TOTP Secret:    ${secretBase32}`);
console.log(`otpauth URI:    ${otpauth}`);
console.log("----------------------------------------------------------");
console.log("10 Single-Use Recovery Codes (SAVE THESE IN A SAFE PLACE):");
recoveryCodes.forEach((c, idx) => console.log(`  ${String(idx + 1).padStart(2, " ")}. ${c}`));
console.log("----------------------------------------------------------");
console.log("Add these to your .env.local / Vercel Environment Variables:\n");
console.log(`ADMIN_TOTP_SECRET="${secretBase32}"`);
console.log(`ADMIN_RECOVERY_HASHES="${recoveryHashes.join(",")}"`);
console.log("==========================================================");

