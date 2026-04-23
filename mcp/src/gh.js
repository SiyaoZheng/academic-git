"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ghIssueCreateArgs = ghIssueCreateArgs;
exports.ghIssueCommentArgs = ghIssueCommentArgs;
exports.ghIssueEditBodyArgs = ghIssueEditBodyArgs;
exports.ghPrCreateArgs = ghPrCreateArgs;
function ghIssueCreateArgs(title, body) {
    return ["issue", "create", "--title", title, "--body", body];
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
