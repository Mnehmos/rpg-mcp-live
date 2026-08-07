import { appendFile, cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyOpen5eS0Pack, verifyOpen5eS1Pack, verifyOpen5eS2Pack, verifyOpen5eS3Pack, verifyOpen5eS4Pack, verifyOpen5eS5Pack, verifyOpen5eS6Pack, verifyOpen5eS7Pack } from "./open5e-pack-verify.js";

const INSTALLED_S0_PACK = join(process.cwd(), "content", "open5e", "open5e-v2-srd-2014-s0");
const INSTALLED_S1_PACK = join(process.cwd(), "content", "open5e", "open5e-v2-srd-2014-s1");
const INSTALLED_S2_PACK = join(process.cwd(), "content", "open5e", "open5e-v2-srd-2014-s2");
const INSTALLED_S3_PACK = join(process.cwd(), "content", "open5e", "open5e-v2-srd-2014-s3");
const INSTALLED_S4_PACK = join(process.cwd(), "content", "open5e", "open5e-v2-srd-2014-s4");
const INSTALLED_S5_PACK = join(process.cwd(), "content", "open5e", "open5e-v2-srd-2014-s5");
const INSTALLED_S6_PACK = join(process.cwd(), "content", "open5e", "open5e-v2-srd-2014-s6");
const INSTALLED_S7_PACK = join(process.cwd(), "content", "open5e", "open5e-v2-srd-2014-s7");
const EXPECTED_S0_PACK_HASH = "4ab7eb54947841957f63c468dfbf266306779db470ceb7aacbd3eecf11aa2f95";
const EXPECTED_S1_PACK_HASH = "7a30c58868cb9dfd87124582a26f95cfa43577d948f3bfc5311e7ab52eb03bf3";
const EXPECTED_S2_PACK_HASH = "83769faa5856c783ebdba7c8cefaa343906060014299a18d98f30cdbf76eda77";
const EXPECTED_S3_PACK_HASH = "7361fcafbc7c88d621e1c8ff5e0ac1dfe63cf3a4edaa76e0ac62aa2ff34c8d9a";
const EXPECTED_S4_PACK_HASH = "bc6c66ab1ca45172cabae0927fee049b8f4113fb28ace9c1729ac0299117ce52";
const EXPECTED_S5_PACK_HASH = "fe125d285c9860fc699d2c08a8199e8cd400a5ad2097bf6d9a8a708f717fb473";
const EXPECTED_S6_PACK_HASH = "723c99f85ad0a778577cc673df51762d24b3fa56071c35edea7d285cb8270f62";
const EXPECTED_S7_PACK_HASH = "a189ccc9b1b691e790f08c2aab3e090b4f3c7f6255ab28ec94485fadbd939644";

describe("installed Open5e S0 pack", () => {
  it("passes schema, provenance, ordering, count, and checksum verification", async () => {
    const result = await verifyOpen5eS0Pack(INSTALLED_S0_PACK);

    expect(result.packHash).toBe(EXPECTED_S0_PACK_HASH);
    expect(result.collections).toEqual({
      conditions: { raw: 15, normalized: 15, compiled: 0 },
      damagetypes: { raw: 13, normalized: 13, compiled: 0 },
      sizes: { raw: 6, normalized: 6, compiled: 0 },
      documents: { raw: 5, normalized: 5, compiled: 0 },
    });
  });

  it("verifies the active S1 pack and its reviewed currency compilation", async () => {
    const result = await verifyOpen5eS1Pack(INSTALLED_S1_PACK);

    expect(result.packHash).toBe(EXPECTED_S1_PACK_HASH);
    expect(result.collections).toEqual({
      conditions: { raw: 15, normalized: 15, compiled: 0 },
      damagetypes: { raw: 13, normalized: 13, compiled: 0 },
      sizes: { raw: 6, normalized: 6, compiled: 0 },
      documents: { raw: 5, normalized: 5, compiled: 0 },
      skills: { raw: 20, normalized: 18, compiled: 0 },
      rules: { raw: 1, normalized: 1, compiled: 1 },
    });
  });

  it("verifies the active S2 pack, references, and reviewed equipment compilation", async () => {
    const result = await verifyOpen5eS2Pack(INSTALLED_S2_PACK);

    expect(result.packHash).toBe(EXPECTED_S2_PACK_HASH);
    expect(result.collections).toEqual({
      conditions: { raw: 15, normalized: 15, compiled: 0 },
      damagetypes: { raw: 13, normalized: 13, compiled: 0 },
      sizes: { raw: 6, normalized: 6, compiled: 0 },
      documents: { raw: 5, normalized: 5, compiled: 0 },
      skills: { raw: 20, normalized: 18, compiled: 0 },
      rules: { raw: 1, normalized: 1, compiled: 1 },
      items: { raw: 237, normalized: 237, compiled: 1 },
      weapons: { raw: 37, normalized: 37, compiled: 0 },
      armor: { raw: 12, normalized: 12, compiled: 0 },
      magicitems: { raw: 499, normalized: 499, compiled: 0 },
      weaponproperties: { raw: 12, normalized: 12, compiled: 0 },
      itemrarities: { raw: 6, normalized: 6, compiled: 0 },
    });
  });

  it("verifies the active S3 creature corpus, reference closure, and exact attacks", async () => {
    const result = await verifyOpen5eS3Pack(INSTALLED_S3_PACK);

    expect(result.packHash).toBe(EXPECTED_S3_PACK_HASH);
    expect(result.collections).toEqual({
      conditions: { raw: 15, normalized: 15, compiled: 0 },
      damagetypes: { raw: 13, normalized: 13, compiled: 0 },
      sizes: { raw: 6, normalized: 6, compiled: 0 },
      documents: { raw: 6, normalized: 6, compiled: 0 },
      skills: { raw: 20, normalized: 18, compiled: 0 },
      rules: { raw: 1, normalized: 1, compiled: 1 },
      items: { raw: 237, normalized: 237, compiled: 1 },
      weapons: { raw: 37, normalized: 37, compiled: 0 },
      armor: { raw: 12, normalized: 12, compiled: 0 },
      magicitems: { raw: 499, normalized: 499, compiled: 0 },
      weaponproperties: { raw: 12, normalized: 12, compiled: 0 },
      itemrarities: { raw: 6, normalized: 6, compiled: 0 },
      creaturetypes: { raw: 14, normalized: 14, compiled: 0 },
      environments: { raw: 30, normalized: 30, compiled: 0 },
      creaturesets: { raw: 1, normalized: 1, compiled: 0 },
      creatures: { raw: 325, normalized: 325, compiled: 317 },
    });
  });

  it("verifies the active S4 spell corpus, mixed-version provenance, class lists, progressions, and exact effects", async () => {
    const result = await verifyOpen5eS4Pack(INSTALLED_S4_PACK);

    expect(result.packHash).toBe(EXPECTED_S4_PACK_HASH);
    expect(result.collections).toMatchObject({
      conditions: { raw: 15, normalized: 15, compiled: 0 },
      damagetypes: { raw: 13, normalized: 13, compiled: 0 },
      sizes: { raw: 6, normalized: 6, compiled: 0 },
      documents: { raw: 6, normalized: 6, compiled: 0 },
      skills: { raw: 20, normalized: 18, compiled: 0 },
      rules: { raw: 1, normalized: 1, compiled: 1 },
      items: { raw: 237, normalized: 237, compiled: 1 },
      creatures: { raw: 325, normalized: 325, compiled: 317 },
      spellschools: { raw: 8, normalized: 8, compiled: 0 },
      spells: { raw: 319, normalized: 319, compiled: 33 },
      spelllists: { raw: 7, normalized: 7, compiled: 0 },
      spellprogressions: { raw: 12, normalized: 8, compiled: 0 },
    });
  });

  it("verifies the S5 character corpus and reviewed creation profiles", async () => {
    const result = await verifyOpen5eS5Pack(INSTALLED_S5_PACK);

    expect(result.packHash).toBe(EXPECTED_S5_PACK_HASH);
    expect(result.collections).toMatchObject({
      documents: { raw: 7, normalized: 7, compiled: 0 },
      skills: { raw: 20, normalized: 18, compiled: 0 },
      abilities: { raw: 6, normalized: 6, compiled: 0 },
      languages: { raw: 19, normalized: 18, compiled: 0 },
      alignments: { raw: 9, normalized: 9, compiled: 0 },
      species: { raw: 13, normalized: 13, compiled: 13 },
      classes: { raw: 24, normalized: 24, compiled: 12 },
      backgrounds: { raw: 1, normalized: 1, compiled: 1 },
      feats: { raw: 1, normalized: 1, compiled: 0 },
    });
  });

  it("verifies the S6 rules graph and v1-only reference collections", async () => {
    const result = await verifyOpen5eS6Pack(INSTALLED_S6_PACK);

    expect(result.packHash).toBe(EXPECTED_S6_PACK_HASH);
    expect(result.collections).toMatchObject({
      rules: { raw: 227, normalized: 227, compiled: 1 },
      rulesets: { raw: 41, normalized: 41, compiled: 0 },
      sections: { raw: 45, normalized: 45, compiled: 0 },
      planes: { raw: 8, normalized: 8, compiled: 0 },
      species: { raw: 13, normalized: 13, compiled: 13 },
      classes: { raw: 24, normalized: 24, compiled: 12 },
      backgrounds: { raw: 1, normalized: 1, compiled: 1 },
    });
  });

  it("verifies the S7 source-retaining effect programs", async () => {
    const result = await verifyOpen5eS7Pack(INSTALLED_S7_PACK);

    expect(result.packHash).toBe(EXPECTED_S7_PACK_HASH);
    expect(result.collections).toMatchObject({
      creatures: { raw: 325, normalized: 325, compiled: 608 },
      spells: { raw: 319, normalized: 319, compiled: 82 },
      rules: { raw: 227, normalized: 227, compiled: 1 },
      rulesets: { raw: 41, normalized: 41, compiled: 0 },
      sections: { raw: 45, normalized: 45, compiled: 0 },
      planes: { raw: 8, normalized: 8, compiled: 0 },
    });
  });

  it("rejects a pack whose bytes drift after import", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "open5e-s0-tamper-"));
    const copiedPack = join(temporaryRoot, "pack");
    await cp(INSTALLED_S0_PACK, copiedPack, { recursive: true });
    await appendFile(join(copiedPack, "normalized", "conditions.ndjson"), "\n", "utf8");

    await expect(verifyOpen5eS0Pack(copiedPack)).rejects.toThrow("artifact hash mismatch");
  });
});
