/**
 * Shared required-input checklist item builder used by substantiate, schemaCmd,
 * and actionPlan so the three no longer maintain independent literal-string lists.
 * Callers still serialize to array<string> via toStringArray — no consumer-facing
 * shape changes.
 */
export function checklistItem(id, label, note) {
  return { id, label, satisfied: false, note: note ?? null };
}

/** Render one item (or an already-plain string) down to its display label. */
export function toLabel(item) {
  return typeof item === 'string' ? item : item.label;
}

/** Serialize a list of items (or plain strings) to array<string>. */
export function toStringArray(items) {
  return items.map(toLabel);
}
