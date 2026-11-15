// Affiliate program presets and the postback URL builder.
//
// A preset records, for one program or platform, what the operator needs from us and what we need from the operator:
//   - click_id_param   the query parameter name the program expects our click id under on the destination URL
//   - syntax           the macro syntax the program uses in its postback settings ({x}, {{x}}, [x], ${x})
//   - query            the parameters the program should send us, each as { field, param, macro | literal }
//   - events           one URL per event when the program fires separate URLs; otherwise a single URL carrying the event
//
// confidence says how sure we are of the macro names:
//   documented  taken from the program's or platform's public documentation
//   partial     the click-id name and the event style are known, the macro names are the usual ones
//   typical     the usual shape for this kind of program; most programs publish their macros only inside the manager's panel
// The wizard shows this next to every preset so nobody is told a guess is a fact.

const FIELD_PARAM_DEFAULTS = {
  click_id: 'click_id',
  conversion_type: 'event',
  status: 'status',
  reported_value: 'amount',
  currency: 'currency',
  country_code: 'country',
  external_reference: 'transaction_id',
  reported_commission: 'payout',
  external_player_id: 'player_id',
  occurred_at: 'timestamp',
  promo_code: 'promo'
};

export const CUSTOM_FIELDS = Object.keys(FIELD_PARAM_DEFAULTS);
export const MACRO_SYNTAXES = ['{}', '{{}}', '[]', '${}', '##', 'none'];
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,40}$/;
const MACRO_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,40}$/;
const EVENT_TYPES = ['registration', 'qualified_lead', 'ftd', 'deposit', 'cpa_conversion', 'revshare', 'hybrid', 'adjustment', 'refund', 'chargeback'];

const EVENT_LABELS = {
  registration: 'Registration', qualified_lead: 'Qualified lead', ftd: 'First deposit', deposit: 'Repeat deposit',
  cpa_conversion: 'CPA payout', revshare: 'Revenue share', hybrid: 'Hybrid', adjustment: 'Adjustment', refund: 'Refund', chargeback: 'Chargeback'
};

const STD_EVENTS = ['registration', 'ftd', 'deposit'];

// q(field, macro) -> a parameter whose value is a macro the program fills in; lit(field, value) -> a fixed value.
const q = (field, macro, param) => ({ field, param: param || FIELD_PARAM_DEFAULTS[field], macro });
const lit = (field, literal, param) => ({ field, param: param || FIELD_PARAM_DEFAULTS[field], literal });

function operator(id, name, extra) {
  return Object.assign({ id, name, family: 'operator', delivery: 'postback', syntax: '{}', event_mode: 'separate', events: STD_EVENTS, confidence: 'typical', notes: [] }, extra);
}

export const PRESETS = [
  operator('pinup', 'Pin-Up Partners', {
    confidence: 'documented', click_id_param: 'sub_id1', event_mode: 'param', events: ['registration', 'qualified_lead', 'ftd', 'deposit'],
    query: [q('click_id', 'subId1'), q('external_reference', 'clickId', 'transaction_id'), q('external_player_id', 'traderId'), q('reported_value', 'sum'), q('reported_commission', 'payment', 'payout'), q('currency', 'currency'), q('country_code', 'country'), q('occurred_at', 'timestamp')],
    notes: [
      'Pin-Up hands back what you put in the sub-accounts of your partner link. Our click id travels in sub-account 1 (subId1) and comes back as {subId1}.',
      'Pin-Up\'s own {clickId} is a unique id for each postback, not your click. We use it as the transaction id, so a repeat deposit is never counted twice and never mistaken for a new one.',
      'Create one postback per action in your Pin-Up profile: registration, registration confirmed, first deposit, repeat deposit. Currency is always USD.',
      '{payment} (your reward) is only sent for repeat deposits. {sum} is the deposit amount.',
      'Check in the Pin-Up link builder what the first sub-account is called on the link (the preset uses sub_id1) and change the click id name on your tracking link if it differs.'
    ]
  }),
  operator('parimatch', 'Parimatch Partners', {
    confidence: 'partial', click_id_param: 'anid',
    query: [q('click_id', 'anid'), q('reported_value', 'amount'), q('currency', 'currency'), q('external_reference', 'transaction_id')],
    notes: ['Parimatch fires a separate postback URL per event; add one URL for each event below.', 'Click id parameter is anid.']
  }),
  operator('magicclick', 'Magic Click', {
    confidence: 'documented', click_id_param: 'aff_click_id', events: ['registration', 'deposit'], event_mode: 'status',
    status_events: { registration: 'lead', deposit: 'sale' },
    query: [q('click_id', 'aff_click_id')],
    notes: ['Magic Click reports status=lead for a registration and status=sale for a deposit. We read that as the event.', 'Click id parameter is aff_click_id.']
  }),
  operator('onexbet', '1xBet Partners (1xPartners)', {
    confidence: 'typical', click_id_param: 'click_id',
    query: [q('click_id', 'click_id'), q('reported_value', 'amount'), q('currency', 'currency'), q('external_reference', 'transaction_id')]
  }),
  operator('melbet', 'Melbet Partners', {
    confidence: 'typical', click_id_param: 'click_id',
    query: [q('click_id', 'click_id'), q('reported_value', 'amount'), q('currency', 'currency'), q('external_reference', 'transaction_id')],
    notes: ['Same family as 1xBet; confirm the macro names in your manager panel.']
  }),
  operator('betwinner', 'Betwinner Partners', {
    confidence: 'typical', click_id_param: 'click_id',
    query: [q('click_id', 'click_id'), q('reported_value', 'amount'), q('currency', 'currency'), q('external_reference', 'transaction_id')],
    notes: ['Same family as 1xBet; confirm the macro names in your manager panel.']
  }),
  operator('onewin', '1win Partners', {
    confidence: 'typical', click_id_param: 'click_id',
    query: [q('click_id', 'click_id'), q('reported_value', 'amount'), q('currency', 'currency'), q('external_reference', 'transaction_id')],
    notes: ['1win fires a separate URL per event. Confirm the click id name in your partner panel and change it on the link if it differs.']
  }),
  {
    id: 'affilka', name: 'Affilka (affiliate programs on the Affilka platform)', family: 'platform', delivery: 'postback', syntax: '${}', event_mode: 'separate',
    events: ['registration', 'qualified_lead', 'ftd', 'deposit'], confidence: 'documented', click_id_param: 'clickID',
    query: [q('click_id', 'clickID', 'click_id'), q('reported_value', 'amount'), q('currency', 'currency')],
    notes: [
      'In the Affilka panel open Campaigns > My Postbacks > New Postback, choose Global scope, pick the action (registration, first_deposit, deposit, qualification) and paste the matching URL. Create one postback per action.',
      'Affilka only returns a custom value such as clickID if it is on the tracking link too. Our tracking link adds clickID to the Affilka link for you.',
      'Affilka syncs players every 15 minutes to once a day, so postbacks are not instant. The qualification postback is sent only when your commission is calculated.',
      'Affilka sends no transaction id, so repeat deposits cannot be told apart from a genuine second one. Registration and first deposit are de-duplicated per click.',
      'Use the Postbacks Log in the Affilka panel to see the response code your site returned for each postback.'
    ]
  },
  {
    id: 'vpartners', name: 'V.Partners (Vegas and its brands)', family: 'platform', delivery: 'postback', syntax: '##', event_mode: 'separate',
    events: ['registration', 'ftd', 'deposit', 'revshare'], confidence: 'partial', click_id_param: 'click_id',
    query: [q('click_id', 'click_id'), q('external_reference', 'postback_id', 'transaction_id')],
    status_urls: [
      { key: 'lead_hold', label: 'Lead Hold', status: 'pending', event: 'cpa_conversion' },
      { key: 'lead_approve', label: 'Lead Approve', status: 'confirmed', event: 'cpa_conversion' },
      { key: 'lead_reject', label: 'Lead Reject', status: 'rejected', event: 'cpa_conversion' }
    ],
    notes: [
      'In V.Partners open Integrations > Postback (S2S pixel), choose the brand, offer and event, then paste the matching URL. Macros are written ##LIKE_THIS## and are listed under the Macros button.',
      'Documented: ##CLICK_ID## (the click id from your link) and ##POSTBACK_ID## (a unique id per postback, used here as the transaction id).',
      'Not included yet: amount, currency and country macros, because the list under the Macros button was not seen. Open it, scroll to the end and send the rest so they can be added. Until then conversions are counted but carry no amount.',
      'Lead Hold, Lead Approve and Lead Reject map to pending, confirmed and rejected. Which of your events they apply to depends on the offer, so check the first few in Recent postbacks.',
      'Check in Get link what the click id is called on your link and set it as the click id name on your tracking link.'
    ]
  },
  {
    id: 'cellxpert', name: 'Cellxpert', family: 'platform', delivery: 'either', syntax: '{}', event_mode: 'param', events: STD_EVENTS, confidence: 'partial', click_id_param: 'afp',
    query: [q('click_id', 'afp'), q('conversion_type', 'event', 'event'), q('reported_value', 'amount'), q('currency', 'currency'), q('external_reference', 'transaction_id')],
    notes: ['Cellxpert operators use afp as the click parameter and expose an API key based reporting API.']
  },
  {
    id: 'incomeaccess', name: 'Income Access', family: 'platform', delivery: 'either', syntax: '{}', event_mode: 'param', events: STD_EVENTS, confidence: 'typical', click_id_param: 'dyn',
    query: [q('click_id', 'dyn'), q('conversion_type', 'event', 'event'), q('reported_value', 'amount'), q('currency', 'currency'), q('external_reference', 'transaction_id')],
    notes: ['Income Access is mostly a daily report pull. Use this URL only if your operator turned on a postback.']
  },
  {
    id: 'myaffiliates', name: 'MyAffiliates', family: 'platform', delivery: 'either', syntax: '{}', event_mode: 'param', events: STD_EVENTS, confidence: 'typical', click_id_param: 'click_id',
    query: [q('click_id', 'click_id'), q('conversion_type', 'event', 'event'), q('reported_value', 'amount'), q('currency', 'currency'), q('external_reference', 'transaction_id')]
  },
  {
    id: 'scaleo', name: 'Scaleo (and programs on it, such as Alpha Partners)', family: 'platform', delivery: 'postback', syntax: '{}', event_mode: 'separate', events: STD_EVENTS, confidence: 'typical', click_id_param: 'aff_sub',
    query: [q('click_id', 'aff_sub'), q('reported_commission', 'payout'), q('currency', 'currency'), q('external_reference', 'transaction_id')],
    notes: ['Confirm the macro names under Postbacks in the Scaleo panel.']
  },
  {
    id: 'keitaro', name: 'Keitaro style', family: 'tracker', delivery: 'postback', syntax: '{}', event_mode: 'param', events: STD_EVENTS, confidence: 'documented', click_id_param: 'subid',
    query: [q('click_id', 'subid'), q('status', 'status'), q('external_reference', 'tid'), q('reported_commission', 'payout'), q('currency', 'currency')],
    notes: ['Keitaro receives subid, status, tid, payout and currency. Use this when the program already offers a Keitaro-format postback.']
  },
  {
    id: 'binom', name: 'Binom style', family: 'tracker', delivery: 'postback', syntax: '{}', event_mode: 'param', events: STD_EVENTS, confidence: 'partial', click_id_param: 'clickid',
    query: [q('click_id', 'clickid'), q('status', 'status'), q('external_reference', 'txid'), q('reported_commission', 'payout'), q('currency', 'currency')]
  },
  {
    id: 'voluum', name: 'Voluum style', family: 'tracker', delivery: 'postback', syntax: '{}', event_mode: 'param', events: STD_EVENTS, confidence: 'documented', click_id_param: 'cid',
    query: [q('click_id', 'cid'), q('conversion_type', 'et', 'et'), q('reported_commission', 'payout'), q('external_reference', 'txid')],
    notes: ['Voluum postbacks use cid, payout, txid and et (the event name).']
  }
];

export function listPresets() {
  return PRESETS.map((p) => ({ id: p.id, name: p.name, family: p.family, delivery: p.delivery, confidence: p.confidence, click_id_param: p.click_id_param, events: p.events, notes: p.notes || [] }));
}

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

function macroText(macro, syntax) {
  switch (syntax) {
    case '{{}}': return `{{${macro}}}`;
    case '[]': return `[${macro}]`;
    case '${}': return '${' + macro + '}';
    case '##': return `##${String(macro).toUpperCase()}##`;
    case 'none': return macro;
    default: return `{${macro}}`;
  }
}

function valueText(row, syntax) {
  return row.literal != null ? encodeURIComponent(row.literal) : macroText(row.macro, syntax);
}

// Turns a preset or a custom definition into everything the wizard shows: the URLs to paste into the program, the field mapping to
// save on the integration, and the click id name to set on tracking links.
export function buildPostbackSetup({ origin, token, preset = null, custom = null, secretPlaceholder = null }) {
  const def = preset || custom;
  if (!def) throw new Error('Choose a preset or describe a custom program.');
  const base = `${String(origin || '').replace(/\/$/, '')}/en/api/v1/conversions/postback/${token || '<token>'}`;
  const syntax = def.syntax || '{}';
  const rows = def.query;

  const fieldMapping = {};
  for (const r of rows) if (r.field !== 'conversion_type' || def.event_mode !== 'status') fieldMapping[r.field] = r.param;
  if (def.event_mode === 'status') fieldMapping.status = 'status';

  const common = rows.map((r) => `${r.param}=${valueText(r, syntax)}`);
  if (secretPlaceholder) common.push(`secret=${secretPlaceholder}`);

  const urls = [];
  const eventRow = rows.find((r) => r.field === 'conversion_type');
  for (const ev of def.events) {
    const parts = common.slice();
    if (def.event_mode === 'status') parts.push(`status=${(def.status_events || {})[ev] || ev}`);
    else if (def.event_mode === 'separate') parts.push(`event=${encodeURIComponent(ev)}`);
    else if (def.event_mode === 'param' && !eventRow ) parts.push(`event=${encodeURIComponent(ev)}`);
    urls.push({ event: ev, label: EVENT_LABELS[ev] || ev, url: `${base}?${parts.join('&')}` });
  }
  // Programs that report a lead's decision (hold, approve, reject) as its own postback: the same URL with a status.
  for (const su of def.status_urls || []) {
    const parts = common.slice();
    parts.push(`event=${encodeURIComponent(su.event || 'cpa_conversion')}`, `status=${su.status}`);
    urls.push({ event: su.key, label: su.label, url: `${base}?${parts.join('&')}` });
  }
  // A single-URL program that reports the event itself needs just one URL.
  const single = def.event_mode === 'param' && !!eventRow;
  const finalUrls = single ? [{ event: 'all', label: 'All events (one URL)', url: urls[0].url }] : urls;
  if (!fieldMapping.status && (def.status_urls || []).length) fieldMapping.status = 'status';

  return {
    id: def.id || 'custom',
    name: def.name || 'Custom program',
    confidence: def.confidence || 'typical',
    urls: finalUrls,
    field_mapping: fieldMapping,
    field_mapping_json: JSON.stringify(fieldMapping),
    tracking_link: { click_id_param: def.click_id_param || null },
    notes: def.notes || []
  };
}

// Validates the custom builder form and turns it into a definition buildPostbackSetup understands.
export function validateCustomDefinition(input) {
  const errors = [];
  const syntax = MACRO_SYNTAXES.includes(input?.syntax) ? input.syntax : '{}';
  const query = [];
  const seen = new Set();
  for (const row of Array.isArray(input?.rows) ? input.rows : []) {
    if (!row || !CUSTOM_FIELDS.includes(row.field)) { errors.push(`Unknown field "${row?.field}".`); continue; }
    const param = String(row.param || '').trim();
    const macro = String(row.macro || '').trim();
    if (!param && !macro) continue;
    if (!PARAM_NAME.test(param)) { errors.push(`Parameter name for ${row.field} is not valid.`); continue; }
    if (!MACRO_NAME.test(macro)) { errors.push(`Macro name for ${row.field} is not valid.`); continue; }
    if (seen.has(row.field)) { errors.push(`${row.field} is listed twice.`); continue; }
    seen.add(row.field);
    query.push({ field: row.field, param, macro });
  }
  if (!seen.has('click_id')) errors.push('The click id is required: say which parameter and macro the program uses for it.');
  const eventMode = input?.event_mode === 'separate' ? 'separate' : 'param';
  const events = (Array.isArray(input?.events) ? input.events : STD_EVENTS).filter((e) => EVENT_TYPES.includes(e));
  if (!events.length) errors.push('Pick at least one event.');
  const clickIdParam = input?.click_id_param ? String(input.click_id_param).trim() : null;
  if (clickIdParam && !PARAM_NAME.test(clickIdParam)) errors.push('The click id name for your links is not valid.');
  if (errors.length) return { errors };
  return { errors, value: { id: 'custom', name: String(input?.name || 'Custom program').slice(0, 80), family: 'custom', confidence: 'typical', syntax, query, event_mode: eventMode, events, click_id_param: clickIdParam, notes: [] } };
}
