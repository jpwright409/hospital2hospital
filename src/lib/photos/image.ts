import sharp from "sharp";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_BUCKET = "listing-photos";
export const PHOTO_URL_SECONDS = 60;
// No filenames or client MIME claims are trusted. Full decoding strips EXIF,
// arbitrary trailing data and metadata; Storage receives a fresh WebP encoding.
export async function validatePhoto(input: Uint8Array) {
  if (!input.length || input.length > MAX_PHOTO_BYTES) throw new Error("Choose a JPEG, PNG, or WebP image up to 5 MB.");
  const buffer = Buffer.from(input);
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isWebp = buffer.subarray(0,4).toString() === "RIFF" && buffer.subarray(8,12).toString() === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw new Error("Only actual JPEG, PNG, and WebP image content is supported. SVG is not allowed.");
  try {
    const image = sharp(buffer,{limitInputPixels:20_000_000,failOn:"warning"});
    const metadata = await image.metadata();
    if (!["jpeg","png","webp"].includes(metadata.format ?? "") || !metadata.width || !metadata.height || metadata.width > 10000 || metadata.height > 10000 || (metadata.pages ?? 1)>1) throw new Error("Unsupported size or animated image.");
    const {data,info} = await image.rotate().resize({width:2400,height:2400,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
    if(data.length > MAX_PHOTO_BYTES) throw new Error("Encoded image exceeds limit.");
    return {data,width:info.width,height:info.height,size:data.length};
  } catch { throw new Error("The image could not be decoded safely. Use a non-animated JPEG, PNG, or WebP under 20 megapixels and 10,000 pixels per side."); }
}
