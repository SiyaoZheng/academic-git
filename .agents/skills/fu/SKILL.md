```markdown
# Fu Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development conventions and workflows used in the Fu JavaScript codebase. It covers file naming, import/export styles, commit message patterns, and testing practices. By following these guidelines, contributors can write consistent, maintainable code and collaborate effectively.

## Coding Conventions

### File Naming
- Use **camelCase** for all file names.
  - Example: `userProfile.js`, `dataFetcher.js`

### Imports
- Use **relative import paths**.
  - Example:
    ```javascript
    import { fetchData } from './dataFetcher';
    ```

### Exports
- Use **named exports**.
  - Example:
    ```javascript
    // In dataFetcher.js
    export function fetchData() { ... }
    ```

### Commit Messages
- Follow **conventional commit** style.
- Use the `chore` prefix for commit messages.
  - Example:
    ```
    chore: update dependencies to latest versions
    ```
- Average commit message length: ~46 characters.

## Workflows

### Code Contribution
**Trigger:** When adding or updating code  
**Command:** `/contribute-code`

1. Create or update files using camelCase naming.
2. Use relative imports and named exports in all modules.
3. Write or update tests in files matching `*.test.*`.
4. Commit changes using the conventional commit format with the `chore` prefix.
5. Push changes and open a pull request.

### Testing
**Trigger:** Before submitting code or merging changes  
**Command:** `/run-tests`

1. Locate or create test files with the `*.test.*` pattern.
2. Run the test suite using the project's test runner (framework unknown; refer to project documentation or package scripts).
3. Ensure all tests pass before merging or submitting code.

## Testing Patterns

- Test files follow the `*.test.*` naming convention.
  - Example: `userProfile.test.js`
- Testing framework is not specified; check the repository for test runner configuration or scripts.
- Place tests alongside the modules they cover or in a dedicated test directory.

## Commands
| Command         | Purpose                                   |
|-----------------|-------------------------------------------|
| /contribute-code| Step-by-step guide for contributing code  |
| /run-tests      | Instructions for running the test suite   |
```
