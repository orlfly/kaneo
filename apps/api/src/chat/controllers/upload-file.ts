import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { HTTPException } from "hono/http-exception";
import {
  defaultWorkdirRoot,
  ensureProjectWorkdir,
  projectWorkdir,
} from "../../agent";
import { loadChatConfig } from "../config";

const MAX_UPLOAD_BYTES = 1 * 1024 * 1024;

// Allowed upload content types.
const ALLOWED = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/zip",
  "application/x-gzip",
  "application/gzip",
]);

export async function uploadFile({
  projectId,
  fileName,
  contentType,
  data,
}: {
  projectId: string;
  fileName: string;
  contentType: string;
  data: string;
}) {
  const safeName = path.basename(fileName).replace(/[^\w.-]+/g, "_");
  if (!safeName) {
    throw new HTTPException(400, { message: "Invalid file name" });
  }
  const normalizedType = ((contentType || "").split(";")[0] || "")
    .trim()
    .toLowerCase();
  if (!ALLOWED.has(normalizedType)) {
    throw new HTTPException(400, {
      message: `Unsupported content type: ${contentType}`,
    });
  }

  const config = await loadChatConfig();
  const root = config.workdirRoot || defaultWorkdirRoot();
  const projectDir = projectWorkdir(root, projectId);
  await ensureProjectWorkdir(projectDir);

  const uploadsDir = path.join(projectDir, "uploads");
  await mkdir(uploadsDir, { recursive: true });

  const payload = data.replace(/^data:[^;,]*;base64,/, "").replace(/\s+/g, "");
  if (!payload) {
    throw new HTTPException(400, { message: "File data must not be empty" });
  }
  const bytes = Buffer.from(payload, "base64");
  if (!bytes || bytes.length === 0) {
    throw new HTTPException(400, { message: "File data must not be empty" });
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new HTTPException(400, {
      message: `File exceeds the maximum upload size of ${Math.floor(MAX_UPLOAD_BYTES / 1024)}KB`,
    });
  }

  const target = path.join(uploadsDir, safeName);
  await writeFile(target, bytes);

  return { path: `uploads/${safeName}`, bytes: bytes.length };
}
