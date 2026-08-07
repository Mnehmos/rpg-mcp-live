import { basename, resolve } from "node:path";
import { verifyOpen5eS4Pack, verifyOpen5eS5Pack, verifyOpen5eS6Pack, verifyOpen5eS7Pack, verifyOpen5eS8Pack } from "../../src/content/open5e-pack-verify.js";

const requestedPath = process.argv[2]
  ?? "content/open5e/open5e-v2-full-corpus-s8";
const absolutePath = resolve(process.cwd(), requestedPath);
const result = basename(absolutePath).endsWith("-s8")
  ? await verifyOpen5eS8Pack(absolutePath)
  : basename(absolutePath).endsWith("-s7")
    ? await verifyOpen5eS7Pack(absolutePath)
  : basename(absolutePath).endsWith("-s6")
    ? await verifyOpen5eS6Pack(absolutePath)
  : basename(absolutePath).endsWith("-s5")
    ? await verifyOpen5eS5Pack(absolutePath)
    : await verifyOpen5eS4Pack(absolutePath);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
