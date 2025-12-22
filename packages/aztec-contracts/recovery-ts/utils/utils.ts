import { readFileSync } from "fs";

export function readJson<T = any>(p: string): T | undefined {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return undefined;
  }
}
