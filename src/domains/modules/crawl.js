import { defineDomainModule } from "../interface.js";
import detectors from "../../detectors/crawl.js";

export const crawlDomainModule = defineDomainModule({
  module_id: "crawl",
  namespace: "CRAWL",
  title: "Crawler Access & Discovery",
  description: "Robots.txt, sitemaps, crawling directives, and probe verification.",
  conditions: detectors.filter((d) => d.namespace === "CRAWL"),
  observation_kinds: ["crawler_log","crawler_probe","index"],
  collectors: {
    static_analysis: { method: "static_analysis" },
    synthetic_fetch: { method: "synthetic_fetch" },
  },
  report_projections: {
    summary: (determinations) => ({
      domain: "crawl",
      total: determinations.length,
      passed: determinations.filter((d) => d.status === "PASS").length,
      failed: determinations.filter((d) => d.status === "FAIL").length,
      warning: determinations.filter((d) => d.status === "WARNING").length,
      not_tested: determinations.filter((d) => d.status === "NOT_TESTED").length,
    }),
  },
  gating: {
    default_enabled: true,
  },
});

export default crawlDomainModule;
