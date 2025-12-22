export interface SafeInfo {
  address: string;
  owners: string[];
  threshold: number;
  nonce: number;
  modules: string[];
  isRecoveryModuleInstalled: boolean;
}

export interface GuardianInfo {
  count: number;
  threshold: number;
  safeAddress: string;
}

export interface RecoveryVote {
  safeAddress: string;
  candidateAddress: string;
  voteCount: number;
  threshold: number;
  isFinished: boolean;
}

export type SetupStep = "connect" | "aztec" | "install" | "complete";

export interface SetupState {
  step: SetupStep;
  safeAddress: string | null;
  aztecConnected: boolean;
  guardiansAdded: number;
  threshold: number;
  moduleInstalled: boolean;
}
