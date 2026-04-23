"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gitCreateBranchArgs = gitCreateBranchArgs;
exports.gitSwitchBranchArgs = gitSwitchBranchArgs;
function gitCreateBranchArgs(branch, startPoint = "HEAD") {
    return ["switch", "-c", branch, startPoint];
}
function gitSwitchBranchArgs(branch) {
    return ["switch", branch];
}
