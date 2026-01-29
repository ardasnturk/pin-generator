import path from "path";
import { promises as fs } from "fs";
import sharp from "sharp";

export type GeneratePinsOptions = {
  rootDir?: string;
  svgDir?: string;
  baseDir?: string;
  outputDir?: string;
  mapSettingsTemplate?: string;
  mapSettingsOutput?: string;
  env?: Record<string, string | undefined>;
};

export type GeneratePinsResult = {
  outputDir: string;
  mapSettingsOutput: string;
};

type IconRend = {
  buffer: Buffer;
  width: number;
  height: number;
};

function resolveEnvValue(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key];
  if (value === undefined || value === "") return undefined;
  return value;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function listSvgFiles(svgDir: string): Promise<string[]> {
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
  compositeScale: number,
): Promise<void> {
  const scaledWidth = Math.round(width * compositeScale);
  const scaledHeight = Math.round(height * compositeScale);
  const left = Math.round(
    (scaledWidth - icon.width) / 2 + offsetX * compositeScale,
  );
  const top = Math.round(
    (scaledHeight - icon.height) / 2 + offsetY * compositeScale,
  );

  await sharp(baseInput)
    .resize(scaledWidth, scaledHeight)
    .composite([{ input: icon.buffer, left, top }])
    .resize(width, height)
    .png()
    .toFile(outPath);
}

export async function generatePins(
  options: GeneratePinsOptions = {},
): Promise<GeneratePinsResult> {
  const rootDir = options.rootDir ?? __dirname;
  const svgDir = options.svgDir ?? path.join(rootDir, "svg");
  const baseDir = options.baseDir ?? path.join(rootDir, "mapPins");
  const outputDir = options.outputDir ?? path.join(rootDir, "pngWithSvg");
  const mapSettingsTemplate =
    options.mapSettingsTemplate ?? path.join(rootDir, "simpleMapSettings.json");
  const mapSettingsOutput =
    options.mapSettingsOutput ?? path.join(rootDir, "mapSettings.json");
  const env = { ...process.env, ...(options.env ?? {}) };

  const BASE_PIN_COLOR_ACTIVE =
    resolveEnvValue(env, "BASE_PIN_COLOR_ACTIVE") ?? "#000";
  const BASE_PIN_COLOR_DEFAULT =
    resolveEnvValue(env, "BASE_PIN_COLOR_DEFAULT") ?? "#FFF";
  const BASE_PIN_COLOR_OWN =
    resolveEnvValue(env, "BASE_PIN_COLOR_OWN") ?? "#FFF";
  const BASE_PIN_RING_COLOR_ACTIVE =
    resolveEnvValue(env, "BASE_PIN_RING_COLOR_ACTIVE") ?? "#FFF";
  const BASE_PIN_STROKE_COLOR_OWN =
    resolveEnvValue(env, "BASE_PIN_STROKE_COLOR_OWN") ?? "#000";
  const COMPOSITE_SCALE = Number(
    resolveEnvValue(env, "COMPOSITE_SCALE") ?? "0",
  );
  const OUTPUT_SCALE = Number(resolveEnvValue(env, "OUTPUT_SCALE") ?? "1");
  const CLUSTER_COLOR = resolveEnvValue(env, "CLUSTER_COLOR") ?? "#000";
  const CLUSTER_TEXT_COLOR =
    resolveEnvValue(env, "CLUSTER_TEXT_COLOR") ?? "#000";
  const ICON_COLOR_ACTIVE = resolveEnvValue(env, "ICON_COLOR_ACTIVE") ?? "#FFF";
  const ICON_COLOR_DEFAULT =
    resolveEnvValue(env, "ICON_COLOR_DEFAULT") ?? "#000";
  const ICON_OFFSET_X_ACTIVE = Number(
    resolveEnvValue(env, "ICON_OFFSET_X_ACTIVE") ?? "0",
  );
  const ICON_OFFSET_X_DEFAULT = Number(
    resolveEnvValue(env, "ICON_OFFSET_X_DEFAULT") ?? "0",
  );
  const ICON_OFFSET_Y_ACTIVE = Number(
    resolveEnvValue(env, "ICON_OFFSET_Y_ACTIVE") ?? "0",
  );
  const ICON_OFFSET_Y_DEFAULT = Number(
    resolveEnvValue(env, "ICON_OFFSET_Y_DEFAULT") ?? "0",
  );
  const ICON_SCALE = Number(resolveEnvValue(env, "ICON_SCALE") ?? "0");
  const MAP_PINS_BASE_URI =
    resolveEnvValue(env, "MAP_PINS_BASE_URI") ?? "pngWithSvg";

  if (!Number.isFinite(COMPOSITE_SCALE) || COMPOSITE_SCALE <= 0) {
    throw new Error("COMPOSITE_SCALE must be a positive number.");
  }
  if (!Number.isFinite(ICON_SCALE) || ICON_SCALE <= 0 || ICON_SCALE > 1) {
    throw new Error("ICON_SCALE must be a number between 0 and 1.");
  }

  await ensureDir(outputDir);

  const svgFiles = await listSvgFiles(svgDir);
  if (svgFiles.length === 0) {
    throw new Error("No SVG files found in svg folder.");
  }

  const baseDefault = path.join(baseDir, "defaultPin.svg");
  const baseActive = path.join(baseDir, "defaultPinActive.svg");
  const baseOwnLocation = path.join(baseDir, "ownLocationPin.svg");

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
  const baseMetaOwnLocation = await getBaseMeta(baseOwnLocationColored);

  // Ölçekli boyutlar
  const scaledWidthDefault = Math.round(baseMetaDefault.width * OUTPUT_SCALE);
  const scaledHeightDefault = Math.round(baseMetaDefault.height * OUTPUT_SCALE);
  const scaledWidthActive = Math.round(baseMetaActive.width * OUTPUT_SCALE);
  const scaledHeightActive = Math.round(baseMetaActive.height * OUTPUT_SCALE);
  const scaledWidthOwn = Math.round(baseMetaOwnLocation.width * OUTPUT_SCALE);
  const scaledHeightOwn = Math.round(baseMetaOwnLocation.height * OUTPUT_SCALE);

  // İkon boyutu da ölçeklenmeli
  const iconSize = Math.round(
    Math.min(baseMetaDefault.width, baseMetaDefault.height) *
      ICON_SCALE *
      OUTPUT_SCALE,
  );
  const iconRenderSize = Math.round(iconSize * COMPOSITE_SCALE);
  if (iconSize <= 0 || iconRenderSize <= 0) {
    throw new Error(
      "ICON_SCALE, COMPOSITE_SCALE or OUTPUT_SCALE are too small; resulting icon size is 0.",
    );
  }
  if (iconRenderSize > Math.min(scaledWidthDefault, scaledHeightDefault)) {
    throw new Error("ICON_SCALE is too large; icon exceeds base pin size.");
  }

  const baseOutputDefault = path.join(outputDir, "defaultPin.png");
  const baseOutputActive = path.join(outputDir, "defaultPinActive.png");
  const baseOutputOwnLocation = path.join(outputDir, "ownLocationPin.png");

  await sharp(baseDefaultColored)
    .resize(scaledWidthDefault, scaledHeightDefault)
    .png()
    .toFile(baseOutputDefault);
  await sharp(baseActiveColored)
    .resize(scaledWidthActive, scaledHeightActive)
    .png()
    .toFile(baseOutputActive);
  await sharp(baseOwnLocationColored)
    .resize(scaledWidthOwn, scaledHeightOwn)
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
      scaledWidthDefault,
      scaledHeightDefault,
      ICON_OFFSET_X_DEFAULT * OUTPUT_SCALE,
      ICON_OFFSET_Y_DEFAULT * OUTPUT_SCALE,
      COMPOSITE_SCALE,
    );
    await compositePin(
      baseActiveColored,
      iconWhite,
      outActive,
      scaledWidthActive,
      scaledHeightActive,
      ICON_OFFSET_X_ACTIVE * OUTPUT_SCALE,
      ICON_OFFSET_Y_ACTIVE * OUTPUT_SCALE,
      COMPOSITE_SCALE,
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

  return { outputDir, mapSettingsOutput };
}
