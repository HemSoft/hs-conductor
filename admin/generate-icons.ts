import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function generateIcons() {
  const svgPath = join(__dirname, 'public', 'icon.svg');
  const svgBuffer = readFileSync(svgPath);

  // Generate PNGs at different sizes for ICO
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers: Buffer[] = [];

  for (const size of sizes) {
    const pngBuffer = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    pngBuffers.push(pngBuffer);
  }

  // Generate ICO file
  const icoBuffer = await pngToIco(pngBuffers);
  writeFileSync(join(__dirname, 'public', 'icon.ico'), icoBuffer);
  console.log('Generated icon.ico');

  // Generate 256x256 PNG for electron-builder (Linux uses PNG)
  const png256 = await sharp(svgBuffer).resize(256, 256).png().toBuffer();
  writeFileSync(join(__dirname, 'public', 'icon.png'), png256);
  console.log('Generated icon.png');

  // Generate 512x512 PNG (some platforms prefer this)
  const png512 = await sharp(svgBuffer).resize(512, 512).png().toBuffer();
  writeFileSync(join(__dirname, 'public', 'icon-512.png'), png512);
  console.log('Generated icon-512.png');
}

generateIcons().catch(console.error);
