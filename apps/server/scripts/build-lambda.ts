import { promises as fs, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDeflateRaw } from "node:zlib";
import { build } from "tsdown";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverDir = path.resolve(__dirname, "..");
const distDir = path.join(serverDir, "dist");
const lambdaDistDir = path.join(distDir, "lambda");
const zipPath = path.join(distDir, "lambda.zip");

// ── ZIP helpers (built with Node.js zlib, zero external deps) ───────────

const textEncoder = new TextEncoder();

const DOS_EPOCH = new Date("1980-01-01T00:00:00Z");

const toDosDateTime = (date: Date) => {
  const d = date < DOS_EPOCH ? DOS_EPOCH : date;
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((d.getSeconds() >> 1) & 0x1f);
  const dateVal =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return { time, date: dateVal };
};

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

const crc32 = (buf: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = crc32Table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

interface ZipEntry {
  name: string;
  uncompressedSize: number;
  compressedSize: number;
  crc: number;
  dosTime: number;
  dosDate: number;
  localHeaderOffset: number;
  compressedData: Buffer;
}

const deflateBuffer = async (input: Buffer): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  const deflater = createDeflateRaw({ level: 9 });
  deflater.on("data", (chunk: Buffer) => chunks.push(chunk));
  return new Promise((resolve, reject) => {
    deflater.on("end", () => resolve(Buffer.concat(chunks)));
    deflater.on("error", reject);
    deflater.end(input);
  });
};

const buildZip = async (
  files: { relativePath: string; absolutePath: string }[],
  outputPath: string,
) => {
  const entries: ZipEntry[] = [];

  for (const file of files) {
    const content = await fs.readFile(file.absolutePath);
    const compressed = await deflateBuffer(content);
    const { time, date } = toDosDateTime(new Date());

    entries.push({
      name: file.relativePath,
      uncompressedSize: content.length,
      compressedSize: compressed.length,
      crc: crc32(content),
      dosTime: time,
      dosDate: date,
      localHeaderOffset: 0,
      compressedData: compressed,
    });
  }

  const buffers: Buffer[] = [];
  let offset = 0;

  // Local file headers + data
  for (const entry of entries) {
    entry.localHeaderOffset = offset;
    const nameBytes = textEncoder.encode(entry.name);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(entry.dosTime, 10);
    localHeader.writeUInt16LE(entry.dosDate, 12);
    localHeader.writeUInt32LE(entry.crc, 14);
    localHeader.writeUInt32LE(entry.compressedSize, 18);
    localHeader.writeUInt32LE(entry.uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    buffers.push(localHeader, Buffer.from(nameBytes), entry.compressedData);
    offset += 30 + nameBytes.length + entry.compressedSize;
  }

  // Central directory
  const centralDirOffset = offset;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(entry.dosTime, 12);
    centralHeader.writeUInt16LE(entry.dosDate, 14);
    centralHeader.writeUInt32LE(entry.crc, 16);
    centralHeader.writeUInt32LE(entry.compressedSize, 20);
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(entry.localHeaderOffset, 42);

    buffers.push(centralHeader, Buffer.from(nameBytes));
    offset += 46 + nameBytes.length;
  }

  const centralDirSize = offset - centralDirOffset;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);
  buffers.push(eocd);

  await fs.writeFile(outputPath, Buffer.concat(buffers));
};

// ── Recursive file walker ───────────────────────────────────────────────

const walkDir = async (
  dir: string,
  baseDir: string,
): Promise<{ relativePath: string; absolutePath: string }[]> => {
  const results: { relativePath: string; absolutePath: string }[] = [];
  const dirEntries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of dirEntries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkDir(fullPath, baseDir);
      results.push(...nested);
    } else {
      results.push({
        relativePath: path.relative(baseDir, fullPath),
        absolutePath: fullPath,
      });
    }
  }
  return results;
};

// ── Main ────────────────────────────────────────────────────────────────

const main = async () => {
  console.log("🔨 Building Lambda bundle with tsdown...");
  await build({
    entry: ["./src/lambda.ts"],
    format: "esm",
    outDir: "./dist/lambda",
    clean: true,
    noExternal: [/@aws-demo-001\/.*/],
  });

  // Write minimal package.json for ESM
  await fs.mkdir(lambdaDistDir, { recursive: true });
  await fs.writeFile(
    path.join(lambdaDistDir, "package.json"),
    JSON.stringify({ type: "module" }),
    "utf-8",
  );

  console.log("📦 Packaging Lambda ZIP archive...");
  const files = await walkDir(lambdaDistDir, lambdaDistDir);
  await buildZip(files, zipPath);

  const stats = statSync(zipPath);
  const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`✅ Lambda package generated: ${zipPath} (${sizeMb} MB)`);
};

main().catch((err) => {
  console.error("❌ Failed to build Lambda ZIP:", err);
  process.exit(1);
});
