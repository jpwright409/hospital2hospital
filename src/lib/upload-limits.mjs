// Decimal bytes: leave room for multipart fields below Vercel's 4.5 MB limit.
// Browser checks and server validation must use the same file limit.
export const MAX_IMAGE_UPLOAD_BYTES = 3_000_000;
export const MAX_SERVER_ACTION_BYTES = 4_000_000;
export const IMAGE_UPLOAD_LIMIT_LABEL = "3 MB";

export function imageUploadSizeError(size) {
  return size > MAX_IMAGE_UPLOAD_BYTES
    ? `Choose a JPEG, PNG or WebP image up to ${IMAGE_UPLOAD_LIMIT_LABEL}.`
    : "";
}
