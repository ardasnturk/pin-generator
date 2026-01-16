import path from "path";
import * as fsSync from "fs";
import { promises as fs } from "fs";
import sharp from "sharp";

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
} catch (err) {
  // dotenv is optional; ignore if not installed.
}

const rootDir = __dirname;
const svgDir = path.join(rootDir, "svg");
const baseDir = path.join(rootDir, "mapPins");
const outputDir = path.join(rootDir, "pngWithSvg");

const baseDefault = path.join(baseDir, "defaultPin.svg");
const baseActive = path.join(baseDir, "defaultPinActive.svg");
const mapSettingsTemplate = path.join(rootDir, "simpleMapSettings.json");
const mapSettingsOutput = path.join(rootDir, "mapSettings.json");

function readEnvOverrides(): Record<string, string> {
  const envPath = path.join(rootDir, ".env");
  try {
    const content = fsSync.readFileSync(envPath, "utf8");
    const entries: Record<string, string> = {};
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else if (/\s+#/.test(value)) {
        value = value.split(/\s+#/)[0];
      }
      entries[key] = value;
    }
    return entries;
  } catch (err) {
    return {};
  }
}

const ENV_OVERRIDES = readEnvOverrides();

function envString(key: string, fallback: string): string {
  const raw = process.env[key] ?? ENV_OVERRIDES[key];
  if (raw === undefined || raw === "") return fallback;
  return raw;
}

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key] ?? ENV_OVERRIDES[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const ICON_SCALE = envNumber("ICON_SCALE", 0);
const COMPOSITE_SCALE = envNumber("COMPOSITE_SCALE", 0);
const ICON_OFFSET_X_DEFAULT = envNumber("ICON_OFFSET_X_DEFAULT", 0);
const ICON_OFFSET_X_ACTIVE = envNumber("ICON_OFFSET_X_ACTIVE", 0);
const ICON_OFFSET_Y_DEFAULT = envNumber("ICON_OFFSET_Y_DEFAULT", 0);
const ICON_OFFSET_Y_ACTIVE = envNumber("ICON_OFFSET_Y_ACTIVE", 0);
const ICON_COLOR_ACTIVE = envString("ICON_COLOR_ACTIVE", "#FFFFFF");
const MAP_PINS_BASE_URI = envString("MAP_PINS_BASE_URI", "pngWithSvg");
const MARKER_COLOR_DEFAULT = envString("MARKER_COLOR_DEFAULT", "#F7F5F0");
const MARKER_COLOR_ACTIVE = envString("MARKER_COLOR_ACTIVE", "#DE7136");

type IconRender = {
  buffer: Buffer;
  width: number;
  height: number;
};

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function listSvgFiles(): Promise<string[]> {
  const entries = await fs.readdir(svgDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".svg"))
    .map((e) => path.join(svgDir, e.name));
}

async function getBaseMeta(filePath: string): Promise<sharp.Metadata> {
  const meta = await sharp(filePath).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Base pin metadata is missing width/height.");
  }
  return meta;
}

function applyActiveColor(svgBuffer: Buffer, color: string): Buffer {
  const svg = svgBuffer.toString("utf8");
  const replaceHex = (input: string) =>
    input.replace(/#000000\b/gi, color).replace(/#000\b/gi, color);
  const replaceCurrentColor = (input: string) =>
    input.replace(/currentColor/gi, color);
  return Buffer.from(replaceCurrentColor(replaceHex(svg)));
}

async function renderIcon(svgBuffer: Buffer, size: number): Promise<IconRender> {
  const rendered = await sharp(svgBuffer)
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
  const trimmed = await sharp(rendered)
    .trim({ threshold: 1 })
    .png()
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: trimmed.data,
    width: trimmed.info.width,
    height: trimmed.info.height,
  };
}

async function compositePin(
  basePath: string,
  icon: IconRender,
  outPath: string,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number
): Promise<void> {
  const scaledWidth = Math.round(width * COMPOSITE_SCALE);
  const scaledHeight = Math.round(height * COMPOSITE_SCALE);
  const left = Math.round(
    (scaledWidth - icon.width) / 2 + offsetX * COMPOSITE_SCALE
  );
  const top = Math.round(
    (scaledHeight - icon.height) / 2 + offsetY * COMPOSITE_SCALE
  );

  await sharp(basePath)
    .resize(scaledWidth, scaledHeight)
    .composite([{ input: icon.buffer, left, top }])
    .resize(width, height)
    .png()
    .toFile(outPath);
}

async function run(): Promise<void> {
  await ensureDir(outputDir);

  const svgFiles = await listSvgFiles();
  if (svgFiles.length === 0) {
    throw new Error("No SVG files found in svg folder.");
  }

  await fs.access(baseDefault);
  await fs.access(baseActive);

  const baseMetaDefault = await getBaseMeta(baseDefault);
  const baseMetaActive = await getBaseMeta(baseActive);
  const iconSize = Math.round(
    Math.min(baseMetaDefault.width, baseMetaDefault.height) * ICON_SCALE
  );
  const iconRenderSize = Math.round(iconSize * COMPOSITE_SCALE);

  const svgNames = svgFiles
    .map((svgPath) => path.basename(svgPath, ".svg"))
    .sort((a, b) => a.localeCompare(b));

  for (const svgPath of svgFiles) {
    const svgName = path.basename(svgPath, ".svg");
    const svgBuffer = await fs.readFile(svgPath);

    const activeSvgBuffer = applyActiveColor(svgBuffer, ICON_COLOR_ACTIVE);
    const iconBlack = await renderIcon(svgBuffer, iconRenderSize);
    const iconWhite = await renderIcon(activeSvgBuffer, iconRenderSize);

    const outDefault = path.join(outputDir, `${svgName}.png`);
    const outActive = path.join(outputDir, `${svgName}Active.png`);

    await compositePin(
      baseDefault,
      iconBlack,
      outDefault,
      baseMetaDefault.width,
      baseMetaDefault.height,
      ICON_OFFSET_X_DEFAULT,
      ICON_OFFSET_Y_DEFAULT
    );
    await compositePin(
      baseActive,
      iconWhite,
      outActive,
      baseMetaActive.width,
      baseMetaActive.height,
      ICON_OFFSET_X_ACTIVE,
      ICON_OFFSET_Y_ACTIVE
    );
  }

  const mapSettings = JSON.parse(
    await fs.readFile(mapSettingsTemplate, "utf8")
  ) as Record<string, unknown>;
  const baseUri = MAP_PINS_BASE_URI.replace(/\/+$/, "");
  const markerImages: Record<string, { uri: string; color: string }> = {};

  for (const name of svgNames) {
    markerImages[name] = {
      uri: `${baseUri}/${name}.png`,
      color: MARKER_COLOR_DEFAULT,
    };
    markerImages[`${name}Active`] = {
      uri: `${baseUri}/${name}Active.png`,
      color: MARKER_COLOR_ACTIVE,
    };
  }

  mapSettings.markerImages = markerImages;
  await fs.writeFile(
    mapSettingsOutput,
    `${JSON.stringify(mapSettings, null, 2)}\n`
  );

  console.log(`Done. Output in: ${outputDir}`);
}

run().catch((err: Error) => {
  console.error(err);
  process.exit(1);
});
