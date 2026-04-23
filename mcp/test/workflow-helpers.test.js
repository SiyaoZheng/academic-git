const assert = require("node:assert/strict");
const test = require("node:test");

const {
  normalizeChecklistItems,
  formatChecklistItemToken,
  formatCommitMessage,
  parseChecklistItemsFromCommitMessage,
} = require("../src/workflow.js");

test("normalizeChecklistItems deduplicates and sorts multi-item selections", () => {
  assert.deepEqual(normalizeChecklistItems(["c", "A", "C", "b"]), ["A", "B", "C"]);
});

test("formatCommitMessage emits multi-item academic-git header", () => {
  assert.equal(
    formatCommitMessage("feat", 6, ["C", "A"], "route auto commit through handle-commit"),
    "feat(#6/A+C): route auto commit through handle-commit"
  );
  assert.equal(formatChecklistItemToken(["B", "A"]), "A+B");
});

test("parseChecklistItemsFromCommitMessage expands all tagged checklist items", () => {
  assert.deepEqual(
    parseChecklistItemsFromCommitMessage("abc1234 feat(#6/A+C): route auto commit").items,
    ["A", "C"]
  );
  assert.equal(parseChecklistItemsFromCommitMessage("abc1234 feat(#6/A+C): route auto commit").issue, 6);
  assert.deepEqual(parseChecklistItemsFromCommitMessage("docs: not an issue commit"), {
    issue: null,
    items: [],
  });
});
