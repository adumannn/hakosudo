import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const SAMPLE_RATE = 44100;
const SFX_DIR = path.join(process.cwd(), "public", "sfx");

function checkFfmpeg(): void {
  const result = spawnSync("ffmpeg", ["-version"], { stdio: "pipe" });
  if (result.error || result.status !== 0) {
    console.error("ffmpeg not found on PATH. Install it (e.g. `brew install ffmpeg`) and try again.");
    process.exit(1);
  }
}

function main(): void {
  checkFfmpeg();
  fs.mkdirSync(SFX_DIR, { recursive: true });
  console.log("sfx pipeline ready (no recipes yet)");
}

main();
