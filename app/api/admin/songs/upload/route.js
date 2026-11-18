import { requireAdmin, rateLimit } from "@/lib/server/admin";
import { splitSongs, validateSongs } from "@/lib/server/parsers";
import { parseSong } from "@/lib/songs";
import { unzipSync, strFromU8 } from "fflate";

export const runtime = "nodejs";
const MAX_ZIP_UNCOMPRESSED = 25 * 1024 * 1024;
const MAX_ZIP_FILES = 500;

export async function POST(request) {
  const a = await requireAdmin(request);
  if (a.error) return a.error;
  if (!rateLimit(`songs-upload:${a.uid}`, 15, 60_000)) {
    return Response.json({ error: "Too many uploads. Please wait a minute and try again." }, { status: 429 });
  }
  const form = await request.formData();
  const files = [];
  let totalUncompressed = 0;

  for (const f of form.getAll("files")) {
    if (typeof f === "string") continue;
    if (f.size > 10 * 1024 * 1024) return Response.json({ error: `${f.name} is larger than 10 MB.` }, { status: 413 });
    if (f.name.toLowerCase().endsWith(".zip")) {
      const z = unzipSync(new Uint8Array(await f.arrayBuffer()));
      const entries = Object.entries(z);
      if (entries.length > MAX_ZIP_FILES) {
        return Response.json({ error: "Archive contains too many files (max 500)." }, { status: 400 });
      }
      for (const [n, b] of entries) {
        // Zip-slip check
        if (n.includes("..") || n.startsWith("/") || n.startsWith("\\")) {
          return Response.json({ error: "Invalid file path inside archive." }, { status: 400 });
        }
        totalUncompressed += b.byteLength;
        if (totalUncompressed > MAX_ZIP_UNCOMPRESSED) {
          return Response.json({ error: "Uncompressed archive exceeds 25 MB limit." }, { status: 413 });
        }
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
