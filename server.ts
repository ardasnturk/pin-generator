import express, { type RequestHandler } from "express";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import multer from "multer";
import archiver from "archiver";
import { generatePins } from "./pinGenerator";

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
} catch {
  // dotenv is optional; ignore if not installed.
}

const app = express();
const port = Number(process.env.PORT ?? "3000");
const rootDir = process.env.APP_ROOT ?? process.cwd();

const envOrDefault = (key: string, fallback: string) =>
  process.env[key] && process.env[key] !== "" ? process.env[key]! : fallback;

const DEFAULT_ENV: Record<string, string> = {
  BASE_PIN_COLOR_ACTIVE: envOrDefault("BASE_PIN_COLOR_ACTIVE", "#000"),
  BASE_PIN_COLOR_DEFAULT: envOrDefault("BASE_PIN_COLOR_DEFAULT", "#FFF"),
  BASE_PIN_COLOR_OWN: envOrDefault("BASE_PIN_COLOR_OWN", "#FFF"),
  BASE_PIN_RING_COLOR_ACTIVE: envOrDefault(
    "BASE_PIN_RING_COLOR_ACTIVE",
    "#FFF"
  ),
  BASE_PIN_STROKE_COLOR_OWN: envOrDefault(
    "BASE_PIN_STROKE_COLOR_OWN",
    "#000"
  ),
  CLUSTER_COLOR: envOrDefault("CLUSTER_COLOR", "#000"),
  CLUSTER_TEXT_COLOR: envOrDefault("CLUSTER_TEXT_COLOR", "#000"),
  COMPOSITE_SCALE: envOrDefault("COMPOSITE_SCALE", "2"),
  ICON_COLOR_ACTIVE: envOrDefault("ICON_COLOR_ACTIVE", "#FFF"),
  ICON_COLOR_DEFAULT: envOrDefault("ICON_COLOR_DEFAULT", "#000"),
  ICON_OFFSET_X_ACTIVE: envOrDefault("ICON_OFFSET_X_ACTIVE", "0"),
  ICON_OFFSET_X_DEFAULT: envOrDefault("ICON_OFFSET_X_DEFAULT", "0"),
  ICON_OFFSET_Y_ACTIVE: envOrDefault("ICON_OFFSET_Y_ACTIVE", "0"),
  ICON_OFFSET_Y_DEFAULT: envOrDefault("ICON_OFFSET_Y_DEFAULT", "0"),
  ICON_SCALE: envOrDefault("ICON_SCALE", "0.32"),
  MAP_PINS_BASE_URI: envOrDefault("MAP_PINS_BASE_URI", "pngWithSvg"),
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".svg") {
      cb(new Error("Only .svg files are allowed."));
      return;
    }
    cb(null, true);
  },
});
const uploadSingle: RequestHandler = upload.single("svg");
const uploadArray: RequestHandler = upload.array("svgs");

function renderFormHtml(): string {
  const inputRow = (label: string, name: string, type = "text") => `
    <label class="field">
      <span>${label}</span>
      <input type="${type}" name="${name}" value="${
        DEFAULT_ENV[name] ?? ""
      }" ${type === "number" ? 'step="any"' : ""} />
    </label>
  `;
  const colorRow = (label: string, name: string) => `
    <label class="field color-field">
      <span>${label}</span>
      <div class="color-control">
        <input
          type="text"
          name="${name}"
          value="${DEFAULT_ENV[name] ?? ""}"
          placeholder="#RRGGBB"
          autocomplete="off"
        />
        <button type="button" class="color-button" data-color-button="${name}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5h-3a5.5 5.5 0 1 1-5.5-5.5z"/>
          </svg>
          <span class="color-swatch" data-color-swatch="${name}"></span>
        </button>
        <input
          type="color"
          class="color-picker"
          data-color-picker="${name}"
          value="${DEFAULT_ENV[name] ?? "#000000"}"
          aria-label="${label}"
        />
      </div>
    </label>
  `;

  return `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Map Pin Creator</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: "Space Grotesk", "Segoe UI", sans-serif;
        --bg: linear-gradient(135deg, #f7f0e8, #f2f7ff);
        --card: #ffffffd1;
        --text: #1b1b1b;
        --muted: #3d3d3d;
        --field-text: #262626;
        --border: #d5d7df;
        --upload-border: #b8c0d6;
        --upload-bg: #f6f8ff;
        --button-bg: #242a56;
        --button-text: #fff;
        --shadow: 0 30px 60px rgba(36, 38, 43, 0.12);
        --preview-bg: #f1f3fb;
        --preview-border: #c9d0e3;
      }
      :root[data-theme="dark"] {
        --bg: radial-gradient(circle at top, #1d2338, #0f121c 65%);
        --card: #141826f5;
        --text: #f4f6ff;
        --muted: #c2c8db;
        --field-text: #e9ecf6;
        --border: #2a3146;
        --upload-border: #3a4566;
        --upload-bg: #171c2c;
        --button-bg: #e2b54a;
        --button-text: #1a1f2a;
        --shadow: 0 30px 60px rgba(8, 10, 18, 0.4);
        --preview-bg: #0f1424;
        --preview-border: #2b3550;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 2.5rem 1.5rem 3rem;
        color: var(--text);
        background: var(--bg);
      }
      main {
        max-width: 900px;
        margin: 0 auto;
        background: var(--card);
        border-radius: 24px;
        padding: 2.5rem;
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: clamp(2rem, 3vw, 2.75rem);
      }
      p {
        margin: 0 0 2rem;
        color: var(--muted);
      }
      form {
        display: grid;
        gap: 1.5rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 1rem;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--field-text);
      }
      .field input {
        padding: 0.65rem 0.75rem;
        border-radius: 12px;
        border: 1px solid var(--border);
        font-size: 0.95rem;
        background: transparent;
        color: inherit;
      }
      .color-control {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0.75rem;
        align-items: center;
        position: relative;
      }
      .color-button {
        position: relative;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: transparent;
        color: inherit;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.6rem;
        cursor: pointer;
      }
      .color-button svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }
      .color-swatch {
        width: 18px;
        height: 18px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: #000;
      }
      .color-picker {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
      .upload {
        padding: 1rem;
        border-radius: 16px;
        border: 2px dashed var(--upload-border);
        background: var(--upload-bg);
      }
      button {
        padding: 0.85rem 1.5rem;
        border-radius: 999px;
        border: none;
        background: var(--button-bg);
        color: var(--button-text);
        font-weight: 700;
        font-size: 1rem;
        cursor: pointer;
        align-self: start;
      }
      .hint {
        font-size: 0.85rem;
        color: var(--muted);
      }
      .preview {
        display: grid;
        gap: 1rem;
        position: relative;
      }
      .preview-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .preview-status {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: var(--muted);
        opacity: 0;
        transition: opacity 200ms ease;
      }
      .preview-status.is-loading {
        opacity: 1;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid var(--border);
        border-top-color: var(--text);
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .preview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 1rem;
      }
      .preview-card {
        background: var(--preview-bg);
        border: 1px solid var(--preview-border);
        border-radius: 16px;
        padding: 1rem;
        display: grid;
        gap: 0.5rem;
        justify-items: center;
      }
      .preview-card canvas {
        width: 90px;
        height: auto;
      }
      .preview-title {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--muted);
        text-align: center;
      }
      .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .toggle {
        padding: 0.5rem 1rem;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        color: inherit;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="toolbar">
        <div>
          <h1>Map Pin Creator Web Service</h1>
          <p>Upload your SVG icons, tune the colors and scale, then download everything in one click.</p>
        </div>
        <button class="toggle" type="button" id="themeToggle">Dark mode</button>
      </div>
      <form action="/generate" method="post" enctype="multipart/form-data">
        <section class="upload">
          <label class="field">
            <span>SVG Files</span>
            <input type="file" name="svgs" accept=".svg" multiple required />
          </label>
          <div class="hint">You can upload multiple SVGs. Files named defaultPin, defaultPinActive, ownLocationPin are skipped.</div>
        </section>
        <section class="grid">
          ${colorRow("Base Pin Color (Active)", "BASE_PIN_COLOR_ACTIVE")}
          ${colorRow("Base Pin Color (Default)", "BASE_PIN_COLOR_DEFAULT")}
          ${colorRow("Base Pin Color (Own)", "BASE_PIN_COLOR_OWN")}
          ${colorRow(
            "Base Pin Ring Color (Active)",
            "BASE_PIN_RING_COLOR_ACTIVE"
          )}
          ${colorRow(
            "Base Pin Stroke Color (Own)",
            "BASE_PIN_STROKE_COLOR_OWN"
          )}
          ${colorRow("Cluster Color", "CLUSTER_COLOR")}
          ${colorRow("Cluster Text Color", "CLUSTER_TEXT_COLOR")}
          ${inputRow("Composite Scale", "COMPOSITE_SCALE", "number")}
          ${colorRow("Icon Color (Active)", "ICON_COLOR_ACTIVE")}
          ${colorRow("Icon Color (Default)", "ICON_COLOR_DEFAULT")}
          ${inputRow("Icon Offset X (Active)", "ICON_OFFSET_X_ACTIVE", "number")}
          ${inputRow("Icon Offset X (Default)", "ICON_OFFSET_X_DEFAULT", "number")}
          ${inputRow("Icon Offset Y (Active)", "ICON_OFFSET_Y_ACTIVE", "number")}
          ${inputRow("Icon Offset Y (Default)", "ICON_OFFSET_Y_DEFAULT", "number")}
          ${inputRow("Icon Scale", "ICON_SCALE", "number")}
          ${inputRow("Map Pins Base URI", "MAP_PINS_BASE_URI")}
        </section>
        <section class="preview" aria-live="polite" id="previewSection">
          <div class="preview-header">
            <strong>Preview</strong>
            <span class="hint">Generated previews update as you tweak the settings.</span>
            <div class="preview-status" id="previewStatus" aria-hidden="true">
              <span class="spinner"></span>
              <span>Loading...</span>
            </div>
          </div>
          <div class="preview-grid" id="previewGrid">
            <div class="preview-card">
              <div class="preview-title">Upload SVG files to see previews.</div>
            </div>
          </div>
        </section>
        <button type="submit" id="generateButton">Generate + Download</button>
      </form>
    </main>
    <script>
      const root = document.documentElement;
      const toggle = document.getElementById("themeToggle");
      const setTheme = (theme) => {
        root.setAttribute("data-theme", theme);
        toggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
        localStorage.setItem("theme", theme);
      };
      const stored = localStorage.getItem("theme");
      if (stored) {
        setTheme(stored);
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setTheme("dark");
      } else {
        setTheme("light");
      }
      toggle.addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        setTheme(next);
      });

      const form = document.querySelector("form");
      const fileInput = form.querySelector("input[name=svgs]");
      const previewGrid = document.getElementById("previewGrid");
      const previewStatus = document.getElementById("previewStatus");
      const generateButton = document.getElementById("generateButton");
      let previewRequestId = 0;

      const normalizeHex = (value) => {
        if (!value) return null;
        let hex = value.trim();
        if (!hex.startsWith("#")) hex = "#" + hex;
        const short = /^#([0-9a-fA-F]{3})$/;
        const full = /^#([0-9a-fA-F]{6})$/;
        if (short.test(hex)) {
          return "#" + hex
            .slice(1)
            .split("")
            .map((ch) => ch + ch)
            .join("");
        }
        if (full.test(hex)) return hex.toUpperCase();
        return null;
      };

      const syncColorField = (name, value) => {
        const normalized = normalizeHex(value);
        const swatch = form.querySelector(\`[data-color-swatch="\${name}"]\`);
        const picker = form.querySelector(\`[data-color-picker="\${name}"]\`);
        if (swatch && normalized) swatch.style.background = normalized;
        if (picker && normalized) picker.value = normalized;
        return normalized;
      };

      const initColorFields = () => {
        const buttons = form.querySelectorAll("[data-color-button]");
        buttons.forEach((button) => {
          const name = button.getAttribute("data-color-button");
          const input = form.querySelector(\`input[name="\${name}"]\`);
          const picker = form.querySelector(\`[data-color-picker="\${name}"]\`);
          if (!name || !input || !picker) return;

          syncColorField(name, input.value);
          button.addEventListener("click", () => picker.click());
          picker.addEventListener("input", (event) => {
            const value = event.target.value;
            input.value = value.toUpperCase();
            syncColorField(name, value);
            debouncedRender();
          });
          input.addEventListener("input", (event) => {
            const value = event.target.value;
            const normalized = syncColorField(name, value);
            if (normalized) {
              input.value = normalized;
              debouncedRender();
            }
          });
          input.addEventListener("blur", (event) => {
            const value = event.target.value;
            const normalized = syncColorField(name, value);
            if (normalized) {
              input.value = normalized;
            }
          });
        });
      };

      const getSettings = () => Object.fromEntries(
        Array.from(form.querySelectorAll("input"))
          .filter((input) => input.name)
          .map((input) => [input.name, input.value])
      );

      const createPreviewCard = (title) => {
        const card = document.createElement("div");
        card.className = "preview-card";
        const label = document.createElement("div");
        label.className = "preview-title";
        label.textContent = title;
        card.appendChild(label);
        return card;
      };

      const renderPreviews = async () => {
        const requestId = ++previewRequestId;
        previewStatus.classList.add("is-loading");
        const files = fileInput.files ? Array.from(fileInput.files) : [];
        if (files.length === 0) {
          previewGrid.innerHTML = "";
          previewGrid.appendChild(createPreviewCard("Upload SVG files to see previews."));
          previewStatus.classList.remove("is-loading");
          return;
        }

        const nextGrid = document.createDocumentFragment();
        const settings = getSettings();
        for (const file of files) {
          const baseName = file.name.replace(/\\.svg$/i, "");
          const loadingCard = createPreviewCard(baseName + " / Loading...");
          nextGrid.appendChild(loadingCard);

          const formData = new FormData();
          formData.append("svg", file, file.name);
          for (const [key, value] of Object.entries(settings)) {
            formData.append(key, value);
          }

          try {
            const response = await fetch("/preview", {
              method: "POST",
              body: formData,
            });
            if (requestId !== previewRequestId) return;
            if (!response.ok) {
              loadingCard.querySelector(".preview-title").textContent =
                baseName + " / Preview failed";
              continue;
            }
            const data = await response.json();
            loadingCard.innerHTML = "";

            const defaultImg = new Image();
            defaultImg.src = data.defaultPng;
            loadingCard.appendChild(defaultImg);
            const defaultLabel = document.createElement("div");
            defaultLabel.className = "preview-title";
            defaultLabel.textContent = baseName + " / Default";
            loadingCard.appendChild(defaultLabel);

            const activeCard = document.createElement("div");
            activeCard.className = "preview-card";
            const activeImg = new Image();
            activeImg.src = data.activePng;
            activeCard.appendChild(activeImg);
            const activeLabel = document.createElement("div");
            activeLabel.className = "preview-title";
            activeLabel.textContent = baseName + " / Active";
            activeCard.appendChild(activeLabel);
            nextGrid.appendChild(activeCard);
          } catch (err) {
            if (requestId !== previewRequestId) return;
            loadingCard.querySelector(".preview-title").textContent =
              baseName + " / Preview failed";
          }
        }
        if (requestId === previewRequestId) {
          previewGrid.innerHTML = "";
          previewGrid.appendChild(nextGrid);
          previewStatus.classList.remove("is-loading");
        }
      };

      const debounce = (fn, delay) => {
        let timer;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), delay);
        };
      };

      const debouncedRender = debounce(renderPreviews, 300);
      form.addEventListener("input", debouncedRender);
      fileInput.addEventListener("change", debouncedRender);
      form.addEventListener("keydown", (event) => {
        const target = event.target;
        if (event.key === "Enter" && target instanceof HTMLInputElement) {
          event.preventDefault();
        }
      });
      form.addEventListener("submit", (event) => {
        if (event.submitter !== generateButton) {
          event.preventDefault();
        }
      });

      initColorFields();
      renderPreviews();
    </script>
  </body>
</html>`;
}

app.get("/", (_req, res) => {
  res.type("html").send(renderFormHtml());
});

app.get("/assets/:name", (req, res) => {
  const name = req.params.name;
  if (!["defaultPin.svg", "defaultPinActive.svg"].includes(name)) {
    res.status(404).send("Not found.");
    return;
  }
  res.sendFile(path.join(rootDir, "mapPins", name));
});

app.post("/preview", uploadSingle, async (req, res) => {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).send("No SVG file uploaded.");
    return;
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "map-pins-preview-"));
  const svgDir = path.join(tempRoot, "svg");
  const outputDir = path.join(tempRoot, "pngWithSvg");
  const mapSettingsOutput = path.join(tempRoot, "mapSettings.json");
  await fs.mkdir(svgDir, { recursive: true });

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await fs.rm(tempRoot, { recursive: true, force: true });
  };

  try {
    const safeName = path.basename(file.originalname);
    const svgPath = path.join(svgDir, safeName);
    await fs.writeFile(svgPath, file.buffer);

    await generatePins({
      rootDir,
      svgDir,
      outputDir,
      mapSettingsOutput,
      mapSettingsTemplate: path.join(rootDir, "simpleMapSettings.json"),
      baseDir: path.join(rootDir, "mapPins"),
      env: req.body as Record<string, string>,
    });

    const baseName = path.basename(safeName, ".svg");
    const defaultPath = path.join(outputDir, `${baseName}.png`);
    const activePath = path.join(outputDir, `${baseName}Active.png`);
    const [defaultBuf, activeBuf] = await Promise.all([
      fs.readFile(defaultPath),
      fs.readFile(activePath),
    ]);

    res.json({
      defaultPng: `data:image/png;base64,${defaultBuf.toString("base64")}`,
      activePng: `data:image/png;base64,${activeBuf.toString("base64")}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to generate preview.");
  } finally {
    await cleanup();
  }
});

app.post("/generate", uploadArray, async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    res.status(400).send("No SVG files uploaded.");
    return;
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "map-pins-"));
  const svgDir = path.join(tempRoot, "svg");
  const outputDir = path.join(tempRoot, "pngWithSvg");
  const mapSettingsOutput = path.join(tempRoot, "mapSettings.json");
  await fs.mkdir(svgDir, { recursive: true });

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await fs.rm(tempRoot, { recursive: true, force: true });
  };
  res.on("finish", cleanup);
  res.on("close", cleanup);

  try {
    await Promise.all(
      files.map((file) => {
        const safeName = path.basename(file.originalname);
        const outPath = path.join(svgDir, safeName);
        return fs.writeFile(outPath, file.buffer);
      })
    );

    await generatePins({
      rootDir,
      svgDir,
      outputDir,
      mapSettingsOutput,
      mapSettingsTemplate: path.join(rootDir, "simpleMapSettings.json"),
      baseDir: path.join(rootDir, "mapPins"),
      env: req.body as Record<string, string>,
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="map-pins.zip"'
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(res);
    archive.directory(outputDir, "pngWithSvg");
    archive.file(mapSettingsOutput, { name: "mapSettings.json" });
    await archive.finalize();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).send("Failed to generate files.");
    }
  }
});

app.listen(port, () => {
  console.log(`Map Pin Creator web service running on http://localhost:${port}`);
});
