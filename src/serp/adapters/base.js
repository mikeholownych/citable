/**
 * Base SERP Provider Adapter (B-051).
 * Enforces that no vendor schema is canonical; all external providers
 * normalize into the canonical SerpObservation schema.
 */
export class BaseSerpAdapter {
  constructor(providerName, adapterVersion = "1.0.0") {
    if (new.target === BaseSerpAdapter) {
      throw new TypeError("BaseSerpAdapter is abstract and cannot be instantiated directly");
    }
    this.providerName = providerName;
    this.adapterVersion = adapterVersion;
  }

  /**
   * Validates raw vendor payload.
   * @abstract
   */
  validate(rawPayload) {
    throw new Error("validate() must be implemented by subclass");
  }

  /**
   * Normalizes raw vendor payload into canonical SerpObservation envelope.
   * @abstract
   */
  normalize(rawPayload, contextOptions = {}) {
    throw new Error("normalize() must be implemented by subclass");
  }
}
