"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shellArgs = shellArgs;
exports.commandPreview = commandPreview;
exports.runFile = runFile;
exports.runFileWithInput = runFileWithInput;
const child_process_1 = require("child_process");
function shellArgs(values) {
    return values.map((value) => JSON.stringify(value)).join(" ");
}
function commandPreview(file, args) {
    return shellArgs([file, ...args]);
}
function runFile(file, args, cwd) {
    return (0, child_process_1.execFileSync)(file, args, {
        cwd: cwd ?? process.cwd(),
        encoding: "utf-8",
        timeout: 30_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trim();
}
function runFileWithInput(file, args, input, cwd) {
    return (0, child_process_1.execFileSync)(file, args, {
        cwd: cwd ?? process.cwd(),
        input,
        encoding: "utf-8",
        timeout: 30_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trim();
}
