import { flattenReport } from './report-mode.js';
// A configurable adapter for any provider whose reporting API is
// shaped like "GET a JSON array of conversions for a date range,
// authenticated with a static header". This is NOT a specific
// network's integration -- brief §10 is explicit: "do not invent APIs
// for providers that do not expose them". This adapter invents
// nothing; it's a thin, generic HTTP client whose endpoint path, auth
// header, date params, and response shape are all supplied via
// provider_adapter_configs, same spirit as postback_configs'
// field_mapping_json letting one config differ from another without a
// code change.
//
// A provider with a genuinely different shape (OAuth token exchange,
// paginated cursors, XML, SOAP, a bespoke SDK) needs its own adapter
// implementing BaseAffiliateProvider directly -- this one intentionally
// does not try to be everything.

import { BaseAffiliateProvider } from './base.js';

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// A short picture of a JSON answer (key names and types only, never values) so an admin can say where the list is.
function outline(v, depth = 0) {
  if (Array.isArray(v)) return v.length ? [outline(v[0], depth + 1)] : [];
  if (v && typeof v === 'object') {
    if (depth >= 5) return '{...}';
    return Object.fromEntries(Object.entries(v).slice(0, 15).map(([k, x]) => [k, outline(x, depth + 1)]));
  }
  return v === null ? 'null' : typeof v;
}

export class GenericRestAdapter extends BaseAffiliateProvider {
  constructor(config) {
    super(config);
    // fetchImpl is ONLY ever supplied directly in tests
    // (new GenericRestAdapter({...config, fetchImpl: mockFetch})) --
    // provider_adapter_configs rows from the database never contain
    // it, so production always uses the real global fetch.
    this._fetch = config.fetchImpl || fetch;
  }

  // A key saved from the dashboard (merged in by withAdapterSettings) wins; otherwise a Worker secret named by credential_reference.
  _resolveSecret(env) {
    if (typeof this.config.managed_secret === 'string' && this.config.managed_secret) return this.config.managed_secret;
    const value = env?.[this.config.credential_reference];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  _authHeaders(env) {
    const secret = this._resolveSecret(env);
    if (!secret) return null;
    if (this.config.auth_query_param) return {}; // the key goes in the address instead
    const headerName = this.config.auth_header_name || 'Authorization';
    const scheme = this.config.auth_scheme != null ? this.config.auth_scheme : 'Bearer';
    const value = /^basic$/i.test(scheme) && secret.includes(':') ? btoa(secret) : secret;
    return { [headerName]: scheme ? `${scheme} ${value}` : value };
  }

  _fmtDate(iso) {
    const f = this.config.date_format || 'iso';
    if (f === 'date') return iso.slice(0, 10);
    if (f === 'unix') return String(Math.floor(new Date(iso).getTime() / 1000));
    return iso;
  }

  _applyKey(url, env) {
    if (this.config.auth_query_param) {
      const secret = this._resolveSecret(env);
      if (secret) url.searchParams.set(this.config.auth_query_param, secret);
    }
    return url;
  }

  // Fills {since} {until} {page} {limit} in a JSON body. A value that is exactly {page} or {limit} becomes a number.
  _body(sinceISO, untilISO, page, limit) {
    if (!this.config.body_json) return null;
    const fill = (v) => {
      if (typeof v === 'string') {
        if (v === '{page}') return page;
        if (v === '{limit}') return limit;
        return v.replace(/\{since\}/g, this._fmtDate(sinceISO)).replace(/\{until\}/g, this._fmtDate(untilISO)).replace(/\{page\}/g, String(page)).replace(/\{limit\}/g, String(limit));
      }
      if (Array.isArray(v)) return v.map(fill);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
      return v;
    };
    return JSON.stringify(fill(JSON.parse(this.config.body_json)));
  }

  _init(headers, sinceISO, untilISO, page = 1, limit = null) {
    const method = (this.config.http_method || 'GET').toUpperCase();
    const init = { headers: { ...headers }, redirect: 'manual' };
    if (method === 'POST') {
      init.method = 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = this._body(sinceISO, untilISO, page, limit || this.config.page_size || 100) || '{}';
    }
    return init;
  }

  _conversionsUrl(env, { sinceISO, untilISO }) {
    const path = this.config.conversions_path || '/conversions';
    const url = new URL(path, this.config.api_base_url);
    if (!this.config.body_json) {
      url.searchParams.set(this.config.date_param_since || 'since', this._fmtDate(sinceISO));
      url.searchParams.set(this.config.date_param_until || 'until', this._fmtDate(untilISO));
    }
    if (this.config.extra_query) {
      const seen = new Set();
      // Repeated keys (columns[]=a&columns[]=b) are kept; any other key replaces what was there.
      for (const [k, v] of new URLSearchParams(this.config.extra_query)) {
        if (k.endsWith('[]') || seen.has(k)) url.searchParams.append(k, v); else url.searchParams.set(k, v);
        seen.add(k);
      }
    }
    return this._applyKey(url, env);
  }

  async authenticate(env) {
    const headers = this._authHeaders(env);
    if (!headers) return { ok: false, error: 'credential_not_configured' };
    try {
      const res = await this._fetch(this._applyKey(new URL(this.config.api_base_url), env).toString(), { headers, redirect: 'manual' });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: e.message || 'network error' };
    }
  }

  _extractRows(body) {
    const arrayPath = this.config.response_array_path;
    return arrayPath
      ? getByPath(body, arrayPath)
      : (Array.isArray(body) ? body : (body?.data || body?.conversions || body?.rows || body?.items || body?.results));
  }

  async fetchConversions(env, { sinceISO, untilISO }) {
    const headers = this._authHeaders(env);
    if (!headers) throw new Error('credential_not_configured');
    const url = this._conversionsUrl(env, { sinceISO, untilISO }).toString();
    const paged = this.config.paging === 'page';
    const limit = this.config.page_size || 100;
    const all = [];
    for (let page = 1; page <= 50; page++) {
      const res = await this._fetch(url, this._init(headers, sinceISO, untilISO, page, limit));
      if (!res.ok) throw new Error(`Provider API returned HTTP ${res.status}`);
      const body = await res.json();
      const rows = this._extractRows(body);
      if (!Array.isArray(rows)) throw new Error('Provider response did not contain a recognizable array of conversions -- set response_array_path');
      all.push(...rows);
      const totalPages = Number(body?.total_pages ?? body?.totalPages ?? body?.pagination?.total_pages);
      if (!paged || !rows.length || !(totalPages > page)) break;
    }
    return all;
  }

  // Report-style APIs: one request, rows of named cells. Returns the flattened rows (and how many pages the provider says exist).
  async fetchReport(env, { sinceISO, untilISO }) {
    const headers = this._authHeaders(env);
    if (!headers) throw new Error('credential_not_configured');
    const res = await this._fetch(this._conversionsUrl(env, { sinceISO, untilISO }).toString(), this._init(headers, sinceISO, untilISO, 1, this.config.page_size || 100));
    if (!res.ok) throw new Error(`Provider API returned HTTP ${res.status}`);
    const flat = flattenReport(await res.json());
    if (!flat) throw new Error('The answer is not a report (expected rows.data). Check the path and parameters.');
    return flat;
  }

  // One real request for the last 24 hours, reported in plain terms so an admin can see whether the address, key, date format and
  // field names are right before any data is imported. Nothing is written. The key never appears in the result.
  async testConnection(env) {
    const headers = this._authHeaders(env);
    if (!headers) return { ok: false, stage: 'key', message: 'No API key is saved for this integration yet.' };
    const untilISO = new Date().toISOString();
    const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let res;
    try {
      res = await this._fetch(this._conversionsUrl(env, { sinceISO, untilISO }).toString(), this._init(headers, sinceISO, untilISO, 1, Math.min(5, this.config.page_size || 5)));
    } catch (e) {
      return { ok: false, stage: 'network', message: `Could not reach the provider: ${e.message || 'network error'}.` };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, stage: 'auth', http_status: res.status, message: `The provider refused the key (HTTP ${res.status}). Check the key and how it is sent (header name, scheme or URL parameter).` };
    if (res.status === 404) return { ok: false, stage: 'path', http_status: 404, message: 'The provider answered 404. Check the API address and the conversions path.' };
    if (res.status >= 300 && res.status < 400) return { ok: false, stage: 'path', http_status: res.status, message: 'The address redirects somewhere else. Use the final address.' };
    if (!res.ok) return { ok: false, stage: 'http', http_status: res.status, message: `The provider answered HTTP ${res.status}.` };
    let body;
    try { body = await res.json(); } catch { return { ok: false, stage: 'format', http_status: res.status, message: 'The provider answered, but not with JSON. This connector reads JSON only.' }; }
    if (this.config.result_mode === 'report') {
      const flat = flattenReport(body);
      if (!flat) return { ok: false, stage: 'shape', http_status: res.status, top_level_keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 12) : [], outline: outline(body), message: 'Connected, but this is not a report answer (rows.data was not found).' };
      const first = flat.rows[0] || null;
      return { ok: true, stage: 'ok', http_status: res.status, mode: 'report', row_count: flat.rows.length, total_pages: flat.totalPages, sample_keys: first ? [...Object.keys(first.group), ...Object.keys(first.metrics)] : [], sample: first ? { ...first.group, ...first.metrics, currency: first.currency } : null, has_period: !!first?.period };
    }
    const rows = this._extractRows(body);
    if (!Array.isArray(rows)) {
      const keys = body && typeof body === 'object' ? Object.keys(body).slice(0, 12) : [];
      return { ok: false, stage: 'shape', http_status: res.status, top_level_keys: keys, outline: outline(body), message: 'Connected, but the list of conversions was not found. Set "Where the list is" to one of the keys shown, for example data.rows.' };
    }
    const first = rows[0];
    const sample = first && typeof first === 'object'
      ? Object.fromEntries(Object.entries(first).slice(0, 25).map(([k, v]) => [k, typeof v === 'object' && v !== null ? '[object]' : String(v).slice(0, 60)]))
      : null;
    let recognised = null;
    if (sample) { try { recognised = this.normalizeConversion(first); } catch { recognised = null; } }
    return { ok: true, stage: 'ok', http_status: res.status, row_count: rows.length, sample_keys: sample ? Object.keys(sample) : [], sample, recognised };
  }

  // fetchRevenue/fetchCommissions/fetchReports intentionally NOT
  // overridden -- this adapter's shape is "one endpoint returns
  // everything needed per conversion row" (reported_value AND
  // reported_commission are both fields fetchConversions' rows can
  // carry, via field_mapping_json same as postbacks/imports). A
  // provider genuinely splitting these across separate endpoints needs
  // its own adapter.

  async healthCheck(env) {
    const auth = await this.authenticate(env);
    return auth.ok ? { healthy: true } : { healthy: false, detail: auth.error };
  }
}
