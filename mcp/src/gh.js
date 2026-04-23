"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ghIssueCreateArgs = ghIssueCreateArgs;
exports.ghIssueCloseArgs = ghIssueCloseArgs;
exports.ghIssueCommentArgs = ghIssueCommentArgs;
exports.ghIssueEditBodyArgs = ghIssueEditBodyArgs;
exports.ghPrCreateArgs = ghPrCreateArgs;
exports.ghPrCloseArgs = ghPrCloseArgs;
function ghIssueCreateArgs(title, body, opts) {
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
function ghIssueCloseArgs(issue, opts) {
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
function ghIssueCommentArgs(issue, body) {
    return ["issue", "comment", String(issue), "--body", body];
}
function ghIssueEditBodyArgs(issue, body) {
    return ["issue", "edit", String(issue), "--body", body];
}
function ghPrCreateArgs(title, body) {
    return ["pr", "create", "--title", title, "--body", body];
}
function ghPrCloseArgs(pr, opts) {
    const args = ["pr", "close", String(pr)];
    if (opts?.comment) {
        args.push("--comment", opts.comment);
    }
    if (opts?.deleteBranch) {
        args.push("--delete-branch");
    }
    return args;
}
