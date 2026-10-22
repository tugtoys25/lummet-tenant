import { COUNTRY_NAME_TO_CODE } from "./match-helpers.js";

// ── Helper functions ──

export function shouldSearchTable(tableName, tablesFromPlan, intent, relevantIntents) {
  if (tablesFromPlan && tablesFromPlan.length > 0) return tablesFromPlan.includes(tableName);
  return relevantIntents.includes(intent) || intent === 'general';
}

export function evaluateGeoStatus(rules, country, casino) {
  if (!rules || rules.length === 0) return evaluateGeoFromColumns(casino, country);
  const countryRule = rules.find(r => r.country_code === country.toUpperCase());
  if (countryRule) return countryRule.status;
  const hasAllowed = rules.some(r => r.status === 'allowed');
  const hasBlocked = rules.some(r => r.status === 'blocked');
  if (hasAllowed && !hasBlocked) return 'blocked';
  if (hasBlocked && !hasAllowed) return 'allowed';
  return evaluateGeoFromColumns(casino, country);
}

export function evaluateGeoFromColumns(casino, country) {
  if (!casino || !country) return 'unknown';
  const code = country.toUpperCase();
  const codeLower = country.toLowerCase();
  if (casino.restricted_countries) {
    const restricted = casino.restricted_countries.toLowerCase();
    if (restricted.includes(codeLower) || restricted.includes(code)) return 'blocked';
  }
  if (casino.supported_countries) {
    const supported = casino.supported_countries.toLowerCase();
    if (supported === '' || supported === '[]' || supported === 'null') return 'unknown';
    if (supported.includes(codeLower) || supported.includes(code)) return 'allowed';
    if (supported.length > 2) return 'blocked';
  }
  return 'unknown';
}

export function extractSearchTerms(message) {
  const text = message.toLowerCase().trim();
  const stopWords = ['what','which','how','why','when','where','who','is','are','was','were','be','do','does','can','could','should','would','will','the','a','an','this','that','about','tell','show','give','list','find','me','us','please','help','want','need','know','casino','casinos','review','reviews','page','pages','my','your','in','on','at','to','for','of','with','from','by','and','or','but','country','countries'];
  const words = text.split(/[^a-z0-9.]+/i).filter(w => w.length > 1);
  return words.filter(w => !stopWords.includes(w));
}

export function extractCountryFromMessage(message) {
  const text = message.toLowerCase();
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (text.includes(name)) return code;
  }
  const codePattern = /\b(US|CA|GB|DE|FR|IT|ES|NL|AU|NZ|JP|CN|IN|BR|MX|ZA|NG|KE|EG|SE|NO|DK|FI|PL|PT|GR|TR|RU|UA|AE|SA|QA|KR|TH|VN|PH|ID|MY|SG|AR|CL|CO|PE|AT|CH|IE|BE|CZ|HU|RO|BG|HR|MT|CY|LU|IS|RW)\b/;
  const match = message.match(codePattern);
  return match ? match[1] : null;
}

export function isListingText(text) {
  return text.includes('list') || text.includes('all casinos') || text.includes('available casinos') || text.includes('top casinos') || text.includes('best casinos') || text.includes('show me') || text.includes('what casinos') || text.includes('which casinos') || text.includes('casinos are available') || text.includes('casinos do you have');
}

export function isGeoText(text) {
  return text.includes('available in') || text.includes('can i play') || text.includes('my country') || text.includes('restricted in') || text.includes('allowed in') || (text.includes('which casinos') && text.includes('country'));
}
