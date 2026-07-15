const fs = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const srcDir = process.argv[2];
const outFile = process.argv[3];

function walk(dir, base = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "[trash]") continue;
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...walk(full, rel));
    } else {
      files.push({ full, rel });
    }
  }
  return files;
}

const zip = new PizZip();
for (const { full, rel } of walk(srcDir)) {
  zip.file(rel, fs.readFileSync(full));
}

const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, buf);
console.log("wrote", outFile, buf.length, "bytes");
