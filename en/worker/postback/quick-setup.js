// "Set it up for me": makes sure a program, an account and (optionally) a tracking link exist for a casino that so far only has its own
// affiliate URL, so a postback integration can be created without visiting four admin pages first. Everything found is reused; nothing is
// ever deleted or renamed, and a casino that already has a link for the program keeps it.
import { createPartner, generateUniquePartnerSlug } from '../database/affiliate-partners.js';
import { createProgram, getProgramCasinos, setProgramCasinos } from '../database/affiliate-programs.js';
import { createAccount } from '../database/affiliate-accounts.js';
import { createTrackingLink, getLinkHandoff, setLinkHandoff } from '../database/tracking-links.js';

const cleanName = (n) => String(n || '').replace(/\s*\(.*$/, '').trim();

export async function quickSetup(db, { programName, programId = null, casinoId = null, clickIdParam = null, userId = null }) {
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

  if (casinoId) {
    const casino = await db.prepare('SELECT id, name, affiliate_url FROM casinos WHERE id = ?').bind(casinoId).first();
    if (!casino) throw new Error('Casino not found.');
    const have = (await getProgramCasinos(db, program.id) || []).map((c) => c.casino_id ?? c.id);
    if (!have.includes(casino.id)) await setProgramCasinos(db, program.id, [...have, casino.id]);

    let link = await db.prepare(`SELECT id, tracking_code FROM tracking_links WHERE casino_id = ? AND program_id = ? AND status = 'active' ORDER BY id LIMIT 1`).bind(casino.id, program.id).first();
    if (link) out.reused.push('tracking_link');
    else {
      if (!/^https:\/\//i.test(casino.affiliate_url || '')) throw new Error(`${casino.name} has no https affiliate URL to turn into a tracking link. Add one on the casino first.`);
      link = await createTrackingLink(db, { internal_name: `${casino.name} - ${program.name}`, destination_url: casino.affiliate_url, casino_id: casino.id, partner_id: program.partner_id, program_id: program.id, created_by: userId });
      out.created.push('tracking_link');
    }
    if (clickIdParam) {
      const existing = await getLinkHandoff(db, link.id);
      await setLinkHandoff(db, link.id, { click_id_param: clickIdParam, sub_param_map: existing?.sub_param_map ?? null });
    }
    out.tracking_link = { id: link.id, tracking_code: link.tracking_code, casino: casino.name };
  }
  return out;
}
