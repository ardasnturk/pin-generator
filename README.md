# Map Pin Creator

A small TypeScript tool that generates map pin PNGs from SVG icons and writes a marker list into `mapSettings.json`.

## Requirements

- Node.js (LTS recommended)
- npm

## Installation

```bash
npm install
```

## Usage

The script reads SVG icons from `svg/`, composites them with the base pin SVGs in `mapPins/`, and writes output to `pngWithSvg/`.

```bash
npx tsx generatePins.ts
```

When it finishes, PNGs are written to `pngWithSvg/` and `mapSettings.json` is updated.

## Web Service

Run a local web service that lets users upload SVG icons, fill env values, and download a zip output.

```bash
npm install
npm run serve
```

Open `http://localhost:3000` in your browser, upload SVG files, adjust env values, and press **Generate + Download**.

## Deployment (free)

Recommended: Render (free tier).

1. Push this repo to GitHub.
2. Create a new **Web Service** on Render and connect the repo.
3. Use these settings:
   - Build command: `yarn install && yarn build`
   - Start command: `yarn start`
4. Deploy. Render will set `PORT` automatically.

You can set environment defaults in Render if you want them to prefill the form.

## Input / Output

- Input SVG icons: `svg/`
- Base pin SVGs: `mapPins/` (`defaultPin.svg`, `defaultPinActive.svg`, `ownLocationPin.svg`)
- Output PNGs: `pngWithSvg/`
- Settings output file: `mapSettings.json` (template: `simpleMapSettings.json`)

## Environment Variables

Configure via `.env`. See `.env.example` for a template.

Supported variables:

- `BASE_PIN_COLOR_ACTIVE`
- `BASE_PIN_COLOR_DEFAULT`
- `BASE_PIN_COLOR_OWN`
- `BASE_PIN_RING_COLOR_ACTIVE`
- `BASE_PIN_STROKE_COLOR_OWN`
- `CLUSTER_COLOR`
- `CLUSTER_TEXT_COLOR`
- `COMPOSITE_SCALE`
- `ICON_COLOR_ACTIVE`
- `ICON_COLOR_DEFAULT`
- `ICON_OFFSET_X_ACTIVE`
- `ICON_OFFSET_X_DEFAULT`
- `ICON_OFFSET_Y_ACTIVE`
- `ICON_OFFSET_Y_DEFAULT`
- `ICON_SCALE`
- `MAP_PINS_BASE_URI`

## Notes

- Icons named `defaultPin`, `defaultPinActive`, `ownLocationPin` in `svg/` are skipped automatically.
- `.env` is optional; defaults are used if not present.
- `CLUSTER_COLOR` and `CLUSTER_TEXT_COLOR` overwrite the related fields in `mapSettings.json`.
