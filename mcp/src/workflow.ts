export const CHECKLIST_ITEM_PATTERN = /^[A-Z]$/;

export function normalizeChecklistItems(items?: string[], legacyItem?: string): string[] {
  const merged = [...(items ?? []), ...(legacyItem ? [legacyItem] : [])]
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (merged.length === 0) {
    throw new Error("At least one checklist item is required");
  }

  const deduped = Array.from(new Set(merged)).sort();
  for (const item of deduped) {
    if (!CHECKLIST_ITEM_PATTERN.test(item)) {
      throw new Error(`Invalid checklist item: ${item}`);
    }
  }
  return deduped;
}

export function formatChecklistItemToken(items: string[]): string {
  return normalizeChecklistItems(items).join("+");
}

export function formatCommitMessage(
  type: string,
  issue: number,
  items: string[],
  description: string
): string {
  return `${type}(#${issue}/${formatChecklistItemToken(items)}): ${description}`;
}

export function parseChecklistItemsFromCommitMessage(
  message: string
): { issue: number | null; items: string[] } {
  const match = message.match(/\(#(\d+)\/([A-Z](?:\+[A-Z])*)\)/);
  if (!match) {
    return { issue: null, items: [] };
  }

  const issue = Number(match[1]);
  const items = normalizeChecklistItems(match[2].split("+"));
  return { issue: Number.isFinite(issue) ? issue : null, items };
}
