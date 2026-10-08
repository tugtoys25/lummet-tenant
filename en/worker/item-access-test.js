// =====================================================
// item-access-test.js — Verification script
// Run from Workers console or a test endpoint.
// Does NOT modify production data.
// =====================================================

import {
  getItemScope,
  setUserItemAccess,
  deleteUserItemAccess,
  canAccessItem,
  getAccessibleWhereClause,
  assignItem,
  unassignItem,
  getSystemDefaultScope,
  setSystemDefaultScope,
  getResourceConfig,
  getRegisteredResources
} from './database/item-access.js';

export async function runItemAccessTests(env) {
  const db = env.DB;
  const results = [];

  function log(test, passed, detail) {
    results.push({ test, passed, detail });
    console.log(`${passed ? '✅' : '❌'} ${test}: ${detail || ''}`);
  }

  // ── 1. Resource Registry ──
  const resources = getRegisteredResources();
  log('Resource registry has 6 resources', resources.length === 6,
    `Found: ${resources.join(', ')}`);

  for (const resource of resources) {
    const config = getResourceConfig(resource);
    log(`${resource} has ownerColumn`, !!config?.ownerColumn,
      `ownerColumn: ${config?.ownerColumn}`);
  }

  // ── 2. System default scope ──
  const defaultScope = await getSystemDefaultScope(db);
  log('System default scope is readable',
    ['all', 'own', 'assigned', 'none'].includes(defaultScope),
    `Got: ${defaultScope}`);

  // ── 3. Scope with no row = system default ──
  const noRowScope = await getItemScope(db, 99999, 'casinos', 'read');
  log('No row returns system default', noRowScope === defaultScope,
    `Got: ${noRowScope}, expected: ${defaultScope}`);

  // ── 4. Set and read scope ──
  await setUserItemAccess(db, 99999, 'casinos', 'read', 'own');
  const ownScope = await getItemScope(db, 99999, 'casinos', 'read');
  log('Set scope to "own" and read back', ownScope === 'own', `Got: ${ownScope}`);

  // ── 5. canAccessItem with 'own' scope ──
  const adminUser = { user_id: 1, role: 'admin' };
  const editorUser = { user_id: 99999, role: 'editor' };

  const adminAccess = await canAccessItem(db, adminUser, 'casinos', 'read',
    { id: 1, created_by: 99999 });
  log('Admin bypasses item-level check', adminAccess === true, `Got: ${adminAccess}`);

  const ownAccess = await canAccessItem(db, editorUser, 'casinos', 'read',
    { id: 1, created_by: 99999 });
  log('Own scope: user accesses own record', ownAccess === true, `Got: ${ownAccess}`);

  const notOwnAccess = await canAccessItem(db, editorUser, 'casinos', 'read',
    { id: 2, created_by: 88888 });
  log('Own scope: user denied other record', notOwnAccess === false, `Got: ${notOwnAccess}`);

  const legacyAccess = await canAccessItem(db, editorUser, 'casinos', 'read',
    { id: 3, created_by: null });
  log('Own scope: legacy record (NULL) denied', legacyAccess === false, `Got: ${legacyAccess}`);

  // ── 6. 'none' scope ──
  await setUserItemAccess(db, 99999, 'casinos', 'read', 'none');
  const noneAccess = await canAccessItem(db, editorUser, 'casinos', 'read',
    { id: 1, created_by: 99999 });
  log('None scope: denied even for own record', noneAccess === false, `Got: ${noneAccess}`);

  // ── 7. 'all' scope ──
  await setUserItemAccess(db, 99999, 'casinos', 'read', 'all');
  const allAccessOwn = await canAccessItem(db, editorUser, 'casinos', 'read',
    { id: 1, created_by: 99999 });
  const allAccessOther = await canAccessItem(db, editorUser, 'casinos', 'read',
    { id: 2, created_by: 88888 });
  log('All scope: own record allowed', allAccessOwn === true);
  log('All scope: other record allowed', allAccessOther === true);

  // ── 8. 'assigned' scope ──
  await setUserItemAccess(db, 99999, 'casinos', 'read', 'assigned');
  await assignItem(db, 99999, 'casinos', 42, 1);

  const assignedAccess = await canAccessItem(db, editorUser, 'casinos', 'read',
    { id: 42, created_by: 88888 });
  log('Assigned scope: assigned item allowed', assignedAccess === true);

  const notAssignedAccess = await canAccessItem(db, editorUser, 'casinos', 'read',
    { id: 99, created_by: 88888 });
  log('Assigned scope: non-assigned item denied', notAssignedAccess === false);

  await unassignItem(db, 99999, 'casinos', 42);
  const unassignedAccess = await canAccessItem(db, editorUser, 'casinos', 'read',
    { id: 42, created_by: 88888 });
  log('Assigned scope: unassigned item denied', unassignedAccess === false);

  // ── 9. getAccessibleWhereClause (SQL builder) ──
  await setUserItemAccess(db, 99999, 'casinos', 'read', 'own');
  const ownCondition = await getAccessibleWhereClause(db, editorUser, 'casinos', 'read', 'c');
  log('Own condition generates WHERE clause',
    ownCondition.condition.includes('created_by') && ownCondition.params.length === 1,
    `Condition: ${ownCondition.condition}, Params: ${JSON.stringify(ownCondition.params)}`);

  const allCondition = await getAccessibleWhereClause(db, adminUser, 'casinos', 'read', 'c');
  log('Admin condition is empty (no restriction)',
    allCondition.condition === '' && allCondition.params.length === 0,
    `Condition: "${allCondition.condition}"`);

  await setUserItemAccess(db, 99999, 'casinos', 'read', 'none');
  const noneCondition = await getAccessibleWhereClause(db, editorUser, 'casinos', 'read', 'c');
  log('None condition is 1=0', noneCondition.condition === '1=0',
    `Condition: "${noneCondition.condition}"`);

  await setUserItemAccess(db, 99999, 'casinos', 'read', 'assigned');
  await assignItem(db, 99999, 'casinos', 42, 1);
  const assignedCondition = await getAccessibleWhereClause(db, editorUser, 'casinos', 'read', 'c');
  log('Assigned condition has IN subquery',
    assignedCondition.condition.includes('IN') &&
    assignedCondition.condition.includes('item_access_assignments'),
    `Condition: ${assignedCondition.condition}`);

  // ── 10. Unregistered resource ──
  const unregCondition = await getAccessibleWhereClause(db, editorUser, 'categories', 'read', '');
  log('Unregistered resource = no restriction',
    unregCondition.condition === '', `Condition: "${unregCondition.condition}"`);

  // ── 11. No user ──
  const noUserCondition = await getAccessibleWhereClause(db, null, 'casinos', 'read', '');
  log('No user = deny all (1=0)',
    noUserCondition.condition === '1=0', `Condition: "${noUserCondition.condition}"`);

  // ── 12. System default scope change ──
  const originalDefault = await getSystemDefaultScope(db);
  await setSystemDefaultScope(db, 'none');
  const changedDefault = await getSystemDefaultScope(db);
  log('System default can be changed to none', changedDefault === 'none');

  // Verify no-row scope now returns 'none'
  await deleteUserItemAccess(db, 99999, 'casinos', 'read');
  const noRowAfterChange = await getItemScope(db, 99999, 'casinos', 'read');
  log('No row returns new system default (none)', noRowAfterChange === 'none',
    `Got: ${noRowAfterChange}`);

  // Restore original default
  await setSystemDefaultScope(db, originalDefault);

  // ── Cleanup ──
  await deleteUserItemAccess(db, 99999, 'casinos', 'read');
  await unassignItem(db, 99999, 'casinos', 42);

  // ── Summary ──
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log(`${'='.repeat(50)}`);

  return { passed, failed, total: results.length, results };
}
