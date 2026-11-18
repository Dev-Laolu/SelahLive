import { requireAdmin, rateLimit } from "@/lib/server/admin";
import { validateBible } from "@/lib/server/parsers";
import { saveBibleDraft } from "@/lib/server/store";

export const runtime = "nodejs";
const MAX = 50 * 1024 * 1024;

export async function POST(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  if (!rateLimit(`bible-upload:${a.uid}`, 10, 60_000)) {
    return Response.json({ error: "Too many uploads. Please wait a minute and try again." }, { status: 429 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") return Response.json({ error: "No file uploaded." }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "File is larger than 50 MB." }, { status: 413 });

  const action = form.get("action") || "validate";
  const text = await file.text();
  const report = validateBible(file.name, text, action === "draft");
  if (action === "draft") {
    if (!report.ok) return Response.json({ error: report.errors[0] || "Validation failed.", ...report }, { status: 400 });
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
