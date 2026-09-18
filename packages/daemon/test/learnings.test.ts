import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { closeDb, db, initDb } from "../src/state/db.js";
import {
  composePrimingPreamble,
  digByTopic,
  findLearning,
  findLearningsForPriming,
  insertLearning,
  promoteEligibleLearnings,
  recordPrimings,
  learningsForRun,
} from "../src/state/learnings.js";
import type { Layer, Learning } from "@reef/shared";

const DAY = 24 * 60 * 60 * 1000;
const REPO = "/tmp/repo-a";

let seq = 0;
function learning(over: Partial<Learning> = {}): Learning {
  seq += 1;
  return {
    id: `l${seq}`,
    content: `fact ${seq}`,
    topic: `topic-${seq}`,
    layer: "topsoil" as Layer,
    repoPath: REPO,
    confidence: 0.5,
    referencesCount: 0,
    createdAt: Date.now() - 30 * DAY,
    ...over,
  };
}

function addRun(id: string) {
  db()
    .prepare(`INSERT INTO runs (id, repo_path, prompt, status, started_at) VALUES (?, ?, 'p', 'done', ?)`)
    .run(id, REPO, Date.now());
}

beforeEach(() => {
  initDb(":memory:");
  seq = 0;
});
afterEach(() => closeDb());

describe("promoteEligibleLearnings (topsoil → loam)", () => {
  it("promotes topsoil that is old enough and referenced enough", () => {
    insertLearning(learning({ id: "ok", referencesCount: 3, createdAt: Date.now() - 8 * DAY }));
    expect(promoteEligibleLearnings()).toBe(1);
    expect(findLearning("ok")?.layer).toBe("loam");
    expect(findLearning("ok")?.promotedAt).toBeTypeOf("number");
  });

  it("leaves topsoil alone when it is under-referenced or too young", () => {
    insertLearning(learning({ id: "few", referencesCount: 2, createdAt: Date.now() - 30 * DAY }));
    insertLearning(learning({ id: "young", referencesCount: 10, createdAt: Date.now() - 6 * DAY }));
    expect(promoteEligibleLearnings()).toBe(0);
    expect(findLearning("few")?.layer).toBe("topsoil");
    expect(findLearning("young")?.layer).toBe("topsoil");
  });

  it("never touches loam, bedrock or fossil: those moves are a human's", () => {
    for (const layer of ["loam", "bedrock", "fossil"] as Layer[]) {
      insertLearning(learning({ id: layer, layer, referencesCount: 50 }));
    }
    expect(promoteEligibleLearnings()).toBe(0);
    for (const layer of ["loam", "bedrock", "fossil"] as Layer[]) {
      expect(findLearning(layer)?.layer).toBe(layer);
    }
  });

  it("respects custom thresholds", () => {
    insertLearning(learning({ id: "x", referencesCount: 1, createdAt: Date.now() - 2 * DAY }));
    expect(promoteEligibleLearnings({ minReferences: 1, minAgeDays: 1 })).toBe(1);
  });
});

describe("findLearningsForPriming", () => {
  it("ranks bedrock, then loam, then topsoil; confidence and recency within a layer", () => {
    insertLearning(learning({ id: "top-hi", layer: "topsoil", confidence: 0.9 }));
    insertLearning(learning({ id: "loam-lo", layer: "loam", confidence: 0.2 }));
    insertLearning(learning({ id: "bed", layer: "bedrock", confidence: 0.1 }));
    insertLearning(learning({ id: "loam-hi-old", layer: "loam", confidence: 0.8, lastReferencedAt: Date.now() - 10 * DAY }));
    insertLearning(learning({ id: "loam-hi-new", layer: "loam", confidence: 0.8, lastReferencedAt: Date.now() }));
    const ids = findLearningsForPriming(REPO).map((l) => l.id);
    expect(ids).toEqual(["bed", "loam-hi-new", "loam-hi-old", "loam-lo", "top-hi"]);
  });

  it("excludes fossils and other repos", () => {
    insertLearning(learning({ id: "keep" }));
    insertLearning(learning({ id: "fossil", layer: "fossil" }));
    insertLearning(learning({ id: "elsewhere", repoPath: "/tmp/repo-b" }));
    expect(findLearningsForPriming(REPO).map((l) => l.id)).toEqual(["keep"]);
  });

  it("caps by count", () => {
    for (let i = 0; i < 25; i++) insertLearning(learning());
    expect(findLearningsForPriming(REPO)).toHaveLength(20);
    expect(findLearningsForPriming(REPO, { maxCount: 5 })).toHaveLength(5);
  });

  it("caps by bytes and stops at the first learning that does not fit", () => {
    insertLearning(learning({ id: "a", layer: "bedrock", content: "x".repeat(100) }));
    insertLearning(learning({ id: "b", layer: "loam", content: "y".repeat(100) }));
    insertLearning(learning({ id: "c", layer: "topsoil", content: "z" }));
    // each row costs content + topic + 16 bytes; 250 fits a and b, not c after them? c is tiny,
    // but the loop breaks rather than skips, so a budget that ends between b and c drops c too.
    const picked = findLearningsForPriming(REPO, { maxBytes: 250 }).map((l) => l.id);
    expect(picked).toEqual(["a", "b"]);
    expect(findLearningsForPriming(REPO, { maxBytes: 130 }).map((l) => l.id)).toEqual(["a"]);
  });
});

describe("recordPrimings", () => {
  it("records provenance in order and bumps references; this is the only promotion signal", () => {
    addRun("r1");
    const a = learning({ id: "a" });
    const b = learning({ id: "b" });
    insertLearning(a);
    insertLearning(b);
    recordPrimings("r1", [b, a]);
    expect(learningsForRun("r1").map((l) => l.id)).toEqual(["b", "a"]);
    expect(findLearning("a")?.referencesCount).toBe(1);
    expect(findLearning("a")?.lastReferencedAt).toBeTypeOf("number");
    // priming the same run twice with the same learning is idempotent for provenance
    recordPrimings("r1", [a]);
    expect(learningsForRun("r1")).toHaveLength(2);
  });

  it("does nothing for an empty list", () => {
    addRun("r1");
    expect(() => recordPrimings("r1", [])).not.toThrow();
    expect(learningsForRun("r1")).toEqual([]);
  });
});

describe("digByTopic", () => {
  it("matches topic or content, excludes fossils, and is read-only", () => {
    insertLearning(learning({ id: "t", topic: "ports", content: "web is 3737" }));
    insertLearning(learning({ id: "c", topic: "misc", content: "the daemon port is 3738" }));
    insertLearning(learning({ id: "f", topic: "ports", layer: "fossil" }));
    insertLearning(learning({ id: "n", topic: "fonts", content: "geist" }));
    const ids = digByTopic("port").map((l) => l.id).sort();
    expect(ids).toEqual(["c", "t"]);
    expect(findLearning("t")?.referencesCount).toBe(0);
    expect(digByTopic("port", "/tmp/repo-b")).toEqual([]);
  });
});

describe("composePrimingPreamble", () => {
  it("returns an empty string with nothing to prime", () => {
    expect(composePrimingPreamble([])).toBe("");
  });

  it("groups by layer in trust order and collapses whitespace", () => {
    const text = composePrimingPreamble([
      learning({ id: "1", layer: "topsoil", topic: "t", content: "fresh   fact" }),
      learning({ id: "2", layer: "bedrock", topic: "b", content: "hard\nfact" }),
    ]);
    expect(text.indexOf("### bedrock")).toBeGreaterThan(-1);
    expect(text.indexOf("### bedrock")).toBeLessThan(text.indexOf("### topsoil"));
    expect(text).toContain("- **b**: hard fact");
    expect(text).toContain("- **t**: fresh fact");
    expect(text.trimEnd().endsWith("## Your task")).toBe(true);
  });
});
