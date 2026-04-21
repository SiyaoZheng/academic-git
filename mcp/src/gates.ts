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

const scopeCreep: GateRule = {
  id: "scope-creep",
  description: "Changes should not exceed the scope declared in the Issue",
  severity: "HIGH",
  modes: ["commit", "pr"],
  severityOverride: { commit: "MEDIUM", pr: "HIGH" },
  check(ctx) {
    const scopeMatch = ctx.issueBody.match(/## Scope\n([\s\S]*?)(?=\n##|\n---|$)/);
    if (!scopeMatch) return [];

    const scopeText = scopeMatch[1].toLowerCase();

    // If there's an "Out of scope" section, check diff files against it
    const outOfScopeMatch = scopeText.match(/out of scope[:\s]*([\s\S]*?)(?=\n\n|\n##|$)/i);
    if (!outOfScopeMatch) return [];

    const violations: GateViolation[] = [];
    const outOfScopeItems = outOfScopeMatch[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter(Boolean);

    for (const item of outOfScopeItems) {
      // Check if any diff file matches an out-of-scope item
      const matching = ctx.diff.files.filter(
        (f) => f.toLowerCase().includes(item.toLowerCase()) || item.toLowerCase().includes(f.toLowerCase())
      );
      if (matching.length > 0) {
        violations.push({
          ruleId: "scope-creep",
          severity: "HIGH",
          message: `File '${matching[0]}' appears to be out of scope: "${item}"`,
          file: matching[0],
        });
      }
    }

    return violations;
  },
};

const specBoundary: GateRule = {
  id: "spec-boundary",
  description: "Art. II — Specification space must be explicitly bounded; no unbounded expansion",
  severity: "MEDIUM",
  modes: ["commit", "pr"],
  severityOverride: { commit: "INFO", pr: "MEDIUM" },
  check(ctx) {
    const violations: GateViolation[] = [];

    // Check if the issue has a declared spec boundary
    const hasScope = /## Scope/.test(ctx.issueBody);
    const hasSpecBoundary = /specification|spec boundary|spec space|adhoc|exploratory/i.test(ctx.issueBody);

    if (!hasScope) {
      // No scope section at all — flag as spec boundary violation
      violations.push({
        ruleId: "spec-boundary",
        severity: "MEDIUM",
        message: "Issue has no ## Scope section — specification space is unbounded (Art. II)",
      });
      return violations;
    }

    // Check if refinement comments expand scope without marking as exploratory
    // This is a heuristic: if the diff has files not in Affected Files AND not in Scope,
    // it suggests specification expansion
    if (hasScope && !hasSpecBoundary) {
      const affectedMatch = ctx.issueBody.match(/## Affected Files\n([\s\S]*?)(?=\n##|\n---|$)/);
      const scopeMatch2 = ctx.issueBody.match(/## Scope\n([\s\S]*?)(?=\n##|\n---|$)/);

      if (affectedMatch && scopeMatch2) {
        const declared = affectedMatch[1]
          .split("\n")
          .filter((l) => l.trim().startsWith("-"))
          .map((l) => l.replace(/^-\s*`?/, "").replace(/`?\s*$/, "").trim())
          .filter(Boolean);

        const undeclared = ctx.diff.files.filter(
          (f) => !declared.some((d) => f === d || f.startsWith(d.replace(/\/$/, "")))
        );

        if (undeclared.length > 3) {
          violations.push({
            ruleId: "spec-boundary",
            severity: "MEDIUM",
            message: `${undeclared.length} files changed beyond declared Affected Files — possible unbounded spec expansion (Art. II)`,
          });
        }
      }
    }

    return violations;
  },
};

const temporalMarking: GateRule = {
  id: "temporal-marking",
  description: "Art. III — Ex post decisions must be explicitly marked in commit messages or issue comments",
  severity: "MEDIUM",
  modes: ["commit", "pr"],
  severityOverride: { commit: "INFO", pr: "MEDIUM" },
  check(ctx) {
    const violations: GateViolation[] = [];

    // Heuristic: commits that change analysis parameters (coefficients, thresholds,
    // model specs) without mentioning "ex post" or "post-hoc" may violate Art. III.
    const paramChangePatterns = [
      /set\.seed\s*\(\s*\d+\)/,
      /threshold\s*=\s*\d/,
      /cutoff\s*=\s*\d/,
      /alpha\s*=\s*0\.\d/,
      /lambda\s*=\s*\d/,
      /n_estimators\s*=\s*\d/,
      /max_depth\s*=\s*\d/,
    ];

    const hasParamChange = ctx.diff.patch.split("\n").some((line) => {
      if (!line.startsWith("+") || line.startsWith("++")) return false;
      return paramChangePatterns.some((p) => p.test(line));
    });

    if (!hasParamChange) return violations;

    // Check if any commit message mentions ex post / post-hoc / exploratory
    const hasTemporalMark = ctx.commits.some((c) =>
      /ex post|post-hoc|exploratory|retroactive/i.test(c)
    );

    // Check if issue comments mention refinement with ex post
    const hasRefinementMark = /ex post|post-hoc|exploratory|retroactive/i.test(ctx.issueBody);

    if (hasParamChange && !hasTemporalMark && !hasRefinementMark) {
      violations.push({
        ruleId: "temporal-marking",
        severity: "MEDIUM",
        message: "Parameter changes detected without ex post / post-hoc marking in commits or issue (Art. III)",
      });
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
  scopeCreep,
  specBoundary,
  temporalMarking,
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
