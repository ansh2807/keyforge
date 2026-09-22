import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorageDirectory } from "@/lib/env";

export async function GET() {
  const marker = path.join(getStorageDirectory(), `.ready-${randomBytes(10).toString("hex")}`);
  try {
    await Promise.all([
      db.$queryRaw`SELECT 1`,
      mkdir(getStorageDirectory(), { recursive: true }).then(() => writeFile(marker, "ready", { flag: "wx" })),
    ]);
    await unlink(marker);
    return NextResponse.json(
      { status: "ready", database: "reachable", storage: "writable", time: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    await unlink(marker).catch(() => undefined);
    return NextResponse.json(
      { status: "not_ready", time: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
