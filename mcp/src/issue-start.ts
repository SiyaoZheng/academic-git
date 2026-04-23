import { basename, dirname, join } from "path";

export function parseIssueNumber(output: string): number {
  const issueUrlMatch = output.match(/\/issues\/(\d+)(?:\b|$)/);
  const hashMatch = output.match(/#(\d+)\b/);
  const raw = issueUrlMatch?.[1] ?? hashMatch?.[1];
  if (!raw) {
    throw new Error(`Could not parse issue number from gh output: ${output}`);
  }
  return Number(raw);
}

export function slugifyIssueTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const truncated = base.length > 40 ? base.slice(0, 40).replace(/-[^-]*$/, "") : base;
  return truncated.replace(/-+$/g, "") || base.slice(0, 40).replace(/-+$/g, "") || "issue";
}

export function issueBranchName(issue: number, titleOrSlug: string): string {
  return `codex/issue-${issue}-${slugifyIssueTitle(titleOrSlug)}`;
}

export function defaultIssueWorktreePath(repoDir: string, issue: number, titleOrSlug: string): string {
  return join(dirname(repoDir), `${basename(repoDir)}.issue-${issue}-${slugifyIssueTitle(titleOrSlug)}`);
}

export function gitCreateBranchNoSwitchArgs(branch: string, startPoint: string): string[] {
  return ["branch", branch, startPoint];
}

export function gitWorktreeAddArgs(worktreePath: string, branch: string): string[] {
  return ["worktree", "add", worktreePath, branch];
}
