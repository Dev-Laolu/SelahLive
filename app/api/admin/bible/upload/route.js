import { requireAdmin, rateLimit, verifyAdminActionMfa } from "@/lib/server/admin";
import { validateBible } from "@/lib/server/parsers";
import { saveBibleDraft } from "@/lib/server/store";
import { gunzipSync, strFromU8 } from "fflate";

export const runtime = "nodejs";
const MAX_UNCOMPRESSED = 50 * 1024 * 1024; // 50 MB max uncompressed Bible file
const LARGE_FILE_THRESHOLD = 3 * 1024 * 1024; // Ask for MFA on files > 3 MB or on draft save

export async function POST(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  if (!rateLimit(`bible-upload:${a.uid}`, 15, 60_000)) {
    return Response.json({ error: "Too many uploads. Please wait a minute and try again." }, { status: 429 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }

  const isGzipped = form.get("compressed") === "gzip" || file.name.toLowerCase().endsWith(".gz");
  const originalName = String(form.get("originalName") || file.name).replace(/\.gz$/i, "");
  const action = String(form.get("action") || "validate");
  const mfaCode = String(form.get("mfaCode") || "");

  let text;
  try {
    const rawBuf = new Uint8Array(await file.arrayBuffer());
    if (isGzipped) {
      const decompressed = gunzipSync(rawBuf);
      if (decompressed.byteLength > MAX_UNCOMPRESSED) {
        return Response.json({ error: "Decompressed file is larger than 50 MB." }, { status: 413 });
      }
      text = strFromU8(decompressed);
    } else {
      if (rawBuf.byteLength > MAX_UNCOMPRESSED) {
        return Response.json({ error: "File is larger than 50 MB." }, { status: 413 });
      }
      text = strFromU8(rawBuf);
    }
  } catch {
    return Response.json({ error: "Could not read or decompress the uploaded file." }, { status: 400 });
  }

  // Require MFA confirmation for large Bible uploads (> 3 MB) or saving a draft
  const needsMfa = text.length > LARGE_FILE_THRESHOLD || action === "draft";
  if (needsMfa) {
    const mfaRes = await verifyAdminActionMfa(mfaCode, a.adminKey || a.uid);
    if (!mfaRes.ok) {
      return Response.json({ error: mfaRes.error, mfaRequired: true }, { status: 403 });
    }
  }

  const report = validateBible(originalName, text, action === "draft");
  if (action === "draft") {
    if (!report.ok) {
      return Response.json({ error: report.errors[0] || "Validation failed.", ...report }, { status: 400 });
    }
    try {
      const meta = {
        name: form.get("name") || "",
        code: form.get("code") || "",
        language: form.get("language") || "English",
        license: form.get("license") || "Public domain",
        rights: form.get("rights") === "true",
      };
      const draft = await saveBibleDraft(a, meta, report);
      const { books, ...cleanReport } = report;
      return Response.json({ ...cleanReport, draft });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }
  return Response.json(report);
}
