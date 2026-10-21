import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createApp } from '../apps/api/src/app.js';
export function routeTable(app) {
  const rows = [];
  function visit(stack, prefix = '', inheritedAuth = false) {
    let authenticated = inheritedAuth;
    for (const layer of stack) {
      if (layer.handle.requiresAuth) authenticated = true;
      if (layer.route) {
        const handlers = layer.route.stack.map((entry) => entry.handle);
        rows.push({
          path: prefix + layer.route.path,
          methods: Object.keys(layer.route.methods),
          authenticated:
            authenticated || handlers.some((fn) => fn.requiresAuth),
          roles: handlers.find((fn) => fn.allowedRoles)?.allowedRoles || null,
        });
      } else if (layer.handle.stack) {
        // All mounted module routers in createApp use the /api prefix.
        visit(layer.handle.stack, '/api', authenticated);
      }
    }
  }
  visit(app._router.stack);
  return rows;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const rows = routeTable(
    createApp({ CLIENT_ORIGIN: 'http://localhost', NODE_ENV: 'development' }),
  );
  await writeFile(
    'docs/route-access.md',
    `# Generated route access table\n\nRun \`node tools/route-table.js\`. Roles come from the actual Express middleware, not a second handwritten policy. Authenticated routes without an explicit role list still enforce assigned-store access in their handlers. The development simulator is absent in production.\n\n| Method | Route | Authentication | Roles |\n|---|---|---|---|\n${rows.map((r) => `| ${r.methods.join(', ').toUpperCase()} | \`${r.path}\` | ${r.authenticated ? 'JWT' : 'Public or device/link credential'} | ${r.roles?.join(', ') || 'Handler/store checks'} |`).join('\n')}\n`,
  );
}
