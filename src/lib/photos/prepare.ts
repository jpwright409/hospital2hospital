"use client";
import { MAX_IMAGE_UPLOAD_BYTES } from "../upload-limits.mjs";

// Larger originals stay on the device. Only the prepared <=3 MB file is sent.
export async function prepareCameraPhoto(file: File): Promise<File> {
  if (!file.size || file.size > 20_000_000) throw new Error("Choose a photo up to 20 MB before compression.");
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  const png = [137,80,78,71,13,10,26,10].every((b,i)=>signature[i]===b);
  const webp = String.fromCharCode(...signature.slice(0,4)) === "RIFF" && String.fromCharCode(...signature.slice(8,12)) === "WEBP";
  if (!jpeg && !png && !webp) throw new Error("Use a JPEG, PNG or WebP photo. HEIC/HEIF and SVG are not supported; export as JPEG or use your camera's compatible format.");
  // Reject animation containers before canvas could silently flatten a frame.
  if (png || webp) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    for (let offset=png?8:12;offset+8<=bytes.length;) {
      const length=view.getUint32(offset+(png?0:4),!png);
      const type=String.fromCharCode(...bytes.slice(offset+(png?4:0),offset+(png?8:4)));
      if (["acTL","ANIM","ANMF"].includes(type)) throw new Error("Animated images are not supported. Choose a still photo.");
      const next=offset+length+(png?12:8)+(webp?length%2:0);
      if(next<=offset||next>bytes.length)break;
      offset=next;
    }
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("This browser could not open that image. Choose a JPEG or try another supported browser."); }
  try {
    if (bitmap.width * bitmap.height > 20_000_000 || Math.max(bitmap.width,bitmap.height)>10000) throw new Error("Use a photo under 20 megapixels and 10,000 pixels per side. Choose a lower camera resolution.");
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1,Math.round(bitmap.width * scale));
    canvas.height = Math.max(1,Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Photo preparation is unavailable in this browser.");
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for (const quality of [.88,.75,.6,.45]) {
      const blob = await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
      if (blob && blob.size <= MAX_IMAGE_UPLOAD_BYTES) return new File([blob],"listing-photo.jpg",{type:"image/jpeg"});
    }
    throw new Error("This photo is still too large. Choose a smaller image.");
  } finally { bitmap.close(); }
}
