// Endpoint catalogue for capacity probes.
//
// Every route registered by the Core backend is represented here. Entries are
// classified so the sweep can be safe by default:
//   cls:        public | read | admin | write | upload | external
//   mutating:   true when the request changes persisted state
//   destructive: true when it deletes or clears data
//   external:   true when the handler reaches an external network/OS service
//   needs:      ids the preflight must resolve before the request is valid
//
// Path/body placeholders use {name} and are substituted from the preflight
// context: spaceId, itemId, groupId, userId, revision, packageId, ruleId.
// `skip` marks a route the sweep cannot build a valid request for; the reason
// is reported instead of guessed.

export const CATALOG = [
  // ---- static entry documents (served by the SPA fallback) ----
  { name: 'static_root', cls: 'public', method: 'GET', path: '/' },
  { name: 'static_login', cls: 'public', method: 'GET', path: '/login' },
  { name: 'static_index', cls: 'public', method: 'GET', path: '/index.html' },
  { name: 'static_manifest', cls: 'public', method: 'GET', path: '/manifest.webmanifest' },
  { name: 'static_sw', cls: 'public', method: 'GET', path: '/sw.js' },

  // ---- public API ----
  { name: 'about', cls: 'public', method: 'GET', path: '/api/about' },
  { name: 'capabilities', cls: 'public', method: 'GET', path: '/api/system/capabilities' },
  { name: 'oauth_config', cls: 'public', method: 'GET', path: '/api/oauth/config' },
  { name: 'login', cls: 'public', mutating: false, method: 'POST', path: '/api/login',
    body: { mail: '{adminUser}', password: '{adminPass}' } },

  // ---- theme (public reads) ----
  { name: 'theme_current', cls: 'public', method: 'GET', path: '/api/theme/v2/current' },
  { name: 'theme_effective', cls: 'public', method: 'GET', path: '/api/theme/v2/effective' },
  { name: 'theme_packages', cls: 'public', method: 'GET', path: '/api/theme/v2/packages' },
  { name: 'theme_package_by_id', cls: 'public', method: 'GET', path: '/api/theme/v2/package/{packageId}' },
  { name: 'theme_revision', cls: 'public', method: 'GET', path: '/api/theme/v2/revisions/{revision}' },
  { name: 'theme_asset', cls: 'public', method: 'GET', path: '/api/theme/v2/assets/{revision}/index.js',
    skip: 'needs a real asset path from package metadata' },

  // ---- authenticated reads ----
  { name: 'user_getUser', cls: 'read', method: 'GET', path: '/api/user/getUser', auth: 'admin' },
  { name: 'userconfig_get', cls: 'read', method: 'GET', path: '/api/panel/userConfig/getConfig', auth: 'admin' },
  { name: 'spaces_list', cls: 'read', method: 'GET', path: '/api/spaces', auth: 'admin' },
  { name: 'space_search_config', cls: 'read', method: 'GET', path: '/api/spaces/{spaceId}/search-config', auth: 'admin' },
  { name: 'space_groups', cls: 'read', method: 'GET', path: '/api/spaces/{spaceId}/groups', auth: 'admin' },
  { name: 'space_items', cls: 'read', method: 'GET', path: '/api/spaces/{spaceId}/items', auth: 'admin' },
  { name: 'space_members', cls: 'read', method: 'GET', path: '/api/spaces/{spaceId}/members', auth: 'admin' },
  { name: 'space_public', cls: 'read', method: 'GET', path: '/api/spaces/{spaceId}/public', auth: 'admin' },
  { name: 'space_oidc_groups', cls: 'read', method: 'GET', path: '/api/spaces/{spaceId}/oidc-groups', auth: 'admin' },
  { name: 'bookmarks_export', cls: 'read', method: 'GET', path: '/api/spaces/{spaceId}/bookmarks/export', auth: 'admin' },
  { name: 'theme_mine', cls: 'read', method: 'GET', path: '/api/theme/v2/mine', auth: 'admin' },
  { name: 'theme_preference', cls: 'read', method: 'GET', path: '/api/theme/v2/preference', auth: 'admin' },
  { name: 'theme_space', cls: 'read', method: 'GET', path: '/api/theme/v2/space/{spaceId}', auth: 'admin' },
  { name: 'theme_grants', cls: 'read', method: 'GET', path: '/api/theme/v2/grants/{revision}', auth: 'admin' },

  // ---- authenticated POST reads (no persisted change) ----
  { name: 'monitor_snapshot', cls: 'read', method: 'POST', path: '/api/system/monitor/getSnapshot', auth: 'admin', body: {} },
  { name: 'monitor_enable', cls: 'read', method: 'POST', path: '/api/system/monitor/getEnableStatus', auth: 'admin', body: {} },
  { name: 'monitor_mountpoints', cls: 'read', method: 'POST', path: '/api/system/monitor/getDiskMountpoints', auth: 'admin', body: {} },
  { name: 'monitor_disk_state', cls: 'read', method: 'POST', path: '/api/system/monitor/getDiskStateByPath', auth: 'admin', body: { path: '/' } },

  // ---- admin reads ----
  { name: 'file_getList', cls: 'admin', method: 'GET', path: '/api/file/getList', auth: 'admin' },
  { name: 'users_getList', cls: 'admin', method: 'GET', path: '/api/panel/users/getList', auth: 'admin' },
  { name: 'theme_admin_packages', cls: 'admin', method: 'GET', path: '/api/theme/v2/admin/packages', auth: 'admin' },
  { name: 'theme_admin_revisions', cls: 'admin', method: 'GET', path: '/api/theme/v2/admin/revisions', auth: 'admin' },
  { name: 'theme_admin_audit', cls: 'admin', method: 'GET', path: '/api/theme/v2/admin/audit', auth: 'admin' },
  { name: 'theme_admin_trusted', cls: 'admin', method: 'GET', path: '/api/theme/v2/admin/trusted/{revision}', auth: 'admin' },

  // ---- external / OS backed ----
  { name: 'itemicon_favicon', cls: 'external', method: 'POST', path: '/api/panel/itemIcon/getSiteFavicon', auth: 'admin',
    body: { url: 'https://example.com' }, skip: 'reaches the public internet, not a Core bottleneck' },
  { name: 'file_s3', cls: 'external', method: 'GET', path: '/api/file/s3/x', skip: 'S3-backed object read, not local' },

  // ---- writes (mutating) ----
  { name: 'space_items_create', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/{spaceId}/items', auth: 'admin',
    body: { title: 'perf-item', url: 'https://example.com', itemIconGroupId: '{groupId}', description: '', openMethod: 0, sort: 0 } },
  { name: 'space_items_update', cls: 'write', mutating: true, method: 'PUT', path: '/api/spaces/{spaceId}/items/{itemId}', auth: 'admin',
    body: { title: 'perf-item-upd', url: 'https://example.com', itemIconGroupId: '{groupId}', description: '', openMethod: 0, sort: 0 }, needs: ['itemId'] },
  { name: 'space_items_sort', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/{spaceId}/items/sort', auth: 'admin',
    body: { groupId: '{groupId}', sortItems: [{ id: '{itemId}', sort: 1 }] } },
  { name: 'space_items_delete', cls: 'write', mutating: true, destructive: true, method: 'DELETE', path: '/api/spaces/{spaceId}/items/{itemId}', auth: 'admin',
    needs: ['itemId'], skip: 'delete churn on a shared entity; covered by create+clear' },
  { name: 'space_groups_create', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/{spaceId}/groups', auth: 'admin',
    body: { title: 'perf-group', icon: '' } },
  { name: 'space_groups_sort', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/{spaceId}/groups/sort', auth: 'admin',
    body: { sortGroups: [] }, skip: 'requires every sibling group in the payload; racy under concurrent group creation' },
  { name: 'space_layout_arrange', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/{spaceId}/layout/arrange', auth: 'admin',
    body: { items: [{ id: '{itemId}', itemIconGroupId: '{groupId}', sort: 1 }] } },
  { name: 'space_search_config_set', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/{spaceId}/search-config', auth: 'admin',
    body: { currentSearchEngine: { iconSrc: '', title: 'Google', url: 'https://www.google.com/search?q=%s' } } },
  { name: 'space_public_set', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/{spaceId}/public', auth: 'admin',
    body: { enabled: false, mode: 'direct', publicId: 'perf-public', accessCode: '' } },
  { name: 'space_rename', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/{spaceId}', auth: 'admin',
    body: { name: 'perf-space' } },
  { name: 'space_clear', cls: 'write', mutating: true, destructive: true, method: 'POST', path: '/api/spaces/{spaceId}/clear', auth: 'admin',
    skip: 'destructive; run manually against a throwaway space only' },
  { name: 'space_teams_create', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/teams', auth: 'admin',
    body: { name: 'perf-team', description: '' }, skip: 'creates spaces that must be deleted; run manually' },
  { name: 'space_copy', cls: 'write', mutating: true, method: 'POST', path: '/api/spaces/{spaceId}/copy', auth: 'admin',
    body: { name: 'perf-copy' }, skip: 'creates a space clone; run manually' },
  { name: 'userconfig_set', cls: 'write', mutating: true, method: 'POST', path: '/api/panel/userConfig/setConfig', auth: 'admin',
    body: { config: '{}' } },
  { name: 'moduleconfig_save', cls: 'write', mutating: true, method: 'POST', path: '/api/system/moduleConfig/save', auth: 'admin',
    body: {}, skip: 'requires a real module config payload' },
  { name: 'user_updateInfo', cls: 'write', mutating: true, method: 'POST', path: '/api/user/updateInfo', auth: 'admin',
    body: {}, skip: 'would rename the admin account; run manually' },
  { name: 'theme_preference_set', cls: 'write', mutating: true, method: 'POST', path: '/api/theme/v2/preference', auth: 'admin',
    body: { theme: 'org.yin.default' } },
  { name: 'theme_space_set', cls: 'write', mutating: true, method: 'PUT', path: '/api/theme/v2/space/{spaceId}', auth: 'admin',
    body: { packageId: '{packageId}' } },

  // ---- uploads ----
  { name: 'file_uploadImg', cls: 'upload', mutating: true, method: 'POST', path: '/api/file/uploadImg', auth: 'admin',
    multipart: true, skip: 'needs a real multipart image part' },
  { name: 'theme_wallpaper_upload', cls: 'upload', mutating: true, method: 'POST', path: '/api/theme/v2/wallpaper/web', auth: 'admin',
    multipart: true, skip: 'needs a real multipart image part' },

  // ---- admin writes (mostly destructive/stateful) ----
  { name: 'panel_users_create', cls: 'write', mutating: true, method: 'POST', path: '/api/panel/users/create', auth: 'admin',
    body: { name: 'perf-user', mail: 'perf-user@example.com', password: 'Perf-user-1', role: 2 }, skip: 'creates accounts; run manually' },
  { name: 'theme_admin_install', cls: 'write', mutating: true, method: 'POST', path: '/api/theme/v2/admin/install', auth: 'admin',
    body: {}, skip: 'installs a theme package; run manually' },
  { name: 'theme_admin_default', cls: 'write', mutating: true, method: 'POST', path: '/api/theme/v2/admin/default', auth: 'admin',
    body: { id: 'org.yin.default' }, skip: 'changes the system default theme' },
];

export function resolveContextTemplate(value, ctx) {
  if (typeof value === 'string') {
    const exact = value.match(/^\{(\w+)\}$/);
    if (exact && ctx[exact[1]] !== undefined) {
      const v = ctx[exact[1]];
      return /^\d+$/.test(String(v)) ? Number(v) : String(v);
    }
    return value.replace(/\{(\w+)\}/g, (_, key) => (ctx[key] !== undefined ? String(ctx[key]) : `{${key}}`));
  }
  if (Array.isArray(value)) return value.map((v) => resolveContextTemplate(v, ctx));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveContextTemplate(v, ctx);
    return out;
  }
  return value;
}

// Build a concrete k6 request descriptor, or throw when the preflight context
// cannot satisfy the endpoint.
export function buildRequest(ep, ctx) {
  const url = resolveContextTemplate(ep.path, ctx);
  if (/\{\w+\}/.test(url)) throw new Error(`unresolved placeholder in path: ${url}`);
  let body = null;
  if (ep.body !== undefined && ep.body !== null) {
    body = JSON.stringify(resolveContextTemplate(ep.body, ctx));
  }
  return { name: ep.name, method: ep.method, url, body };
}
