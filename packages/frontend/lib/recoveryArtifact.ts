import { loadContractArtifact } from "@aztec/aztec.js/abi";
import * as RecoveryJson from "../artifacts/Recovery.json";

// Runtime validation for artifact structure
function validateArtifactStructure(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    Array.isArray(obj.functions) &&
    obj.functions.length > 0
  );
}

// The artifact format from the Aztec compiler may differ slightly from what
// loadContractArtifact expects. We validate at runtime before loading.
const artifactData = (RecoveryJson as { default?: unknown }).default ?? RecoveryJson;

if (!validateArtifactStructure(artifactData)) {
  throw new Error(
    "Invalid Recovery contract artifact: missing required fields (name, functions)"
  );
}

export const recoveryArtifact = loadContractArtifact(
  artifactData as Parameters<typeof loadContractArtifact>[0]
);
