/**
 * XEQT Practice Platform — Cloudflare Pages Middleware
 *
 * Handles subdomain routing for *.xeqt.co.za:
 *   pm.xeqt.co.za         → practice manager portal and login
 *   admin.xeqt.co.za      → super admin panel
 *   {slug}.xeqt.co.za     → patient intake for that practice
 *
 * xeqt.co.za (apex) is hosted separately and is NOT served by this project.
 *
 * Deployed as a Cloudflare Pages Function (_middleware.js at root of /functions)
 */

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Inject super admin credentials from Cloudflare env vars (never hardcoded)
  // Set XEQT_SUPER_USER and XEQT_SUPER_PASS in Cloudflare Pages → Settings → Env Variables
  const superUsers = (env.XEQT_SUPER_USER && env.XEQT_SUPER_PASS)
    ? [{ username: env.XEQT_SUPER_USER, password: env.XEQT_SUPER_PASS, name: 'Super Admin', isSuper: true }]
    : [];
  const hostname = url.hostname; // e.g. drisnyman.xeqt.co.za

  // Extract subdomain
  const parts = hostname.split('.');
  // e.g. ['drisnyman','xeqt','co','za'] => subdomain = 'drisnyman'
  // For xeqt.co.za alone => parts = ['xeqt','co','za'] => no subdomain
  const isApex = parts.length <= 3; // xeqt.co.za has 3 parts
  const subdomain = isApex ? null : parts[0];

  // ── Apex domain → not served here, xeqt.co.za is a separate site ─────
  if (!subdomain || subdomain === 'www') {
    return new Response(null, { status: 404 });
  }

  // ── pm subdomain → practice manager portal ───────────────────────────
  if (subdomain === 'pm') {
    const pmUrl = new URL(url);
    pmUrl.pathname = '/practicemanager/index.html';
    const rewritten = new Request(pmUrl.toString(), request);
    return next(rewritten);
  }

  // ── admin subdomain → super admin panel ──────────────────────────────
  if (subdomain === 'admin') {
    const adminUrl = new URL(url);
    adminUrl.pathname = '/practicemanager/admin/super.html';
    const rewritten = new Request(adminUrl.toString(), request);
    return next(rewritten);
  }

  // ── Practice subdomain → load practice and serve patient intake ───────
  try {
    // Fetch practices config
    const practicesUrl = new URL('/public/practices.json', url.origin);
    const practicesRes = await fetch(practicesUrl.toString());
    const practicesData = await practicesRes.json();
    const practice = (practicesData.practices || []).find(p => p.slug === subdomain);

    if (!practice) {
      return new Response(notFoundPage(subdomain), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (practice.status !== 'active') {
      return new Response(inactivePage(practice), {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Route to the right page based on path
    const path = url.pathname;

    // Patient intake landing (clinician selector)
    if (path === '/' || path === '/intake' || path === '') {
      const templateUrl = new URL('/template/index.html', url.origin);
      const templateRes = await fetch(templateUrl.toString());
      let html = await templateRes.text();
      // Inject practice config — passwords are never included
      html = injectPracticeConfig(html, practice, superUsers);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Practice admin dashboard
    if (path === '/admin' || path === '/admin/') {
      const adminUrl = new URL('/practicemanager/admin/dashboard.html', url.origin);
      const adminRes = await fetch(adminUrl.toString());
      let html = await adminRes.text();
      html = injectPracticeConfig(html, practice);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Specific clinician forms
    if (path.startsWith('/form/')) {
      const clinicianId = path.replace('/form/', '').replace(/\/$/, '');
      const clinician = (practice.clinicians || []).find(c => c.id === clinicianId);
      if (clinician && clinician.formFile) {
        const formUrl = new URL(`/template/${clinician.formFile}`, url.origin);
        const formRes = await fetch(formUrl.toString());
        let html = await formRes.text();
        html = injectPracticeConfig(html, practice);
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    }

    // Default: pass through to static assets for this path
    return next();

  } catch (err) {
    console.error('XEQT Worker error:', err);
    return next();
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────

/**
 * Inject practice config as window.__XEQT_PRACTICE__ so patient
 * templates can read it without a backend API call.
 * Passwords and sensitive fields are never included.
 */
function injectPracticeConfig(html, practice, superUsers = []) {
  // Strip any sensitive fields before injecting
  const safeConfig = {
    id: practice.id,
    slug: practice.slug,
    name: practice.name,
    type: practice.type,
    email: practice.email,
    phone: practice.phone,
    clinicians: (practice.clinicians || []).filter(c => c.active),
    googleSheetId: practice.googleSheetId,
    // Never include: adminUsername, adminPasswordHash, googleSheetUrl (internal)
  };
  // Super users injected only for the marketing/login page, not patient pages
  const safeSuperUsers = superUsers.map(u => ({ username: u.username, name: u.name, isSuper: true }));
  const injection = `<script>window.__XEQT_PRACTICE__ = ${JSON.stringify(safeConfig)};window.__XEQT_SUPER_USERS__ = ${JSON.stringify(safeSuperUsers)};<\/script>`;
  // Insert just before </head>
  if (html.includes('</head>')) {
    return html.replace('</head>', injection + '</head>');
  }
  // Fallback: prepend
  return injection + html;
}

function notFoundPage(slug) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not Found — XEQT</title>
  <style>body{background:#0a0805;color:#f0ebe0;font-family:'Jost',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;}
  h1{font-family:Georgia,serif;font-size:32px;font-weight:300;color:#d4aa72;}p{color:#a09070;font-size:14px;}a{color:#b8935a;}</style></head>
  <body><h1>Practice Not Found</h1><p>No practice configured at <strong>${slug}.xeqt.co.za</strong>.</p>
  <a href="https://xeqt.co.za">← Back to XEQT</a></body></html>`;
}

function inactivePage(practice) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${practice.name} — Temporarily Unavailable</title>
  <style>body{background:#0a0805;color:#f0ebe0;font-family:'Jost',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;}
  h1{font-family:Georgia,serif;font-size:32px;font-weight:300;color:#d4aa72;}p{color:#a09070;font-size:14px;text-align:center;}a{color:#b8935a;}</style></head>
  <body><h1>${practice.name}</h1><p>This practice is temporarily unavailable.<br/>Please contact your practice directly.</p>
  ${practice.phone ? `<p>${practice.phone}</p>` : ''}
  <a href="https://xeqt.co.za">← XEQT Platform</a></body></html>`;
}
