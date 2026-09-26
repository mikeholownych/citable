export {
  createOutreachOpportunity,
  updateOpportunityHypothesis,
  ALLOWED_OUTREACH_STRATEGIES,
} from "./opportunities.js";

export {
  qualifyDomainAndPage,
  isOpportunityFullyQualified,
} from "./qualification.js";

export {
  AssetInventory,
  evaluateLinkableAssets,
} from "./assetInventory.js";

export {
  resolvePublicContact,
} from "./contactResolution.js";

export {
  OutreachSuppressionRegistry,
} from "./suppression.js";

export {
  draftOutreachMessage,
  verifyDraftForFabrication,
} from "./drafting.js";

export {
  OutreachDeliverabilityMonitor,
} from "./sendingControls.js";

export {
  verifyAcquiredLink,
  updateLinkLifecycleObservation,
} from "./linkLifecycle.js";

export {
  calculateAcquisitionEconomics,
  aggregateStrategyPerformance,
} from "./economics.js";

export {
  outreachDomainModule,
} from "./domainModule.js";
