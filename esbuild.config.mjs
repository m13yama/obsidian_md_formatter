import { context } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const build = await context({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  platform: "browser",
  target: "es2020",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
  legalComments: "eof",
});

if (watch) {
  await build.watch();
} else {
  await build.rebuild();
  await build.dispose();
  const destination = "dist/prettier-md-formatter";
  await mkdir(destination, { recursive: true });
  for (const name of ["main.js", "manifest.json", "styles.css"]) {
    await copyFile(name, `${destination}/${name}`);
  }
}
