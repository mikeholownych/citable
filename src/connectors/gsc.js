import { providerRequest } from './http.js';
import { collectionResult, errorMessage, paginationBoundary } from './collectionResult.js';
import { collectSearchConsoleObservations } from '../discovery/searchConsole.js';

const BASE = 'https://www.googleapis.com/webmasters/v3';
const METRICS = {
  clicks: { unit: 'count', value_type: 'integer' },
  impressions: { unit: 'count', value_type: 'integer' },
  ctr: { unit: 'ratio', value_type: 'number' },
  position: { unit: 'position', value_type: 'number' },
};
const DIMENSIONS = new Set(['date', 'query', 'page', 'country', 'device', 'searchAppearance']);

export const gscConnector = {
  provider: 'gsc', defaultCredentialEnv: 'GSC_ACCESS_TOKEN', readOnlyScopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  describeMetrics() { return METRICS; },
  async discoverProperties(context) {
    const result = await providerRequest(`${BASE}/sites`, context);
    return (result.siteEntry || []).map((item) => ({ property_id: item.siteUrl, permission: item.permissionLevel }));
  },
  async validateConnection(connection, context) {
    const properties = await this.discoverProperties(context);
    return { valid: properties.some((item) => item.property_id === connection.property_id), properties };
  },
  async sync(connection, metrics, { startDate, endDate, ...context }) {
    const dimensions = [...new Set(metrics.flatMap((metric) => metric.dimensions).filter((item) => DIMENSIONS.has(item)))];
    if (!dimensions.includes('date')) dimensions.unshift('date');
    const rows = [];
    let startRow = 0;
    const items = [];
    const errors = [];
    const maxPages = paginationBoundary(context);
    let pagesRequested = 0;
    let pagesRetrieved = 0;
    let continuationState = null;
    let providerTotal = null;
    let connectorError = null;
    do {
      pagesRequested += 1;
      let result;
      try {
        result = await providerRequest(`${BASE}/sites/${encodeURIComponent(connection.property_id)}/searchAnalytics/query`, {
          ...context, method: 'POST', body: { startDate, endDate, dimensions, rowLimit: 25000, startRow, dataState: 'final' },
        });
      } catch (error) {
        connectorError ||= error;
        errors.push(`start row ${startRow}: ${errorMessage(error)}`);
        continuationState = { start_row: startRow };
        break;
      }
      pagesRetrieved += 1;
      const pageRows = result.rows || [];
      items.push(...pageRows);
      if (Number.isInteger(result.rowCount) && result.rowCount >= 0) providerTotal = result.rowCount;
      for (const row of pageRows) {
        const values = Object.fromEntries(dimensions.map((name, index) => [name === 'page' ? 'url' : name, row.keys[index]]));
        for (const metric of metrics) rows.push({ metric, value: row[metric.external_name], dimensions: values, observed_at: `${values.date}T00:00:00.000Z` });
      }
      if (pageRows.length < 25000) break;
      startRow += 25000;
      if (pagesRequested >= maxPages) {
        continuationState = { start_row: startRow };
        break;
      }
    } while (true);
    const collection = collectionResult({
      items,
      paginationState: { pages_requested: pagesRequested, pages_retrieved: pagesRetrieved, boundary: { max_pages: maxPages } },
      providerReportedTotal: providerTotal,
      continuationState,
      providerCompleteness: 'unknown',
      limitations: ['Search Console privacy filtering and aggregation apply.', 'Search Analytics does not guarantee every data row; the API can return top rows only.', 'Final data can still be revised by the provider.'],
      errors,
    });
    return { rows, cursor: endDate, limitations: collection.limitations, collection, ...(connectorError ? { connectorError } : {}) };
  },
  async collectObservations(connection, request, context = {}) {
    return collectSearchConsoleObservations({ connection, request, ...context });
  },
};
