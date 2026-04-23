"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHECKLIST_ITEM_PATTERN = void 0;
exports.normalizeChecklistItems = normalizeChecklistItems;
exports.formatChecklistItemToken = formatChecklistItemToken;
exports.formatCommitMessage = formatCommitMessage;
exports.parseChecklistItemsFromCommitMessage = parseChecklistItemsFromCommitMessage;
exports.CHECKLIST_ITEM_PATTERN = /^[A-Z]$/;
function normalizeChecklistItems(items, legacyItem) {
    const merged = [...(items ?? []), ...(legacyItem ? [legacyItem] : [])]
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
    if (merged.length === 0) {
        throw new Error("At least one checklist item is required");
    }
    const deduped = Array.from(new Set(merged)).sort();
    for (const item of deduped) {
        if (!exports.CHECKLIST_ITEM_PATTERN.test(item)) {
            throw new Error(`Invalid checklist item: ${item}`);
        }
    }
    return deduped;
}
function formatChecklistItemToken(items) {
    return normalizeChecklistItems(items).join("+");
}
function formatCommitMessage(type, issue, items, description) {
    return `${type}(#${issue}/${formatChecklistItemToken(items)}): ${description}`;
}
function parseChecklistItemsFromCommitMessage(message) {
    const match = message.match(/\(#(\d+)\/([A-Z](?:\+[A-Z])*)\)/);
    if (!match) {
        return { issue: null, items: [] };
    }
    const issue = Number(match[1]);
    const items = normalizeChecklistItems(match[2].split("+"));
    return { issue: Number.isFinite(issue) ? issue : null, items };
}
