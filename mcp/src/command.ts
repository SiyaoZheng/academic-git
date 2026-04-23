import { execFileSync } from "child_process";

export function shellArgs(values: string[]): string {
  return values.map((value) => JSON.stringify(value)).join(" ");
}

export function commandPreview(file: string, args: string[]): string {
  return shellArgs([file, ...args]);
}

export function runFile(file: string, args: string[], cwd?: string): string {
  return execFileSync(file, args, {
    cwd: cwd ?? process.cwd(),
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

export function runFileWithInput(file: string, args: string[], input: string, cwd?: string): string {
  return execFileSync(file, args, {
    cwd: cwd ?? process.cwd(),
    input,
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}
