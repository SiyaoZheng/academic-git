export function gitCreateBranchArgs(branch: string, startPoint = "HEAD"): string[] {
  return ["switch", "-c", branch, startPoint];
}

export function gitSwitchBranchArgs(branch: string): string[] {
  return ["switch", branch];
}
