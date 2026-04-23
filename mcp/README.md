# Academic Git MCP Server

## Type-checking

Install the locked dependencies before running the TypeScript check:

```bash
npm ci
npm run typecheck
```

`npm run typecheck` is the package script for:

```bash
npx tsc --noEmit
```

The command checks the TypeScript sources listed by `tsconfig.json` without writing build artifacts. A successful run is silent apart from npm's script banner; TypeScript prints diagnostics only when it finds an error.

If dependencies have not been installed in this worktree, the check may report missing packages such as `@modelcontextprotocol/sdk` before it can type-check the server. Run `npm ci` in this directory and retry.
