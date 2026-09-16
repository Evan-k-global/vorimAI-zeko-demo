import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export type PocRecord = {
  recordedAt: string;
  pocId: string;
  decisionId: string;
  verdict: "allow" | "modify";
  originalPayloadDigest: string;
  effectivePayloadDigest: string;
  receiptCommitment: string;
  localAdapterTransaction: string;
};

export interface PocRecordStore {
  append(record: PocRecord): Promise<void>;
  list(limit?: number): Promise<PocRecord[]>;
}

export class JsonlPocRecordStore implements PocRecordStore {
  constructor(private readonly filePath: string) {}

  async append(record: PocRecord): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  async list(limit = 20): Promise<PocRecord[]> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      return contents
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as PocRecord)
        .slice(-limit)
        .reverse();
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}

export function createPocRecordStoreFromEnv(): PocRecordStore {
  const filePath = process.env.POC_RECORD_STORE_PATH ?? "./data/poc-public-records.jsonl";
  return new JsonlPocRecordStore(path.resolve(process.cwd(), filePath));
}
