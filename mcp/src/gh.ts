export function ghIssueCreateArgs(title: string, body: string): string[] {
  return ["issue", "create", "--title", title, "--body", body];
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
