import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "../..");

const sourceSvgPath = resolve(repoRoot, "packages/dashboard/app/public/logo.svg");
const outputDir = resolve(packageDir, "src/icons");

const iconSizes = [16, 32, 48] as const;

const APP_ICON_SIZE = 1024;
const APP_ICON_PADDING = 128;
const APP_ICON_BG = "#0d1117";
const APP_ICON_FG = "#58a6ff";

async function main(): Promise<void> {
  const sourceSvg = await readFile(sourceSvgPath, "utf8");
  const trayTintedSvg = sourceSvg.replaceAll("currentColor", "#333333");
  const appTintedSvg = sourceSvg.replaceAll("currentColor", APP_ICON_FG);

  await mkdir(outputDir, { recursive: true });

  await Promise.all(
    iconSizes.map(async (size) => {
      const outputPath = resolve(outputDir, `tray-${size}.png`);
      await sharp(Buffer.from(trayTintedSvg), { density: 1024 })
        .resize(size, size, { fit: "contain" })
        .png({ compressionLevel: 9 })
        .toFile(outputPath);
    }),
  );

  const markSize = APP_ICON_SIZE - APP_ICON_PADDING * 2;
  const mark = await sharp(Buffer.from(appTintedSvg), { density: 2048 })
    .resize(markSize, markSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: APP_ICON_SIZE,
      height: APP_ICON_SIZE,
      channels: 4,
      background: APP_ICON_BG,
    },
  })
    .composite([{ input: mark, top: APP_ICON_PADDING, left: APP_ICON_PADDING }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(outputDir, "icon.png"));

  console.log(`Generated ${iconSizes.length} tray icons and app icon in ${outputDir}`);
}

void main();
