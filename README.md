# trades-runtime

Private documentation and operations catalog for field-trades businesses.

**Author / identity:** Aziel Eliab only  
**Version:** 0.1.0  
**Role:** `trades-runtime`  
**License:** Apache-2.0  
**Visibility:** this repository stays **private**

trades-runtime covers HVAC, plumbing, electrical, sewer, and cross-trades jobs (tickets that span more than one of those). It is a sibling product to [aziel-runtime](https://github.com/AzielEliab/aziel-runtime), not a public Softwares suite and not a dump of FragGate engines.

v0 is a static GitHub Pages site plus a JSON catalog. Planned ops (`dispatch`, `estimate`, `work-order`, `inspection`, `closeout`) are named, not executed. There is no live Worker backend in this version.

## What this is not

- Not a public marketing site
- Not aziel-runtime and not a Softwares/engine catalog clone
- Not a production API, DOI registry, or hosted dispatcher

## Repository layout

```
docs/                 GitHub Pages root
  index.html          Homepage
  catalog/            Renders /v1/runtime.json
  trades/             HVAC, plumbing, electrical, sewer, cross-trades
  v1/runtime.json     Machine-readable catalog
  cite.json           Product identity
  llms.txt            Lite identity for assistants
  robots.txt          Disallow all indexing
.github/workflows/pages.yml
```

## How to view the private Pages site

Intended URL after Pages is enabled and `main` has deployed:

**https://azieleliab.github.io/trades-runtime/**

Keep the GitHub repository private. Do not change visibility to public.

### First-time Pages enable (repo owner)

1. Merge this site to `main` (or push `main` directly).
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Run the **Deploy GitHub Pages** workflow if it did not start on the merge.
5. If your plan supports it, set Pages **Visibility** to **Private** so only people with repo access can open the site while signed into GitHub.

Collaborators: you need read access to this private repo. Sign into GitHub, then open the Pages URL. If the site 404s, the workflow has not deployed yet or Pages is not set to GitHub Actions.

`docs/robots.txt` and `noindex` meta tags discourage crawlers. That is not access control. Prefer private Pages visibility when the plan allows it.

## Local preview

From the repo root:

```bash
python3 -m http.server 4173 --directory docs
```

Open http://127.0.0.1:4173/

No build step. Edit HTML/CSS/JSON in `docs/` and refresh.

## Catalog

[docs/v1/runtime.json](docs/v1/runtime.json) is the v0 source of truth:

| Field | Value |
| --- | --- |
| `product` | `trades-runtime` |
| `version` | `0.1.0` |
| `role` | `trades-runtime` |
| `author` / `identity` | Aziel Eliab |
| `modules` | `hvac`, `plumbing`, `electrical`, `sewer`, `cross-trades` |

Identity copies: [docs/cite.json](docs/cite.json), [docs/llms.txt](docs/llms.txt).

## How to contribute locally

1. Keep the repo private.
2. Create a branch from `main`.
3. Change only what the catalog needs: a trade page, `runtime.json`, or shared chrome in `docs/assets/`.
4. Preview with the local server above. Click every trade and the catalog page.
5. Do not add live Worker URLs, fake DOIs, or copied aziel-runtime engines.
6. Open a pull request. After merge, Pages deploys from `main`.

Author of record remains Aziel Eliab.

## License

Apache License 2.0. See [LICENSE](LICENSE).
