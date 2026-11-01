import { can } from "@/lib/corporate-auth";
import { validatedDocument } from "@/lib/partner-workspace-validation";
import { thumbnailBytesRemote } from "@/lib/media-client";
import { randomUUID } from "node:crypto";
import {
  privateWorkspaceSession,
  workspaceError,
} from "@/lib/partner-private-auth";
import { caUpload, caSignedUrl } from "@/lib/corporate-art-store";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const s = await privateWorkspaceSession();
    if (!can(s, "build")) throw new Error("403:Designer permission required");
    const form = await req.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size < 16 ||
      file.size > 10 * 1024 * 1024
    )
      throw new Error("Choose a JPEG/PNG room photo up to 10 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      validatedDocument(bytes, file.type);
      await thumbnailBytesRemote(new Uint8Array(bytes).buffer, { width: 100 });
    } catch {
      throw new Error(
        "This room photo could not be read. Try a valid JPEG or PNG.",
      );
    }
    const path = `partner-workspace/${s.account.id}/photos/${randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
    const up = await caUpload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (up.error) throw new Error("Photo could not be saved");
    return Response.json({ path, url: await caSignedUrl(path, 3600) });
  } catch (e) {
    return workspaceError(e);
  }
}
