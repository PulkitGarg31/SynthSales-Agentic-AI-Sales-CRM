import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SRC = fileURLToPath(new URL("../../Logo/new.png", import.meta.url));
const OUT = fileURLToPath(new URL("../public/brand/emblem.png", import.meta.url));

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
  if (data[i] > 242 && data[i + 1] > 242 && data[i + 2] > 242) data[i + 3] = 0; // near-white → transparent
}
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(OUT);
console.log("emblem written:", OUT);
