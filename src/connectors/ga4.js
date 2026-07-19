import { providerRequest } from './http.js';

const DATA = 'https://analyticsdata.googleapis.com/v1beta';
const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const METRICS = {
  sessions: { unit: 'count', value_type: 'integer' },
  engagedSessions: { unit: 'count', value_type: 'integer' },
  keyEvents: { unit: 'count', value_type: 'number' },
  totalRevenue: { unit: 'currency', value_type: 'number' },
};
const DIMENSIONS = new Set(['date', 'landingPagePlusQueryString', 'sessionDefaultChannelGroup', 'country', 'deviceCategory']);

export const ga4Connector = {
  provider: 'ga4', defaultCredentialEnv: 'GA4_ACCESS_TOKEN', readOnlyScopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  describeMetrics() { return METRICS; },
  async discoverProperties(context) {
    const properties = [];
    let pageToken;
    do {
      const query = `?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const result = await providerRequest(`${ADMIN}/accountSummaries${query}`, context);
      for (const account of result.accountSummaries || []) for (const property of account.propertySummaries || []) {
        properties.push({ property_id: property.property.replace(/^properties\//, ''), display_name: property.displayName, account: account.account });
      }
      pageToken = result.nextPageToken;
    } while (pageToken);
    return properties;
  },
  async validateConnection(connection, context) {
    const properties = await this.discoverProperties(context);
    return { valid: properties.some((item) => item.property_id === String(connection.property_id)), properties };
  },
  async sync(connection, metrics, { startDate, endDate, ...context }) {
    const dimensions = [...new Set(metrics.flatMap((metric) => metric.dimensions).filter((item) => DIMENSIONS.has(item)))];
    if (!dimensions.includes('date')) dimensions.unshift('date');
    if (!dimensions.includes('landingPagePlusQueryString')) dimensions.push('landingPagePlusQueryString');
    const rows = [];
    const limitations = [];
    let offset = 0;
    do {
      const result = await providerRequest(`${DATA}/properties/${encodeURIComponent(connection.property_id)}:runReport`, {
        ...context, method: 'POST', body: {
        dateRanges: [{ startDate, endDate }], dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((metric) => ({ name: metric.external_name })), limit: '100000', offset: String(offset),
        dimensionFilter: { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search' } } },
        },
      });
      for (const row of result.rows || []) {
        const values = Object.fromEntries(dimensions.map((name, index) => [name === 'landingPagePlusQueryString' ? 'url' : name, row.dimensionValues[index]?.value]));
        const date = values.date?.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
        rows.push(...metrics.map((metric, index) => ({ metric, value: Number(row.metricValues[index]?.value), dimensions: values, observed_at: `${date}T00:00:00.000Z` })));
      }
      if (result.metadata?.dataLossFromOtherRow) limitations.push('Provider reports data loss from the (other) row.');
      offset += (result.rows || []).length;
      if (!result.rowCount || offset >= result.rowCount || !(result.rows || []).length) break;
    } while (true);
    return { rows, cursor: endDate, limitations: [...new Set([...limitations, 'GA4 reporting identity, thresholding, attribution, and consent configuration affect results.', 'Sync is filtered to Organic Search sessions.'])] };
  },
};
