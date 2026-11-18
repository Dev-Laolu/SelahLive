import { requireAdmin, rateLimit } from "@/lib/server/admin";
import { splitSongs, validateSongs } from "@/lib/server/parsers";
import { parseSong } from "@/lib/songs";
import { unzipSync, strFromU8 } from "fflate";

export const runtime = "nodejs";

export async function POST(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  if (!rateLimit(`songs-upload:${a.uid}`, 15, 60_000)) {
    return Response.json({ error: "Too many uploads. Please wait a minute and try again." }, { status: 429 });
  }
  const form = await request.formData();
  const files = [];
  for (const f of form.getAll("files")) {
    if (typeof f === "string") continue;
    if (f.size > 10 * 1024 * 1024) return Response.json({ error: `${f.name} is larger than 10 MB.` }, { status: 413 });
    if (f.name.toLowerCase().endsWith(".zip")) {
      const z = unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [n, b] of Object.entries(z)) {
        if (n.toLowerCase().endsWith(".txt") && !n.includes("__MACOSX")) {
          files.push({ name: n, text: strFromU8(b) });
        }
      }
    } else {
      files.push({ name: f.name, text: await f.text() });
    }
  }
  if (!files.length) return Response.json({ error: "No .txt or .zip files uploaded." }, { status: 400 });
  return Response.json(validateSongs(splitSongs(files), parseSong));
}
