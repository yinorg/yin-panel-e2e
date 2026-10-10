// Shared HTTP helpers for the capacity sweep: authentication and id discovery.

const TIMEOUT_MS = 15000;

async function req(base, path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

export async function login(base, mail, password) {
  const r = await req(base, '/api/login', { method: 'POST', body: { mail, password } });
  const token = r.json && r.json.data && (r.json.data.token || r.json.data.Token);
  if (!token) throw new Error(`login failed for ${mail}: status=${r.status}`);
  return token;
}

function firstArray(...candidates) {
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (c && Array.isArray(c.list)) return c.list;
    if (c && Array.isArray(c.items)) return c.items;
    if (c && Array.isArray(c.records)) return c.records;
    if (c && Array.isArray(c.data)) return c.data;
  }
  return [];
}

function idOf(obj) {
  if (!obj || typeof obj !== 'object') return undefined;
  return obj.id ?? obj.ID ?? obj.Id;
}

export async function createThrowawaySpace(base, token, name) {
  await req(base, '/api/spaces/teams', { method: 'POST', token, body: { name, description: 'perf probe throwaway' } });
  const spaces = firstArray((await req(base, '/api/spaces', { token })).json?.data);
  const found = spaces.find((s) => String(s.name || '').toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`created throwaway space "${name}" not found`);
  return String(idOf(found));
}

export async function deleteSpace(base, token, id) {
  await req(base, `/api/spaces/${id}`, { method: 'DELETE', token });
}

export async function discover(base, env, opts = {}) {
  const ctx = {
    baseUrl: base,
    adminUser: env.YIN_PANEL_TEST_ADMIN_USER,
    adminPass: env.YIN_PANEL_TEST_ADMIN_PASSWORD,
    memberUser: env.YIN_PANEL_TEST_MEMBER_USER,
    memberPass: env.YIN_PANEL_TEST_MEMBER_PASSWORD,
    spaceId: env.YIN_PANEL_TEST_SPACE_ID,
    tokens: {},
    notes: [],
  };

  ctx.tokens.admin = await login(base, ctx.adminUser, ctx.adminPass);
  if (ctx.memberUser && ctx.memberPass) {
    try { ctx.tokens.member = await login(base, ctx.memberUser, ctx.memberPass); }
    catch (e) { ctx.notes.push(`member login failed: ${e.message}`); }
  }

  // Space: prefer an explicit override, then the configured test space, else
  // the first visible one.
  const spaces = firstArray((await req(base, '/api/spaces', { token: ctx.tokens.admin })).json?.data);
  if (opts.spaceIdOverride) {
    ctx.spaceId = String(opts.spaceIdOverride);
  } else if (env.YIN_PANEL_TEST_SPACE_ID) {
    ctx.spaceId = env.YIN_PANEL_TEST_SPACE_ID;
  } else if (spaces.length) {
    ctx.spaceId = String(idOf(spaces[0]));
  }
  if (!ctx.spaceId) throw new Error('could not resolve a space id');

  // Ensure a group exists, then an item, so update/sort routes have real ids.
  let groups = firstArray((await req(base, `/api/spaces/${ctx.spaceId}/groups`, { token: ctx.tokens.admin })).json?.data);
  if (!groups.length) {
    await req(base, `/api/spaces/${ctx.spaceId}/groups`, {
      method: 'POST', token: ctx.tokens.admin, body: { title: 'perf-probe-group', icon: '' },
    });
    ctx.notes.push('created a probe group because the space had none');
    groups = firstArray((await req(base, `/api/spaces/${ctx.spaceId}/groups`, { token: ctx.tokens.admin })).json?.data);
  }
  ctx.groupId = idOf(groups[0]);

  let items = firstArray((await req(base, `/api/spaces/${ctx.spaceId}/items`, { token: ctx.tokens.admin })).json?.data);
  if (!items.length && ctx.groupId !== undefined) {
    await req(base, `/api/spaces/${ctx.spaceId}/items`, {
      method: 'POST', token: ctx.tokens.admin,
      body: { title: 'perf-probe-item', url: 'https://example.com', itemIconGroupId: ctx.groupId, description: '', openMethod: 0, sort: 0 },
    });
    ctx.notes.push('created a probe item because the space had none');
    items = firstArray((await req(base, `/api/spaces/${ctx.spaceId}/items`, { token: ctx.tokens.admin })).json?.data);
  }
  ctx.itemId = idOf(items[0]);

  const members = firstArray((await req(base, `/api/spaces/${ctx.spaceId}/members`, { token: ctx.tokens.admin })).json?.data);
  const memberEntry = members.find((m) => (m.mail || m.user?.mail) !== ctx.adminUser) || members[0];
  ctx.userId = idOf(memberEntry) ?? memberEntry?.userID ?? memberEntry?.userId;

  const pkgs = firstArray((await req(base, '/api/theme/v2/packages', { token: ctx.tokens.admin })).json?.data);
  ctx.packageId = pkgs[0]?.id;
  ctx.revision = pkgs[0]?.revision;
  if (!ctx.packageId) ctx.revision = ctx.revision ?? 'org.yin.default';

  return ctx;
}

export { req, firstArray, idOf };
