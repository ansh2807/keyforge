import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getMaximumUploadBytes, getStorageDirectory } from "@/lib/env";
import { ApiError } from "@/lib/api-error";

function safeStoragePath(storageKey: string): string {
  if (!/^[a-f0-9]{64}$/.test(storageKey)) {
    throw new ApiError("invalid_storage_key", "The managed-file storage key is invalid.", 500);
  }
  const root = getStorageDirectory();
  const target = path.resolve(root, storageKey.slice(0, 2), storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new ApiError("invalid_storage_path", "The managed-file path is invalid.", 500);
  }
  return target;
}

export async function storeManagedFile(file: File): Promise<{
  storageKey: string;
  sha256: string;
  size: number;
  contentType: string;
  originalName: string;
}> {
  if (file.size <= 0 || file.size > getMaximumUploadBytes()) {
    throw new ApiError(
      "invalid_file_size",
      `Files must be between 1 byte and ${Math.floor(getMaximumUploadBytes() / 1024 / 1024)} MB.`,
      400,
    );
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = createHash("sha256")
    .update(randomBytes(32))
    .update(bytes)
    .digest("hex");
  const target = safeStoragePath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  return {
    storageKey,
    sha256,
    size: bytes.length,
    contentType: file.type.slice(0, 200) || "application/octet-stream",
    originalName: path.basename(file.name).slice(0, 240) || "download.bin",
  };
}

export async function readManagedFile(storageKey: string): Promise<Buffer> {
  try {
    return await readFile(safeStoragePath(storageKey));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new ApiError("file_missing", "The managed file is unavailable on this server.", 404);
    }
    throw error;
  }
}

export async function deleteManagedFile(storageKey: string): Promise<void> {
  await unlink(safeStoragePath(storageKey)).catch((error: unknown) => {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  });
}
