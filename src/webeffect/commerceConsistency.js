import { sha256 } from "../shared/io.js";

/**
 * Validates consistency of commerce facts across representations (B-074).
 * Compares visible page, structured data, API response, cart, and checkout.
 *
 * Invariant: Contradictions between representations produce HIGH severity findings.
 */
export function validateCommerceConsistency(commerceData = {}, options = {}) {
  const productId = commerceData.product_id || options.product_id || "prod_default";
  const nowIso = new Date().toISOString();

  const reps = commerceData.representations || commerceData;
  const visible = reps.visible_page;
  const schema = reps.structured_data;
  const api = reps.api_response || null;
  const cart = reps.cart || null;
  const checkout = reps.checkout || null;

  if (!visible || !schema) {
    throw new Error("Commerce consistency validation requires at least visible_page and structured_data representations");
  }

  const contradictions = [];

  const comparePair = (repAName, repA, repBName, repB) => {
    if (!repA || !repB) return;

    // 1. Price comparison (tolerance of 0.001)
    if (typeof repA.price === "number" && typeof repB.price === "number") {
      if (Math.abs(repA.price - repB.price) > 0.001) {
        contradictions.push({
          dimension: "price",
          severity: "HIGH",
          representation_a: repAName,
          representation_b: repBName,
          value_a: repA.price,
          value_b: repB.price,
          summary: `Price mismatch: ${repAName} states ${repA.currency || ""}${repA.price} but ${repBName} states ${repB.currency || ""}${repB.price}`,
        });
      }
    }

    // 2. Currency comparison
    if (repA.currency && repB.currency && repA.currency.toUpperCase() !== repB.currency.toUpperCase()) {
      contradictions.push({
        dimension: "currency",
        severity: "CRITICAL",
        representation_a: repAName,
        representation_b: repBName,
        value_a: repA.currency,
        value_b: repB.currency,
        summary: `Currency contradiction: ${repAName} uses ${repA.currency} while ${repBName} uses ${repB.currency}`,
      });
    }

    // 3. Availability comparison
    if (repA.availability && repB.availability) {
      const normAvail = (a) => (/in[_-]?stock/i.test(a) ? "InStock" : (/out[_-]?of[_-]?stock/i.test(a) ? "OutOfStock" : a));
      const aNorm = normAvail(repA.availability);
      const bNorm = normAvail(repB.availability);
      if (aNorm !== bNorm && aNorm !== "Unknown" && bNorm !== "Unknown") {
        contradictions.push({
          dimension: "availability",
          severity: "HIGH",
          representation_a: repAName,
          representation_b: repBName,
          value_a: repA.availability,
          value_b: repB.availability,
          summary: `Availability contradiction: ${repAName} reports ${repA.availability} while ${repBName} reports ${repB.availability}`,
        });
      }
    }

    // 4. Variant / SKU comparison
    if (repA.variant && repB.variant && repA.variant !== repB.variant) {
      contradictions.push({
        dimension: "variant",
        severity: "HIGH",
        representation_a: repAName,
        representation_b: repBName,
        value_a: repA.variant,
        value_b: repB.variant,
        summary: `Variant contradiction: ${repAName} specifies variant "${repA.variant}" while ${repBName} specifies "${repB.variant}"`,
      });
    }
  };

  // Compare visible against structured data
  comparePair("visible_page", visible, "structured_data", schema);

  // Compare visible against API if present
  if (api) comparePair("visible_page", visible, "api_response", api);

  // Compare cart against visible if present
  if (cart) comparePair("cart", cart, "visible_page", visible);

  // Compare checkout against visible and cart if present
  if (checkout) {
    comparePair("checkout", checkout, "visible_page", visible);
    if (cart) comparePair("checkout", checkout, "cart", cart);
  }

  const isConsistent = contradictions.length === 0;
  const seed = `${productId}|${isConsistent}|${contradictions.length}|${nowIso}`;
  const evaluationId = `cmm_eval_${sha256(seed).slice(0, 16)}`;

  return {
    schema_version: 1,
    evaluation_id: evaluationId,
    product_id: productId,
    is_consistent: isConsistent,
    representations: {
      visible_page: visible,
      structured_data: schema,
      api_response: api,
      cart,
      checkout,
    },
    contradictions,
    evaluated_at: nowIso,
  };
}
