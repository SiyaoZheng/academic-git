"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIssueNumber = parseIssueNumber;
exports.slugifyIssueTitle = slugifyIssueTitle;
exports.issueBranchName = issueBranchName;
exports.defaultIssueWorktreePath = defaultIssueWorktreePath;
exports.gitCreateBranchNoSwitchArgs = gitCreateBranchNoSwitchArgs;
exports.gitWorktreeAddArgs = gitWorktreeAddArgs;
const path_1 = require("path");
function parseIssueNumber(output) {
    const issueUrlMatch = output.match(/\/issues\/(\d+)(?:\b|$)/);
    const hashMatch = output.match(/#(\d+)\b/);
    const raw = issueUrlMatch?.[1] ?? hashMatch?.[1];
    if (!raw) {
        throw new Error(`Could not parse issue number from gh output: ${output}`);
    }
    return Number(raw);
}
function slugifyIssueTitle(title) {
    const base = title
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
    const truncated = base.length > 40 ? base.slice(0, 40).replace(/-[^-]*$/, "") : base;
    return truncated.replace(/-+$/g, "") || base.slice(0, 40).replace(/-+$/g, "") || "issue";
}
function issueBranchName(issue, titleOrSlug) {
    return `codex/issue-${issue}-${slugifyIssueTitle(titleOrSlug)}`;
}
function defaultIssueWorktreePath(repoDir, issue, titleOrSlug) {
    return (0, path_1.join)((0, path_1.dirname)(repoDir), `${(0, path_1.basename)(repoDir)}.issue-${issue}-${slugifyIssueTitle(titleOrSlug)}`);
}
function gitCreateBranchNoSwitchArgs(branch, startPoint) {
    return ["branch", branch, startPoint];
}
function gitWorktreeAddArgs(worktreePath, branch) {
    return ["worktree", "add", worktreePath, branch];
}
