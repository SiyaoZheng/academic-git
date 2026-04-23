export interface MergePrDeps {
  cwd: string;
  defaultBranchName: string;
  runGit(args: string[], cwd?: string): string;
  runGh(args: string[], cwd?: string): string;
}

export interface CleanupStep {
  name: string;
  status: "ok" | "skipped" | "failed";
  detail: string;
}

export interface MergePrResult {
  pr: number;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  isCrossRepository: boolean;
  defaultBranchName: string;
  steps: CleanupStep[];
}

interface PrMetadata {
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  isCrossRepository: boolean;
}

interface WorktreeInfo {
  path: string;
  branch?: string;
}

function parseError(error: unknown): string {
  if (error && typeof error === "object") {
    const maybe = error as { stderr?: Buffer | string; message?: string };
    const stderr =
      typeof maybe.stderr === "string" ? maybe.stderr : maybe.stderr?.toString();
    if (stderr?.trim()) return stderr.trim();
    if (maybe.message?.trim()) return maybe.message.trim();
  }
  return String(error);
}

function readPrMetadata(pr: number, deps: MergePrDeps): PrMetadata {
  const raw = deps.runGh(
    ["pr", "view", String(pr), "--json", "headRefName,headRefOid,baseRefName,isCrossRepository"],
    deps.cwd
  );
  const metadata = JSON.parse(raw) as Partial<PrMetadata>;
  if (!metadata.headRefName) {
    throw new Error(`PR #${pr} did not report headRefName; refusing branch cleanup`);
  }
  if (!metadata.headRefOid) {
    throw new Error(`PR #${pr} did not report headRefOid; refusing branch cleanup`);
  }
  return {
    headRefName: metadata.headRefName,
    headRefOid: metadata.headRefOid,
    baseRefName: metadata.baseRefName ?? deps.defaultBranchName,
    isCrossRepository: metadata.isCrossRepository ?? false,
  };
}

export function parseWorktreeList(porcelain: string): WorktreeInfo[] {
  return porcelain
    .split(/\n\s*\n/)
    .map((block) => {
      const info: WorktreeInfo = { path: "" };
      for (const line of block.split("\n")) {
        if (line.startsWith("worktree ")) {
          info.path = line.slice("worktree ".length).trim();
        } else if (line.startsWith("branch refs/heads/")) {
          info.branch = line.slice("branch refs/heads/".length).trim();
        }
      }
      return info;
    })
    .filter((info) => info.path);
}

function worktrees(deps: MergePrDeps): WorktreeInfo[] {
  return parseWorktreeList(deps.runGit(["worktree", "list", "--porcelain"], deps.cwd));
}

function gitExitStatus(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const maybe = error as { status?: number; code?: number };
    if (typeof maybe.status === "number") return maybe.status;
    if (typeof maybe.code === "number") return maybe.code;
  }
  return undefined;
}

function parseRefOid(output: string, ref: string): string {
  const oid = output.trim().split(/\s+/)[0];
  if (!oid) {
    throw new Error(`git did not return an object id for ${ref}`);
  }
  return oid;
}

function localBranchOid(branch: string, deps: MergePrDeps, cwd: string): string | undefined {
  const ref = `refs/heads/${branch}`;
  try {
    return parseRefOid(deps.runGit(["show-ref", "--verify", ref], cwd), ref);
  } catch (error) {
    if (gitExitStatus(error) === 1) return undefined;
    throw error;
  }
}

function remoteBranchOid(branch: string, deps: MergePrDeps, cwd: string): string | undefined {
  const ref = `refs/heads/${branch}`;
  try {
    return parseRefOid(deps.runGit(["ls-remote", "--exit-code", "--heads", "origin", branch], cwd), ref);
  } catch (error) {
    if (gitExitStatus(error) === 2) return undefined;
    throw error;
  }
}

function isWorktreeDirty(path: string, deps: MergePrDeps): boolean {
  return deps.runGit(["status", "--porcelain"], path).trim().length > 0;
}

function pushStep(steps: CleanupStep[], name: string, detail: string): void {
  steps.push({ name, status: "ok", detail });
}

function pushSkipped(steps: CleanupStep[], name: string, detail: string): void {
  steps.push({ name, status: "skipped", detail });
}

function pushFailed(steps: CleanupStep[], name: string, error: unknown): void {
  steps.push({ name, status: "failed", detail: parseError(error) });
}

export function hasCleanupFailures(result: MergePrResult): boolean {
  return result.steps.some((step) => step.status === "failed");
}

export function mergePrWorktreeSafe(pr: number, deps: MergePrDeps): MergePrResult {
  const metadata = readPrMetadata(pr, deps);
  const steps: CleanupStep[] = [];
  let localWorktreeSafeForBranchCleanup = false;
  let localBranchSafeForRemoteCleanup = false;

  deps.runGh(["pr", "merge", String(pr), "--squash"], deps.cwd);
  pushStep(steps, "remote-merge", `PR #${pr} merged with --squash`);

  const allWorktrees = worktrees(deps);
  const primaryWorktree = allWorktrees[0]?.path ?? deps.cwd;
  const headWorktree = allWorktrees.find((worktree) => worktree.branch === metadata.headRefName);
  let primaryOnDefaultBranch = false;
  let primaryReadyForCleanup = false;

  try {
    deps.runGit(["switch", deps.defaultBranchName], primaryWorktree);
    primaryOnDefaultBranch = true;
    pushStep(steps, "primary-default-branch", `primary worktree is on ${deps.defaultBranchName}`);
  } catch (error) {
    pushFailed(steps, "primary-default-branch", error);
  }

  if (primaryOnDefaultBranch) {
    try {
      deps.runGit(["pull", "--ff-only"], primaryWorktree);
      primaryReadyForCleanup = true;
      pushStep(steps, "primary-fast-forward", `pulled ${deps.defaultBranchName} with --ff-only`);
    } catch (error) {
      pushFailed(steps, "primary-fast-forward", error);
    }
  } else {
    pushSkipped(
      steps,
      "primary-fast-forward",
      `primary worktree was not confirmed on ${deps.defaultBranchName}`
    );
  }

  if (!primaryReadyForCleanup) {
    pushSkipped(
      steps,
      "local-worktree-remove",
      `primary worktree was not confirmed up to date on ${deps.defaultBranchName}; local worktree removal skipped`
    );
  } else if (!headWorktree) {
    pushSkipped(
      steps,
      "local-worktree-remove",
      `no local worktree found for ${metadata.headRefName}`
    );
    localWorktreeSafeForBranchCleanup = true;
  } else if (headWorktree.path === primaryWorktree) {
    pushSkipped(
      steps,
      "local-worktree-remove",
      `${metadata.headRefName} was in the primary worktree; default-branch switch frees it`
    );
    localWorktreeSafeForBranchCleanup = primaryOnDefaultBranch;
  } else {
    try {
      if (isWorktreeDirty(headWorktree.path, deps)) {
        throw new Error(`${headWorktree.path} is dirty; leaving worktree in place`);
      }
      deps.runGit(["worktree", "remove", headWorktree.path], primaryWorktree);
      pushStep(steps, "local-worktree-remove", `removed ${headWorktree.path}`);
      localWorktreeSafeForBranchCleanup = true;
    } catch (error) {
      pushFailed(steps, "local-worktree-remove", error);
    }
  }

  if (!localWorktreeSafeForBranchCleanup) {
    pushSkipped(
      steps,
      "local-branch-delete",
      `${metadata.headRefName} is still owned by a local worktree; local branch deletion skipped`
    );
  } else {
    try {
      const localOid = localBranchOid(metadata.headRefName, deps, primaryWorktree);
      if (localOid === undefined) {
        pushSkipped(
          steps,
          "local-branch-delete",
          `${metadata.headRefName} was already absent locally`
        );
        localBranchSafeForRemoteCleanup = true;
      } else if (localOid !== metadata.headRefOid) {
        pushFailed(
          steps,
          "local-branch-delete",
          new Error(
            `${metadata.headRefName} points to ${localOid}, not PR head ${metadata.headRefOid}; refusing to delete`
          )
        );
      } else {
        deps.runGit(["branch", "-D", metadata.headRefName], primaryWorktree);
        pushStep(steps, "local-branch-delete", `deleted ${metadata.headRefName}`);
        localBranchSafeForRemoteCleanup = true;
      }
    } catch (error) {
      pushFailed(steps, "local-branch-delete", error);
    }
  }

  if (!localWorktreeSafeForBranchCleanup) {
    pushSkipped(
      steps,
      "remote-branch-delete",
      `${metadata.headRefName} local worktree cleanup did not complete; origin branch deletion skipped`
    );
  } else if (!localBranchSafeForRemoteCleanup) {
    pushSkipped(
      steps,
      "remote-branch-delete",
      `${metadata.headRefName} local branch cleanup did not complete; origin branch deletion skipped`
    );
  } else if (metadata.isCrossRepository) {
    pushSkipped(
      steps,
      "remote-branch-delete",
      `PR head ${metadata.headRefName} is cross-repository; origin branch deletion skipped`
    );
  } else {
    try {
      const remoteOid = remoteBranchOid(metadata.headRefName, deps, primaryWorktree);
      if (remoteOid === undefined) {
        pushSkipped(
          steps,
          "remote-branch-delete",
          `origin/${metadata.headRefName} was already absent`
        );
      } else if (remoteOid !== metadata.headRefOid) {
        pushFailed(
          steps,
          "remote-branch-delete",
          new Error(
            `origin/${metadata.headRefName} points to ${remoteOid}, not PR head ${metadata.headRefOid}; refusing to delete`
          )
        );
      } else {
        deps.runGit(["push", "origin", "--delete", metadata.headRefName], primaryWorktree);
        pushStep(steps, "remote-branch-delete", `deleted origin/${metadata.headRefName}`);
      }
    } catch (error) {
      pushFailed(steps, "remote-branch-delete", error);
    }
  }

  return {
    pr,
    headRefName: metadata.headRefName,
    headRefOid: metadata.headRefOid,
    baseRefName: metadata.baseRefName,
    isCrossRepository: metadata.isCrossRepository,
    defaultBranchName: deps.defaultBranchName,
    steps,
  };
}

export function formatMergePrResult(result: MergePrResult): string {
  const failed = result.steps.filter((step) => step.status === "failed");
  const lines = [
    failed.length > 0
      ? `PR #${result.pr} merged on GitHub, but post-merge cleanup has ${failed.length} failed step(s).`
      : `PR #${result.pr} merged on GitHub and post-merge cleanup completed.`,
    `Head branch: ${result.headRefName}`,
    `Head OID: ${result.headRefOid}`,
    `Base branch: ${result.baseRefName}`,
    "",
    "Post-merge cleanup:",
  ];

  for (const step of result.steps) {
    lines.push(`- [${step.status}] ${step.name}: ${step.detail}`);
  }

  return lines.join("\n");
}
