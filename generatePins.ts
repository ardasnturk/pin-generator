import { generatePins } from "./pinGenerator";

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
} catch {
  // dotenv is optional; ignore if not installed.
}
generatePins({ env: process.env })
  .then(({ outputDir }) => {
    console.log(`Done. Output in: ${outputDir}`);
  })
  .catch((err: Error) => {
    console.error(err);
    process.exit(1);
  });
