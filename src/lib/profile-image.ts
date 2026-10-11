import sharp from "sharp";
import { validatePhoto } from "./photos/image";

export async function validateAvatar(input: Uint8Array): Promise<string> {
  const photo = await validatePhoto(input);
  const bytes = await sharp(photo.data).resize(256, 256, { fit: "cover" }).webp({ quality: 80 }).toBuffer();
  if (bytes.length > 128 * 1024) throw new Error("The headshot is too complex. Choose a simpler image.");
  return `data:image/webp;base64,${bytes.toString("base64")}`;
}
