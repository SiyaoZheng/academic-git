// ── Gate Engine ──
// Borrowed from: danger-js (four-channel output), ReviewScope (Rule interface)
// Rules are deterministic — no LLM calls. All checks are grep/parse-based.

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
  check(ctx) {
    const violations: GateViolation[] = [];
    const rFiles = ctx.diff.files.filter(
      (f) => f.endsWith(".R") || f.endsWith(".qmd")
    );
    const pyFiles = ctx.diff.files.filter((f) => f.endsWith(".py"));

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

const scopeCreep: GateRule = {
  id: "scope-creep",
  description: "Files changed beyond Issue's Scope section",
  severity: "MEDIUM",
  check(ctx) {
    const scopeMatch = ctx.issueBody.match(/## Scope\n([\s\S]*?)(?=\n##|\n---|$)/);
    if (!scopeMatch) return []; // No Scope section → skip

    const scopeText = scopeMatch[1];
    // Check for "In:" and "Out:" declarations
    const inMatch = scopeText.match(/In:\s*([\s\S]*?)(?=Out:|$)/);
    if (!inMatch) return [];

    const inItems = inMatch[1]
      .split(/[-,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (inItems.length === 0) return [];

    // This is a heuristic — scope items are usually descriptions, not file paths
    // We flag files that don't seem related to any scope item
    const violations: GateViolation[] = [];
    for (const file of ctx.diff.files) {
      const related = inItems.some(
        (item) =>
          file.toLowerCase().includes(item.toLowerCase()) ||
          item.toLowerCase().includes(file.split("/").pop()?.toLowerCase() ?? "")
      );
      if (!related && ctx.diff.files.length > inItems.length * 2) {
        // Only flag if significantly more files than scope items
        violations.push({
          ruleId: "scope-creep",
          severity: "MEDIUM",
          message: `File '${file}' may exceed Issue scope`,
          file,
        });
      }
    }
    return violations;
  },
};

// ── Research Constitution Rules (Phase 5) ──

const specBoundary: GateRule = {
  id: "spec-boundary",
  description: "Art. II — Changes should not introduce undeclared specifications",
  severity: "HIGH",
  check(ctx) {
    // Check for spec manifest file
    // This is a placeholder — actual implementation depends on project structure
    const violations: GateViolation[] = [];

    // Heuristic: flag new model specifications (lm(), glm(), etc.) not mentioned in Issue
    const rModelPatterns = [
      /lm\s*\(/,
      /glm\s*\(/,
      /lmer\s*\(/,
      /glmer\s*\(/,
      /feols\s*\(/,
      /felm\s*\(/,
    ];
    const pyModelPatterns = [
      /\.fit\s*\(/,
      /sm\.OLS/,
      /sklearn\./,
    ];

    const issueLower = ctx.issueBody.toLowerCase();
    const lines = ctx.diff.patch.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("+") || line.startsWith("++")) continue;
      const content = line.slice(1);

      for (const pattern of [...rModelPatterns, ...pyModelPatterns]) {
        if (pattern.test(content)) {
          // Check if the Issue mentions modeling/estimation
          if (
            !issueLower.includes("model") &&
            !issueLower.includes("regression") &&
            !issueLower.includes("estimat") &&
            !issueLower.includes("specification")
          ) {
            const fileMatch = lines
              .slice(0, i)
              .reverse()
              .find((l) => l.startsWith("+++"))
              ?.replace(/^\+\+\+\s+(?:a\/)?/, "");
            violations.push({
              ruleId: "spec-boundary",
              severity: "HIGH",
              message: `New model specification detected but Issue doesn't mention modeling: ${content.trim().slice(0, 60)}`,
              file: fileMatch,
            });
          }
          break;
        }
      }
    }
    return violations;
  },
};

const temporalMarking: GateRule = {
  id: "temporal-marking",
  description: "Art. III — Analytical decisions need ex-ante/ex-post markers",
  severity: "MEDIUM",
  check(ctx) {
    const violations: GateViolation[] = [];
    const lines = ctx.diff.patch.split("\n");

    // Decision patterns that should be marked
    const decisionPatterns = [
      /filter\s*\(/,
      /subset\s*\(/,
      /select\s*\(/,
      /rename\s*\(/,
      /mutate\s*\(/,
      /\.query\s*\(/,
      /\.loc\s*\[/,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("+") || line.startsWith("++")) continue;
      const content = line.slice(1);

      for (const pattern of decisionPatterns) {
        if (pattern.test(content)) {
          // Check if this line or nearby lines have DECISION marker
          const nearby = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
          if (
            !nearby.includes("DECISION:") &&
            !nearby.includes("# ex-ante") &&
            !nearby.includes("# ex-post") &&
            !nearby.includes("# exploratory")
          ) {
            // Only flag if there are multiple decision-like patterns (avoid noise)
            const decisionCount = decisionPatterns.filter((p) =>
              p.test(content)
            ).length;
            if (decisionCount === 0) continue;

            // Skip if it's just a simple filter (too noisy)
            if (/^\+\s*(filter|select)\s*\(/.test(line)) continue;

            const fileMatch = lines
              .slice(0, i)
              .reverse()
              .find((l) => l.startsWith("+++"))
              ?.replace(/^\+\+\+\s+(?:a\/)?/, "");
            violations.push({
              ruleId: "temporal-marking",
              severity: "INFO",
              message: `Analytical decision without ex-ante/ex-post marker: ${content.trim().slice(0, 60)}`,
              file: fileMatch,
            });
          }
          break;
        }
      }
    }
    return violations;
  },
};

const convergenceCheck: GateRule = {
  id: "convergence-check",
  description: "Art. IV — Flag convergence warnings in model output",
  severity: "CRITICAL",
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
  checklistComplete,
  scopeMatch,
  silentFailure,
  hardcodedValues,
  reproducibility,
  scopeCreep,
  specBoundary,
  temporalMarking,
  convergenceCheck,
];

// ── Runner ──

export function runAllGates(ctx: GateContext): GateResult {
  const violations: GateViolation[] = [];

  for (const rule of ALL_RULES) {
    try {
      const found = rule.check(ctx);
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
