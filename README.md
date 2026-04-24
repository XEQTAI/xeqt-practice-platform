# XEQT Practice Platform

Multi-tenant medical practice automation platform. Each practice gets a branded `{slug}.xeqt.co.za` subdomain with patient intake, admin dashboard, and AI receptionist integration.

## Architecture

```
*.xeqt.co.za  →  Cloudflare Pages (wildcard DNS)
                  └── functions/_middleware.js  (Cloudflare Worker)
                        ├── xeqt.co.za          → /practicemanager/ (marketing site)
                        ├── admin.xeqt.co.za    → /practicemanager/admin/super.html
                        └── {slug}.xeqt.co.za   → /template/ (patient intake, injected with practice config)
```

## Structure

```
├── functions/
│   └── _middleware.js       # Cloudflare Pages Function — subdomain router
├── practicemanager/
│   ├── index.html           # XEQT marketing site + login portal
│   └── admin/
│       ├── dashboard.html   # Practice admin dashboard
│       └── super.html       # XEQT super admin
├── template/
│   ├── index.html           # Patient landing (clinician selector)
│   ├── patient-form.html    # Dr Inus Snyman intake form
│   └── caitlin-taute-intake.html  # Caitlin Taute intake form
├── public/
│   └── practices.json       # Practice registry
└── wrangler.toml            # Cloudflare config
```

## Deploy to Cloudflare Pages

1. Push this repo to GitHub
2. Connect to Cloudflare Pages → New Project → Connect GitHub repo
3. Build settings: no build command, output directory = `/`
4. Add custom domain `xeqt.co.za` + wildcard `*.xeqt.co.za`
5. Set wildcard DNS `*.xeqt.co.za → your-pages-project.pages.dev` (CNAME)

## Credentials

| User | Username | Password | Access |
|------|----------|----------|--------|
| Erik (Super Admin) | `erik` | `Xeqt2026` | Full platform |
| Snyman Periodontics | `drisnyman` | `snyman2024` | Practice dashboard |

## Adding a Practice

Log in as super admin → Practices → Add Practice. Or edit `public/practices.json` directly and push to GitHub.

## Local Development

```bash
npx wrangler pages dev . --compatibility-date 2024-01-01
```
