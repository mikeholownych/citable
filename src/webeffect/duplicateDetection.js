/**
 * Duplicate and Double-Fire Detection (B-071).
 * Distinguishes duplicate pageviews, duplicate purchases, SPA re-fires,
 * and tag-manager duplication from working implementations.
 */
export function detectEventDuplicates(emittedEvents = [], options = {}) {
  const debounceWindowMs = options.debounceWindowMs ?? 1000;
  const duplicates = [];

  // 1. Duplicate purchase check by transaction_id
  const purchaseTransactions = new Map();
  for (const em of emittedEvents) {
    if (em.event_name?.toLowerCase() === "purchase") {
      const txId = em.parameters?.transaction_id || em.transaction_id;
      if (txId) {
        const count = (purchaseTransactions.get(txId) || 0) + 1;
        purchaseTransactions.set(txId, count);
      }
    }
  }

  for (const [txId, count] of purchaseTransactions.entries()) {
    if (count > 1) {
      duplicates.push({
        event_name: "purchase",
        duplicate_type: "DUPLICATE_PURCHASE",
        count,
        transaction_id: txId,
        details: `Transaction ${txId} was reported ${count} times; duplicate purchases inflate revenue metrics`,
      });
    }
  }

  // 2. Double-fire check within debounce window
  for (let i = 0; i < emittedEvents.length; i++) {
    const e1 = emittedEvents[i];
    const t1 = e1.timestamp ? new Date(e1.timestamp).getTime() : i * 100;

    for (let j = i + 1; j < emittedEvents.length; j++) {
      const e2 = emittedEvents[j];
      const t2 = e2.timestamp ? new Date(e2.timestamp).getTime() : j * 100;

      if (e1.event_name === e2.event_name && Math.abs(t2 - t1) <= debounceWindowMs) {
        // Tag-manager concurrent dispatch check (different dispatchers)
        const d1 = e1.dispatcher || e1.source;
        const d2 = e2.dispatcher || e2.source;
        if (d1 && d2 && d1 !== d2) {
          if (!duplicates.some((d) => d.duplicate_type === "TAG_MANAGER_DUPLICATION" && d.event_name === e1.event_name)) {
            duplicates.push({
              event_name: e1.event_name,
              duplicate_type: "TAG_MANAGER_DUPLICATION",
              count: 2,
              transaction_id: null,
              details: `Event "${e1.event_name}" dispatched simultaneously by "${d1}" and "${d2}"`,
            });
          }
        } else {
          // Standard double fire
          if (!duplicates.some((d) => d.duplicate_type === "DOUBLE_FIRE" && d.event_name === e1.event_name)) {
            duplicates.push({
              event_name: e1.event_name,
              duplicate_type: "DOUBLE_FIRE",
              count: 2,
              transaction_id: null,
              details: `Event "${e1.event_name}" fired twice within ${Math.abs(t2 - t1)}ms debounce window`,
            });
          }
        }
      }
    }
  }

  // 3. SPA re-fire detection (virtual pageview fired on identical URL without navigation)
  const pageviews = emittedEvents.filter((e) => e.event_name === "page_view" || e.event_name === "virtual_page_view");
  for (let i = 0; i < pageviews.length - 1; i++) {
    const pv1 = pageviews[i];
    const pv2 = pageviews[i + 1];
    const u1 = pv1.parameters?.page_location || pv1.url;
    const u2 = pv2.parameters?.page_location || pv2.url;
    if (u1 && u2 && u1 === u2) {
      if (!duplicates.some((d) => d.duplicate_type === "SPA_REFIRE")) {
        duplicates.push({
          event_name: pv1.event_name,
          duplicate_type: "SPA_REFIRE",
          count: 2,
          transaction_id: null,
          details: `SPA virtual pageview re-fired on identical route "${u1}" without history state transition`,
        });
      }
    }
  }

  return duplicates;
}
