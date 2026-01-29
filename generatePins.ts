import path from "path";
import { promises as fs } from "fs";
import sharp from "sharp";

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
} catch {
  // dotenv is optional; ignore if not installed.
}

const rootDir = __dirname;
const svgDir = path.join(rootDir, "svg");
const baseDir = path.join(rootDir, "mapPins");
const outputDir = path.join(rootDir, "pngWithSvg");

const baseDefault = path.join(baseDir, "defaultPin.svg");
const baseActive = path.join(baseDir, "defaultPinActive.svg");
const baseOwnLocation = path.join(baseDir, "ownLocationPin.svg");
const mapSettingsTemplate = path.join(rootDir, "simpleMapSettings.json");
const mapSettingsOutput = path.join(rootDir, "mapSettings.json");

const BASE_PIN_COLOR_ACTIVE = process.env.BASE_PIN_COLOR_ACTIVE ?? "#000";
const BASE_PIN_COLOR_DEFAULT = process.env.BASE_PIN_COLOR_DEFAULT ?? "#FFF";
const BASE_PIN_COLOR_OWN = process.env.BASE_PIN_COLOR_OWN ?? "#FFF";
const BASE_PIN_RING_COLOR_ACTIVE =
  process.env.BASE_PIN_RING_COLOR_ACTIVE ?? "#FFF";
const BASE_PIN_STROKE_COLOR_OWN =
  process.env.BASE_PIN_STROKE_COLOR_OWN ?? "#000";
const COMPOSITE_SCALE = Number(process.env.COMPOSITE_SCALE ?? "0");
const OUTPUT_SCALE = Number(process.env.OUTPUT_SCALE ?? "1"); // 1: 72x72, 2: 144x144, 3: 216x216
const CLUSTER_COLOR = process.env.CLUSTER_COLOR ?? "#000";
const CLUSTER_TEXT_COLOR = process.env.CLUSTER_TEXT_COLOR ?? "#000";
const ICON_COLOR_ACTIVE = process.env.ICON_COLOR_ACTIVE ?? "#FFF";
const ICON_COLOR_DEFAULT = process.env.ICON_COLOR_DEFAULT ?? "#000";
const ICON_OFFSET_X_ACTIVE = Number(process.env.ICON_OFFSET_X_ACTIVE ?? "0");
const ICON_OFFSET_X_DEFAULT = Number(process.env.ICON_OFFSET_X_DEFAULT ?? "0");
const ICON_OFFSET_Y_ACTIVE = Number(process.env.ICON_OFFSET_Y_ACTIVE ?? "0");
const ICON_OFFSET_Y_DEFAULT = Number(process.env.ICON_OFFSET_Y_DEFAULT ?? "0");
const ICON_SCALE = Number(process.env.ICON_SCALE ?? "0");
const MAP_PINS_BASE_URI = process.env.MAP_PINS_BASE_URI ?? "pngWithSvg";

type IconRend = {
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

async function getBaseMeta(input: string | Buffer): Promise<sharp.Metadata> {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Base pin metadata is missing width/height.");
  }
  return meta;
}

function applyColorMap(
  svgBuffer: Buffer,
  replacements: Record<string, string>,
): Buffer {
  let svg = svgBuffer.toString("utf8");
  for (const [from, to] of Object.entries(replacements)) {
    if (!from || !to) continue;
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = /^[a-z]+$/i.test(from)
      ? new RegExp(`\\b${escaped}\\b`, "gi")
      : new RegExp(escaped, "gi");
    svg = svg.replace(pattern, to);
  }
  return Buffer.from(svg);
}

function applyActiveColor(svgBuffer: Buffer, color: string): Buffer {
  const svg = svgBuffer.toString("utf8");
  const replaceHex = (input: string) =>
    input.replace(/#000000\b/gi, color).replace(/#000\b/gi, color);
  const replaceCurrentColor = (input: string) =>
    input.replace(/currentColor/gi, color);
  return Buffer.from(replaceCurrentColor(replaceHex(svg)));
}

async function renderIcon(svgBuffer: Buffer, size: number): Promise<IconRend> {
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
  baseInput: string | Buffer,
  icon: IconRend,
  outPath: string,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  scale: number,
): Promise<void> {
  const scaledWidth = Math.round(width * COMPOSITE_SCALE * scale);
  const scaledHeight = Math.round(height * COMPOSITE_SCALE * scale);
  const left = Math.round(
    (scaledWidth - icon.width) / 2 + offsetX * COMPOSITE_SCALE * scale,
  );
  const top = Math.round(
    (scaledHeight - icon.height) / 2 + offsetY * COMPOSITE_SCALE * scale,
  );

  await sharp(baseInput)
    .resize(scaledWidth, scaledHeight)
    .composite([{ input: icon.buffer, left, top }])
    .resize(width * scale, height * scale)
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
  await fs.access(baseOwnLocation);

  const baseDefaultSvg = await fs.readFile(baseDefault);
  const baseActiveSvg = await fs.readFile(baseActive);
  const baseOwnLocationSvg = await fs.readFile(baseOwnLocation);

  const baseDefaultColored = applyColorMap(baseDefaultSvg, {
    "#F7F5F0": BASE_PIN_COLOR_DEFAULT,
  });
  const baseActiveColored = applyColorMap(baseActiveSvg, {
    "#F7F5F0": BASE_PIN_RING_COLOR_ACTIVE,
    "#000000": BASE_PIN_COLOR_ACTIVE,
    "#000": BASE_PIN_COLOR_ACTIVE,
    black: BASE_PIN_COLOR_ACTIVE,
  });
  const baseOwnLocationColored = applyColorMap(baseOwnLocationSvg, {
    "#F7F5F0": BASE_PIN_COLOR_OWN,
    "#141414": BASE_PIN_STROKE_COLOR_OWN,
  });

  const baseMetaDefault = await getBaseMeta(baseDefaultColored);
  const baseMetaActive = await getBaseMeta(baseActiveColored);
  const iconSize = Math.round(
    Math.min(baseMetaDefault.width, baseMetaDefault.height) * ICON_SCALE,
  );
  const iconRenderSize = Math.round(iconSize * COMPOSITE_SCALE * OUTPUT_SCALE);

  const baseOutputDefault = path.join(outputDir, "defaultPin.png");
  const baseOutputActive = path.join(outputDir, "defaultPinActive.png");
  const baseOutputOwnLocation = path.join(outputDir, "ownLocationPin.png");

  await sharp(baseDefaultColored)
    .resize(
      Math.round(baseMetaDefault.width * OUTPUT_SCALE),
      Math.round(baseMetaDefault.height * OUTPUT_SCALE),
    )
    .png()
    .toFile(baseOutputDefault);
  await sharp(baseActiveColored)
    .resize(
      Math.round(baseMetaActive.width * OUTPUT_SCALE),
      Math.round(baseMetaActive.height * OUTPUT_SCALE),
    )
    .png()
    .toFile(baseOutputActive);
  const baseMetaOwnLocation = await getBaseMeta(baseOwnLocationColored);
  await sharp(baseOwnLocationColored)
    .resize(
      Math.round(baseMetaOwnLocation.width * OUTPUT_SCALE),
      Math.round(baseMetaOwnLocation.height * OUTPUT_SCALE),
    )
    .png()
    .toFile(baseOutputOwnLocation);

  const svgNames = svgFiles
    .map((svgPath) => path.basename(svgPath, ".svg"))
    .filter(
      (name) =>
        !["defaultPin", "defaultPinActive", "ownLocationPin"].includes(name),
    )
    .sort((a, b) => a.localeCompare(b));

  for (const svgPath of svgFiles) {
    const svgName = path.basename(svgPath, ".svg");
    const svgBuffer = await fs.readFile(svgPath);

    const activeSvgBuffer = applyActiveColor(svgBuffer, ICON_COLOR_ACTIVE);
    const defaultSvgBuffer = applyActiveColor(svgBuffer, ICON_COLOR_DEFAULT);
    const iconBlack = await renderIcon(defaultSvgBuffer, iconRenderSize);
    const iconWhite = await renderIcon(activeSvgBuffer, iconRenderSize);

    const outDefault = path.join(outputDir, `${svgName}.png`);
    const outActive = path.join(outputDir, `${svgName}Active.png`);

    await compositePin(
      baseDefaultColored,
      iconBlack,
      outDefault,
      baseMetaDefault.width,
      baseMetaDefault.height,
      ICON_OFFSET_X_DEFAULT,
      ICON_OFFSET_Y_DEFAULT,
      OUTPUT_SCALE,
    );
    await compositePin(
      baseActiveColored,
      iconWhite,
      outActive,
      baseMetaActive.width,
      baseMetaActive.height,
      ICON_OFFSET_X_ACTIVE,
      ICON_OFFSET_Y_ACTIVE,
      OUTPUT_SCALE,
    );
  }

  const mapSettings = JSON.parse(
    await fs.readFile(mapSettingsTemplate, "utf8"),
  ) as Record<string, unknown>;
  const baseUri = MAP_PINS_BASE_URI.replace(/\/+$/, "");
  const markerImages: Record<string, { uri: string; color: string }> = {
    defaultPin: {
      uri: `${baseUri}/defaultPin.png`,
      color: BASE_PIN_COLOR_DEFAULT,
    },
    defaultPinActive: {
      uri: `${baseUri}/defaultPinActive.png`,
      color: BASE_PIN_COLOR_ACTIVE,
    },
    ownLocationPin: {
      uri: `${baseUri}/ownLocationPin.png`,
      color: BASE_PIN_COLOR_OWN,
    },
  };

  for (const name of svgNames) {
    markerImages[name] = {
      uri: `${baseUri}/${name}.png`,
      color: BASE_PIN_COLOR_DEFAULT,
    };
    markerImages[`${name}Active`] = {
      uri: `${baseUri}/${name}Active.png`,
      color: BASE_PIN_COLOR_ACTIVE,
    };
  }

  mapSettings.markerImages = markerImages;
  mapSettings.clusterSuperiorColor = CLUSTER_COLOR;
  mapSettings.clusterSuperiorTextColor = CLUSTER_TEXT_COLOR;
  mapSettings.clusterFallbackColor = CLUSTER_COLOR;
  mapSettings.clusterFallbackTextColor = CLUSTER_TEXT_COLOR;
  (mapSettings.layerStyles as Record<string, any>).clusterCount.textColor =
    CLUSTER_TEXT_COLOR;

  await fs.writeFile(
    mapSettingsOutput,
    `${JSON.stringify(mapSettings, null, 2)}\n`,
  );

  console.log(`Done. Output in: ${outputDir}`);
}

run().catch((err: Error) => {
  console.error(err);
  process.exit(1);
});
