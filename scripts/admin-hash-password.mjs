#!/usr/bin/env node
// CLI tool: npm run admin:hash-password -- [optional-password]
import readline from "node:readline";
import { hashPassword } from "../lib/server/auth-crypto.js";

const argPw = process.argv[2];
if (argPw) {
  console.log("\nADMIN_PASSWORD_HASH=\"" + hashPassword(argPw) + "\"\n");
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Enter admin password to hash: ", (pw) => {
  rl.close();
  if (!pw) {
    console.error("Error: Password cannot be empty.");
    process.exit(1);
  }
  console.log("\nPaste this into your .env.local / Vercel Environment Variables:\n");
  console.log(`ADMIN_PASSWORD_HASH="${hashPassword(pw)}"\n`);
});
