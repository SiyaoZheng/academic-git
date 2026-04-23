export function ghIssueCreateArgs(
  title: string,
  body: string,
  opts?: { labels?: string[]; assignees?: string[]; milestone?: string }
): string[] {
  const args = ["issue", "create", "--title", title, "--body", body];
  for (const label of opts?.labels ?? []) {
    args.push("--label", label);
  }
  const assignees = opts?.assignees === undefined ? ["me"] : opts.assignees;
  for (const assignee of assignees) {
    args.push("--assignee", assignee);
  }
  if (opts?.milestone) {
    args.push("--milestone", opts.milestone);
  }
  return args;
}

export function ghIssueCloseArgs(
  issue: number,
  opts?: { comment?: string; reason?: "completed" | "not planned" | "duplicate"; duplicateOf?: number }
): string[] {
  const args = ["issue", "close", String(issue)];
  if (opts?.comment) {
    args.push("--comment", opts.comment);
  }
  if (opts?.reason) {
    args.push("--reason", opts.reason);
  }
  if (opts?.duplicateOf !== undefined) {
    args.push("--duplicate-of", String(opts.duplicateOf));
  }
  return args;
}

export function ghIssueCommentArgs(issue: number, body: string): string[] {
  return ["issue", "comment", String(issue), "--body", body];
}

export function ghIssueEditBodyArgs(issue: number, body: string): string[] {
  return ["issue", "edit", String(issue), "--body", body];
}

export function ghPrCreateArgs(title: string, body: string): string[] {
  return ["pr", "create", "--title", title, "--body", body];
}

export function ghPrCloseArgs(
  pr: number,
  opts?: { comment?: string; deleteBranch?: boolean }
): string[] {
  const args = ["pr", "close", String(pr)];
  if (opts?.comment) {
    args.push("--comment", opts.comment);
  }
  if (opts?.deleteBranch) {
    args.push("--delete-branch");
  }
  return args;
}
