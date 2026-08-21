// Pure maker-checker rules: no runtime dependencies so both Deno edge
// functions and the vitest contract tests can import this file directly.

export const MAKER_CHECKER_SETTING_KEY = "finance.maker_checker_enforced";
export const MAKER_CHECKER_ERROR = "maker_checker_self_approval_forbidden";

export interface MakerCheckerDecision {
  allowed: boolean;
  enforced: boolean;
  selfApproval: boolean;
  initiatorId: string | null;
  approverId: string;
  error?: string;
}

/** Decide whether an approver may execute an item they may have initiated. */
export function evaluateMakerChecker(input: {
  enforced: boolean;
  initiatorId: string | null | undefined;
  approverId: string;
}): MakerCheckerDecision {
  const initiatorId = input.initiatorId ?? null;
  const selfApproval = !!initiatorId && initiatorId === input.approverId;
  const allowed = !(input.enforced && selfApproval);
  return {
    allowed,
    enforced: input.enforced,
    selfApproval,
    initiatorId,
    approverId: input.approverId,
    ...(allowed ? {} : { error: MAKER_CHECKER_ERROR }),
  };
}
