import "server-only";

import { serverEnv } from "@/env/server";

export type StoredBlobPointer = {
  provider: "vercel_blob";
  pathname: string;
  url: string;
  downloadUrl: string | null;
  sizeBytes: number;
  contentType: string;
};

export async function maybeStoreBlobArtifact(input: {
  pathname: string;
  body: string | Buffer;
  contentType: string;
  minimumBytes?: number;
}) {
  const sizeBytes = typeof input.body === "string" ? Buffer.byteLength(input.body) : input.body.byteLength;
  const minimumBytes = input.minimumBytes ?? 128 * 1024;

  if (!serverEnv.BLOB_READ_WRITE_TOKEN || sizeBytes < minimumBytes) {
    return null;
  }

  const { put } = await import("@vercel/blob");
  const blob = await put(input.pathname, input.body, {
    access: "public",
    addRandomSuffix: false,
    contentType: input.contentType,
    token: serverEnv.BLOB_READ_WRITE_TOKEN,
  });

  return {
    provider: "vercel_blob",
    pathname: blob.pathname,
    url: blob.url,
    downloadUrl: blob.downloadUrl ?? null,
    sizeBytes,
    contentType: input.contentType,
  } satisfies StoredBlobPointer;
}
