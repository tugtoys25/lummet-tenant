// "Set it up for me": makes sure a program, an account and (optionally) a tracking link exist for a casino that so far only has its own
// affiliate URL, so a postback integration can be created without visiting four admin pages first. Everything found is reused; nothing is
// ever deleted or renamed, and a casino that already has a link for the program keeps it.
import { createPartner, generateUniquePartnerSlug } from '../database/affiliate-partners.js';
import { createProgram, getProgramCasinos, setProgramCasinos } from '../database/affiliate-programs.js';
import { createAccount } from '../database/affiliate-accounts.js';
import { createTrackingLink, getLinkHandoff, setLinkHandoff } from '../database/tracking-links.js';

const cleanName = (n) => String(n || '').replace(/\s*\(.*$/, '').trim();

export async function quickSetup(db, { programName, programId = null, casinoId = null, casinoIds = [], clickIdParam = null, userId = null }) {
  const out = { created: [], reused: [], tracking_link: null };
  let program;
  if (programId) {
    program = await db.prepare('SELECT * FROM affiliate_programs WHERE id = ?').bind(programId).first();
    if (!program) throw new Error('Affiliate program not found.');
    out.reused.push('program');
  } else {
    const name = cleanName(programName);
    if (!name) throw new Error('A program name is needed.');
    program = await db.prepare('SELECT * FROM affiliate_programs WHERE lower(name) = lower(?) ORDER BY id LIMIT 1').bind(name).first();
    if (program) out.reused.push('program');
    else {
      let partner = await db.prepare('SELECT * FROM affiliate_partners WHERE lower(name) = lower(?) ORDER BY id LIMIT 1').bind(name).first();
      if (partner) out.reused.push('partner');
      else {
        const slug = await generateUniquePartnerSlug(db, name);
        const pid = await createPartner(db, { name, slug, partner_type: 'network', created_by: userId });
        partner = { id: pid };
        out.created.push('partner');
      }
      const id = await createProgram(db, { partner_id: partner.id, name, created_by: userId });
      program = await db.prepare('SELECT * FROM affiliate_programs WHERE id = ?').bind(id).first();
      out.created.push('program');
    }
  }

  let account = await db.prepare(`SELECT * FROM affiliate_accounts WHERE program_id = ? AND status = 'active' ORDER BY id LIMIT 1`).bind(program.id).first();
  if (account) out.reused.push('account');
  else {
    const id = await createAccount(db, { program_id: program.id, account_name: `${program.name} account`, status: 'active', credential_reference: 'managed', created_by: userId });
    account = { id };
    out.created.push('account');
  }
  out.program_id = program.id; out.partner_id = program.partner_id; out.account_id = account.id;

  const ids = [...new Set([...(casinoIds || []), ...(casinoId ? [casinoId] : [])].map(Number).filter(Boolean))];
  if (ids.length) {
    const have = (await getProgramCasinos(db, program.id) || []).map((c) => c.casino_id ?? c.id);
    const merged = [...new Set([...have, ...ids])];
    if (merged.length !== have.length) await setProgramCasinos(db, program.id, merged);
    out.links = [];
    for (const id of ids) {
      const casino = await db.prepare('SELECT id, name, affiliate_url FROM casinos WHERE id = ?').bind(id).first();
      if (!casino) { if (!casinoIds?.length) throw new Error('Casino not found.'); continue; }
      const entry = { casino: casino.name, casino_id: casino.id, action: null, tracking_code: null, link_id: null };
      const links = (await db.prepare(`SELECT id, tracking_code, program_id FROM tracking_links WHERE casino_id = ? AND status = 'active' ORDER BY id`).bind(casino.id).all()).results || [];
      const mine = links.filter((l) => l.program_id === program.id);
      const unassigned = links.filter((l) => l.program_id == null);
      let handoffTargets = [];
      if (mine.length) { entry.action = 'reused'; handoffTargets = mine; }
      else if (unassigned.length) {
        // Quick-launch casinos usually already have a tracking link with no program. Fill in only the empty program/partner; nothing else is edited.
        for (const l of unassigned) await db.prepare('UPDATE tracking_links SET program_id = ?, partner_id = COALESCE(partner_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND program_id IS NULL').bind(program.id, program.partner_id, l.id).run();
        entry.action = 'adopted'; handoffTargets = unassigned;
      } else if (links.length) { entry.action = 'kept_other_program'; }
      else if (!/^https:\/\//i.test(casino.affiliate_url || '')) {
        if (!casinoIds?.length) throw new Error(`${casino.name} has no https affiliate URL to turn into a tracking link. Add one on the casino first.`);
        entry.action = 'skipped_no_url';
      } else {
        const l = await createTrackingLink(db, { internal_name: `${casino.name} - ${program.name}`, destination_url: casino.affiliate_url, casino_id: casino.id, partner_id: program.partner_id, program_id: program.id, created_by: userId });
        entry.action = 'created'; handoffTargets = [{ id: l.id, tracking_code: l.tracking_code }];
        out.created.push('tracking_link');
      }
      if (clickIdParam) for (const l of handoffTargets) {
        const existing = await getLinkHandoff(db, l.id);
        await setLinkHandoff(db, l.id, { click_id_param: clickIdParam, sub_param_map: existing?.sub_param_map ?? null });
      }
      if (handoffTargets[0]) { entry.tracking_code = handoffTargets[0].tracking_code; entry.link_id = handoffTargets[0].id; }
      out.links.push(entry);
    }
    const first = out.links.find((l) => l.link_id);
    if (first) out.tracking_link = { id: first.link_id, tracking_code: first.tracking_code, casino: first.casino };
  }
  return out;
}

// What already exists, so the admin can reuse it before creating anything new.
export async function programOverview(db) {
  const { results } = await db.prepare(`
    SELECT p.id, p.name, p.status, pt.name AS partner_name,
      (SELECT COUNT(*) FROM affiliate_accounts a WHERE a.program_id = p.id) AS accounts,
      (SELECT COUNT(*) FROM affiliate_program_casinos pc WHERE pc.program_id = p.id) AS casinos,
      (SELECT COUNT(*) FROM tracking_links t WHERE t.program_id = p.id AND t.status = 'active') AS links,
      (SELECT COUNT(*) FROM postback_configs c JOIN affiliate_accounts a ON a.id = c.account_id WHERE a.program_id = p.id AND c.status = 'active') AS integrations
    FROM affiliate_programs p LEFT JOIN affiliate_partners pt ON pt.id = p.partner_id ORDER BY p.name`).all();
  return results || [];
}

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

// Casinos grouped by the domain of their own affiliate URL, so everything that goes through one program can be ticked together.
export async function casinoGroups(db) {
  const { results } = await db.prepare(`SELECT id, name, slug, affiliate_url,
      (SELECT COUNT(*) FROM tracking_links t WHERE t.casino_id = casinos.id AND t.status = 'active') AS links,
      (SELECT group_concat(DISTINCT p.name) FROM tracking_links t JOIN affiliate_programs p ON p.id = t.program_id WHERE t.casino_id = casinos.id AND t.status = 'active') AS programs
    FROM casinos ORDER BY name`).all();
  const groups = new Map();
  for (const c of results || []) {
    const host = hostOf(c.affiliate_url) || '(no usable affiliate URL)';
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push({ id: c.id, name: c.name, slug: c.slug, links: c.links, programs: c.programs || '', usable: /^https:\/\//i.test(c.affiliate_url || '') || c.links > 0 });
  }
  return Array.from(groups, ([host, casinos]) => ({ host, casinos })).sort((a, b) => b.casinos.length - a.casinos.length || a.host.localeCompare(b.host));
}

// One click-ID name on every active link of a program (existing sub-parameter maps are kept).
export async function applyHandoffToProgram(db, programId, clickIdParam) {
  const { results } = await db.prepare(`SELECT id FROM tracking_links WHERE program_id = ? AND status = 'active'`).bind(programId).all();
  for (const l of results || []) {
    const existing = await getLinkHandoff(db, l.id);
    await setLinkHandoff(db, l.id, { click_id_param: clickIdParam, sub_param_map: existing?.sub_param_map ?? null });
  }
  return (results || []).length;
}
