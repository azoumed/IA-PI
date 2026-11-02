import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { readStored } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, Number((await params).id)) });
  if (!doc?.storagePath) return new Response("Not found", { status: 404 });
  const data = await readStored(doc.storagePath);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName ?? "document")}`,
    },
  });
}
