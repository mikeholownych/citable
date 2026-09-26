import { techDomainModule } from "./tech.js";
import { crawlDomainModule } from "./crawl.js";
import { archDomainModule } from "./arch.js";
import { pageDomainModule } from "./page.js";
import { ansDomainModule } from "./ans.js";
import { entityDomainModule } from "./entity.js";
import { claimDomainModule } from "./claim.js";
import { evdDomainModule } from "./evd.js";
import { schemaDomainModule } from "./schema.js";
import { linkDomainModule } from "./link.js";
import { extDomainModule } from "./ext.js";
import { geoDomainModule } from "./geo.js";
import { recoDomainModule } from "./reco.js";
import { lifeDomainModule } from "./life.js";
import { measDomainModule } from "./meas.js";
import { hreflangDomainModule } from "./hreflang.js";
import { cwvDomainModule } from "./cwv.js";
import { agentDomainModule } from "./agent.js";
import { croDomainModule } from "./cro.js";

export { techDomainModule } from "./tech.js";
export { crawlDomainModule } from "./crawl.js";
export { archDomainModule } from "./arch.js";
export { pageDomainModule } from "./page.js";
export { ansDomainModule } from "./ans.js";
export { entityDomainModule } from "./entity.js";
export { claimDomainModule } from "./claim.js";
export { evdDomainModule } from "./evd.js";
export { schemaDomainModule } from "./schema.js";
export { linkDomainModule } from "./link.js";
export { extDomainModule } from "./ext.js";
export { geoDomainModule } from "./geo.js";
export { recoDomainModule } from "./reco.js";
export { lifeDomainModule } from "./life.js";
export { measDomainModule } from "./meas.js";
export { hreflangDomainModule } from "./hreflang.js";
export { cwvDomainModule } from "./cwv.js";
export { agentDomainModule } from "./agent.js";
export { croDomainModule } from "./cro.js";

export const ALL_DOMAIN_MODULES = [
  techDomainModule,
  crawlDomainModule,
  archDomainModule,
  pageDomainModule,
  ansDomainModule,
  entityDomainModule,
  claimDomainModule,
  evdDomainModule,
  schemaDomainModule,
  linkDomainModule,
  extDomainModule,
  geoDomainModule,
  recoDomainModule,
  lifeDomainModule,
  measDomainModule,
  hreflangDomainModule,
  cwvDomainModule,
  agentDomainModule,
  croDomainModule,
];

export function registerAllDomainModules(registry) {
  for (const mod of ALL_DOMAIN_MODULES) {
    registry.register(mod);
  }
  return registry;
}
