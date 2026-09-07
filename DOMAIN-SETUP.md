# Pointing a custom domain at this site

The site is served by GitHub Pages. `CNAME` in this repo already claims
`diegocrisafulli.dev`, which is the half I can do. The rest needs your
registrar and your GitHub account.

## 1. Buy the domain

Any registrar. Cloudflare and Namecheap are the usual cheap ones for `.dev`
(around $12–15/year). `.dev` is on the HSTS preload list, so it is HTTPS-only
by design — which is what you want anyway.

## 2. Point DNS at GitHub

Add these five records at the registrar:

| Type  | Name  | Value                 |
|-------|-------|-----------------------|
| A     | @     | 185.199.108.153       |
| A     | @     | 185.199.109.153       |
| A     | @     | 185.199.110.153       |
| A     | @     | 185.199.111.153       |
| CNAME | www   | diegocrisafu.github.io |

## 3. Turn it on in GitHub

Repository → Settings → Pages → Custom domain → `diegocrisafulli.dev` → Save.
Then tick **Enforce HTTPS** once the certificate is issued, which takes a few
minutes to an hour.

## If you use a different domain

Change `CNAME`, and change the absolute URLs in these files, which are used
for canonical tags, Open Graph and structured data:

- `index.html`
- `scouting.html` (generated — edit `tools/build-scouting.js` instead)
- `404.html`
- `sitemap.xml`
- `robots.txt`
- `llms.txt`

A single find-and-replace of `diegocrisafulli.dev` covers all of them.
