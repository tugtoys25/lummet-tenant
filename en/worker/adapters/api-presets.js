// Starting points for provider API integrations. Only request shapes taken from a program's own published API documentation belong
// here. The field mapping of a program's rows is added once its row schema is confirmed with Test connection.
export const API_PRESETS = [
  {
    id: 'pinup_statistics', name: 'Pin-Up Partners: player statistics (documented)', confidence: 'documented',
    api_base_url: 'https://partnerspinup.com', conversions_path: '/public/v2/statistics/players',
    auth_style: 'bearer', http_method: 'POST', paging: 'page', page_size: 100, response_array_path: 'list', date_format: 'iso',
    body_json: '{"periodFrom":"{since}","periodTo":"{until}","page":"{page}","limit":"{limit}"}',
    note: 'API key: Profile > API Key in your Pin-Up cabinet (or ask your manager). The player rows are matched to your clicks through sub-account 1, so the Field Mapping needs the exact player field names. Press Test connection, then send the field names it shows.'
  },
  {
    id: 'affilka_report', name: 'Affilka: daily report totals (documented)', confidence: 'documented', result_mode: 'report',
    api_base_url: 'https://YOUR-AFFILIATE-SYSTEM-DOMAIN', conversions_path: '/api/customer/v1/partner/report',
    auth_style: 'header', auth_name: 'Authorization', http_method: 'GET', paging: 'none', date_format: 'date',
    extra_query: 'columns[]=visits_count&columns[]=registrations_count&columns[]=first_deposits_count&columns[]=deposits_sum&columns[]=partner_income&group_by[]=day',
    date_param_since: 'from', date_param_until: 'to',
    note: 'Replace the address with your Affilka domain. The key is the statistic token on your Account Info page, sent as is (no Bearer). This brings in daily totals to compare with what this site tracked; it does not create conversions. Add or remove columns in Extra parameters (the Partner API page lists them).'
  }
];
export const getApiPreset = (id) => API_PRESETS.find((p) => p.id === id) || null;
