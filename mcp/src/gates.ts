// ── Gate Engine ──
// Borrowed from: danger-js (four-channel output), ReviewScope (Rule interface)
// Rules are deterministic — no LLM calls. All checks are grep/parse-based.

export type GateMode = "commit" | "pr";

export interface GateViolation {
  ruleId: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  message: string;
  file?: string;
  line?: number;
}

export interface GateContext {
  issueBody: string;
  issueNumber: number;
  checklist: { letter: string; desc: string; done: boolean }[];
  diff: {
    files: string[];
    stat: string;
    patch: string;
  };
  commits: string[];
  branch: string;
}

export interface GateRule {
  id: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  /** Which contexts this rule runs in */
  modes: GateMode[];
  /** Severity override for a specific mode (overrides default severity) */
  severityOverride?: Partial<Record<GateMode, "CRITICAL" | "HIGH" | "MEDIUM" | "INFO">>;
  check(ctx: GateContext): GateViolation[];
}

export interface GateResult {
  passed: boolean;
  violations: GateViolation[];
  summary: string;
}

// ── Built-in Rules ──

const scopeMatch: GateRule = {
  id: "scope-match",
  description: "Files changed should relate to Issue's Affected Files section",
  severity: "MEDIUM",
  modes: ["commit", "pr"],
  check(ctx) {
    const affectedMatch = ctx.issueBody.match(/## Affected Files\n([\s\S]*?)(?=\n##|\n---|$)/);
    if (!affectedMatch) return []; // No Affected Files section → skip

    const declared = affectedMatch[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.replace(/^-\s*`?/, "").replace(/`?\s*$/, "").trim())
      .filter(Boolean);

    if (declared.length === 0) return [];

    const violations: GateViolation[] = [];
    for (const file of ctx.diff.files) {
      const isDeclared = declared.some(
        (d) => file === d || file.startsWith(d.replace(/\/$/, ""))
      );
      if (!isDeclared) {
        violations.push({
          ruleId: "scope-match",
          severity: "MEDIUM",
          message: `File '${file}' not in Issue's Affected Files`,
          file,
        });
      }
    }
    return violations;
  },
};

const checklistComplete: GateRule = {
  id: "checklist-complete",
  description: "All non-strikethrough checklist items must be [x]",
  severity: "CRITICAL",
  modes: ["pr"], // Only checked at PR time — commits can be partial progress
  check(ctx) {
    const incomplete = ctx.checklist.filter(
      (item) => !item.done && !item.desc.includes("~~")
    );
    return incomplete.map((item) => ({
      ruleId: "checklist-complete",
      severity: "CRITICAL" as const,
      message: `Item ${item.letter}. '${item.desc}' is not checked off`,
    }));
  },
};

const silentFailure: GateRule = {
  id: "silent-failure",
  description: "Detect tryCatch/try-except that silently swallow errors",
  severity: "HIGH",
  modes: ["commit", "pr"],
  severityOverride: { commit: "HIGH", pr: "CRITICAL" },
  check(ctx) {
    const violations: GateViolation[] = [];
    const patterns = [
      // R: tryCatch(..., error = function(e) NULL)
      /tryCatch\s*\([^)]*error\s*=\s*function\s*\(\s*e\s*\)\s*NULL/,
      // R: try(..., silent = TRUE) where result is not checked
      /try\s*\([^)]+silent\s*=\s*TRUE/,
      // Python: except: pass
      /except\s*:\s*pass/,
      // Python: except Exception as e: (with no raise or log in same block)
      /except\s+Exception\s+as\s+\w+\s*:\s*(?:pass|$)/m,
    ];

    const lines = ctx.diff.patch.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("+") || line.startsWith("++")) continue; // Skip non-additions and file headers
      const content = line.slice(1);
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          // Try to extract filename from earlier in patch
          const fileMatch = lines
            .slice(0, i)
            .reverse()
            .find((l) => l.startsWith("+++"))
            ?.replace(/^\+\+\+\s+(?:a\/)?/, "");
          violations.push({
            ruleId: "silent-failure",
            severity: "HIGH",
            message: `Silent error swallowing detected: ${content.trim().slice(0, 80)}`,
            file: fileMatch,
          });
          break; // One violation per line
        }
      }
    }
    return violations;
  },
};

const hardcodedValues: GateRule = {
  id: "hardcoded-values",
  description: "Detect hardcoded seeds, paths, and API keys",
  severity: "HIGH",
  modes: ["commit", "pr"],
  severityOverride: { commit: "HIGH", pr: "CRITICAL" },
  check(ctx) {
    const violations: GateViolation[] = [];
    const patterns = [
      { re: /set\.seed\s*\(\s*\d+\)/, msg: "Hardcoded random seed" },
      { re: /\/Users\/\w+\//, msg: "Hardcoded absolute path" },
      { re: /C:\\Users\\/, msg: "Hardcoded Windows path" },
      { re: /['"](sk-[a-zA-Z0-9]{20,})['"]/, msg: "Possible API key" },
      { re: /['"](ghp_[a-zA-Z0-9]{36})['"]/, msg: "GitHub token" },
      { re: /['"](AKIA[A-Z0-9]{16})['"]/, msg: "AWS access key" },
    ];

    const lines = ctx.diff.patch.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("+") || line.startsWith("++")) continue;
      const content = line.slice(1);
      for (const { re, msg } of patterns) {
        if (re.test(content)) {
          const fileMatch = lines
            .slice(0, i)
            .reverse()
            .find((l) => l.startsWith("+++"))
            ?.replace(/^\+\+\+\s+(?:a\/)?/, "");
          violations.push({
            ruleId: "hardcoded-values",
            severity: "HIGH",
            message: `${msg}: ${content.trim().slice(0, 60)}`,
            file: fileMatch,
          });
          break;
        }
      }
    }
    return violations;
  },
};

const reproducibility: GateRule = {
  id: "reproducibility",
  description: "Randomness should be preceded by set.seed() in analysis code",
  severity: "MEDIUM",
  modes: ["commit", "pr"],
  severityOverride: { commit: "MEDIUM", pr: "HIGH" },
  check(ctx) {
    const violations: GateViolation[] = [];
    const rFiles = ctx.diff.files.filter(
      (f) => f.endsWith(".R") || f.endsWith(".qmd")
    );
    const pyFiles = ctx.diff.files.filter((f) =>
      f.endsWith(".py")
    );

    // Check R files for rnorm/runif/r sample without set.seed in same file
    for (const file of rFiles) {
      const filePatch = ctx.diff.patch;
      const hasRandom = /rnorm|runif|sample\s*\(|rbinom|rpois/i.test(filePatch);
      const hasSeed = /set\.seed\s*\(/i.test(filePatch);
      if (hasRandom && !hasSeed) {
        violations.push({
          ruleId: "reproducibility",
          severity: "MEDIUM",
          message: `File '${file}' uses random functions without set.seed()`,
          file,
        });
      }
    }

    // Check Python files for numpy.random / random without seed
    for (const file of pyFiles) {
      const filePatch = ctx.diff.patch;
      const hasRandom =
        /np\.random\.|random\.random|random\.randint|random\.choice/i.test(
          filePatch
        );
      const hasSeed =
        /np\.random\.seed|random\.seed|PYTHONHASHSEED/i.test(filePatch);
      if (hasRandom && !hasSeed) {
        violations.push({
          ruleId: "reproducibility",
          severity: "MEDIUM",
          message: `File '${file}' uses random functions without seed`,
          file,
        });
      }
    }

    return violations;
  },
};

const convergenceCheck: GateRule = {
  id: "convergence-check",
  description: "Art. IV — Flag convergence warnings in model output",
  severity: "CRITICAL",
  modes: ["pr"], // Only at PR time — partial commits may have incomplete output
  check(ctx) {
    const violations: GateViolation[] = [];
    // Check committed output files for convergence warnings
    const outputFiles = ctx.diff.files.filter(
      (f) =>
        f.endsWith(".log") ||
        f.endsWith(".out") ||
        f.endsWith(".txt") ||
        f.includes("output")
    );

    const warningPatterns = [
      /did not converge/i,
      /convergence warning/i,
      /singular fit/i,
      /boundary fit/i,
      /iteration limit/i,
      /maxiter/i,
      /Hessian.*not positive/i,
    ];

    for (const file of outputFiles) {
      for (const pattern of warningPatterns) {
        if (pattern.test(ctx.diff.patch)) {
          violations.push({
            ruleId: "convergence-check",
            severity: "CRITICAL",
            message: `Convergence warning detected in '${file}'. Model did not converge — must stop and report.`,
            file,
          });
          break;
        }
      }
    }

    return violations;
  },
};

// ── All Rules ──

const ALL_RULES: GateRule[] = [
  scopeMatch,
  checklistComplete,
  silentFailure,
  hardcodedValues,
  reproducibility,
  convergenceCheck,
];

// ── Runner ──

export function runAllGates(ctx: GateContext, mode: GateMode = "pr"): GateResult {
  const violations: GateViolation[] = [];

  for (const rule of ALL_RULES) {
    // Skip rules not applicable to this mode
    if (!rule.modes.includes(mode)) continue;

    try {
      const found = rule.check(ctx);
      // Apply severity override for this mode
      const override = rule.severityOverride?.[mode];
      if (override) {
        for (const v of found) {
          v.severity = override;
        }
      }
      violations.push(...found);
    } catch {
      // Rule execution failed — skip, don't crash
    }
  }

  const hasBlocking = violations.some(
    (v) => v.severity === "CRITICAL" || v.severity === "HIGH"
  );

  const critical = violations.filter((v) => v.severity === "CRITICAL").length;
  const high = violations.filter((v) => v.severity === "HIGH").length;
  const medium = violations.filter((v) => v.severity === "MEDIUM").length;
  const info = violations.filter((v) => v.severity === "INFO").length;

  const summary = `[academic-git] Gates ${hasBlocking ? "FAILED" : "passed"}: ${violations.length} violations (CRITICAL:${critical} HIGH:${high} MEDIUM:${medium} INFO:${info})`;

  return { passed: !hasBlocking, violations, summary };
}
