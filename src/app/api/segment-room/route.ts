import { NextResponse } from "next/server";
import { segmentWallRemote } from "@/lib/media-client";
import { requireGatedUser } from "@/lib/auth-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  // Runs a segmentation model (in the media container) on the customer's room
  // photo — no tokens, but heavy CPU, and it fires on every photo pick.
  // Verified only.
  const { blocked } = await requireGatedUser();
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "no_image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  try {
    const { png, width, height, foundWall } = await segmentWallRemote(await file.arrayBuffer());
    return new NextResponse(new Blob([new Uint8Array(png)]), {
      headers: {
        "Content-Type": "image/png",
        "X-Found-Wall": String(foundWall),
        "X-Width": String(width),
        "X-Height": String(height),
      },
    });
  } catch (error) {
    console.error("segment-room error:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
