# Releasing

The live site still loads commit-pinned jsDelivr URLs. This file is how those pins move to a `v1` tag. Nothing here pushes a tag, purges the CDN, or edits Webflow.

Checked 28/10/2026 against `origin/main` `f013cd76d98e66aab3d97a554e4c2eeb640d71cc`. `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishCookie.js` returned 404. There are no tags on the repo yet.

## What the site loads

Webflow custom code, read from the public HTML. Each current file is byte-for-byte the same blob as on `f013cd7` (so `@1` at that commit does not change behavior). `curl -fsS -o /dev/null -w '%{http_code}\n'` returned 200 for every current URL and for the same path at `f013cd7`.

| Role | Where | Current URL | New URL |
| --- | --- | --- | --- |
| Cookie banner | Every page checked | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@c872501833ccd771e592c55f75208f4d83499b01/scripts/MoorishCookie.js` | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishCookie.js` |
| Pagination | Every page checked | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@cd65752122ccd2bab996877d8c696318de86acd6/scripts/MoorishPaginate.js` | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishPaginate.js` |
| Comment counts | Every page checked | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@10731fa1e7c382a2a9aa1f51f2f45fa2a9af555a/scripts/MoorishQus.js` | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishQus.js` |
| Reading progress | Every page checked | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@aad337e/scripts/MoorishProgress.js` | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishProgress.js` |
| In-browser agent tools | Every page checked | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@775ec3becd289c81030044015b2a957e4e5e39d1/scripts/MoorishWebMCP.js` | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishWebMCP.js` |
| Gallery | Article and news templates (`/articles/zellige`, `/news/ram-previsions-2026-eep`) | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@4b5cfc44e475288bf13e8afa1a4940ff55bd2d20/scripts/MoorishGallery.js` | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishGallery.js` |
| Gallery stylesheet | Same article and news templates | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@660ea2023c42a6a85e33379fbcf9769f085692c5/styles/mt-gallery.css` | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/styles/mt-gallery.css` |

Pages checked: `/`, `/en`, `/en/about`, `/en/articles`, `/articles`, `/search`, `/articles/zellige`, `/en/articles/bab-sebta`, `/news/ram-previsions-2026-eep`. Listing, about, and search pages do not include the gallery pair. The English article uses the same seven URLs.

`c872501` is only the cookie pin. At that commit, jsDelivr returned 200 for `scripts/MoorishCookie.js`, `scripts/MoorishPaginate.js`, `scripts/MoorishGallery.js`, `styles/mt-gallery.css`, and the retired `scripts/mt-gallery.js`. It returned 404 for `MoorishQus.js`, `MoorishProgress.js`, `MoorishWebMCP.js`, `MoorishPWA.js`, `pwa/sw.js`, and `pwa/sw-noop.js`. Do not point those paths at `c872501`. `scripts/mt-gallery.js` is not referenced by the live HTML and is gone from `main`.

Disqus `count.js` is Disqus, not this repo.

### PWA and push (not a Webflow script URL)

The footer loads `/pwa/app.js`, not jsDelivr. `/sw.js` is same-origin too. `/pwa/release.json` on 28/10/2026 was `{"app":"dff6414c309f586018643cc528b522f4f774a5c9"}`. These blobs at that commit match `main`:

| Path | Blob |
| --- | --- |
| `scripts/MoorishPWA.js` | `eb01b7b4c4d04aa83839346ac0c30946186d5d33` |
| `pwa/sw.js` | `469a4c603cb2795b6d01fba479595cb69cedc9f7` |
| `pwa/sw-noop.js` | `4970d60af6af80b49f69b065cfbdade68e6bf439` |

Push display lives in `pwa/sw.js`. The old `MoorishPush` script is not in the tree. The worker that proxies these files is not in this repo and is not changed here. Same-origin `/pwa/app.js` on the site is the worker's copy of `MoorishPWA.js` plus a small pin injection (live file is 23513 bytes, the git blob is 23454).

Other live blobs, same on the current pin and on `f013cd7`:

| Path | Blob |
| --- | --- |
| `scripts/MoorishCookie.js` | `be2c3bbd8ac34fd0157c4f48282d81bdc43dd9d8` |
| `scripts/MoorishPaginate.js` | `3bac67e70f06d880b8753bb65f02c594b448956f` |
| `scripts/MoorishGallery.js` | `d1b25c9f145cff854b495ac61dfb60e5049ee07f` |
| `styles/mt-gallery.css` | `28f395abd976d0362236f2ca7a5b0ccc2dde9132` |
| `scripts/MoorishQus.js` | `beb0cb3f151396c25098679e6c3c956e4aaae185` |
| `scripts/MoorishProgress.js` | `ce3ed9c2dc11366e5f96573df98ad8820586cd00` |
| `scripts/MoorishWebMCP.js` | `d225d1a034ecceb06663a4cff9467edc181dd85a` |

## Cut `v1.0.0`

jsDelivr only treats three-part semver tags as versions. `v1.0.0` is version `1.0.0`. A tag named `v1` or `v1.0` is ignored. `@1` then means the newest `1.x.y` tag, not the branch tip.

Run this yourself. Do not force-push. The SHA below is `origin/main` on 28/10/2026. This docs change does not touch `scripts/`, `styles/`, or `pwa/`, so tagging that SHA or a later commit that only adds these docs serves the same script bytes. If `main` has other commits, stop and check the blobs above before tagging.

```bash
git fetch origin
git tag -a v1.0.0 f013cd76d98e66aab3d97a554e4c2eeb640d71cc -m "v1.0.0"
git push origin v1.0.0
git ls-remote --tags origin refs/tags/v1.0.0
```

Confirm each new URL returns 200 and the body matches the blob you tagged (`git rev-parse v1.0.0:scripts/MoorishCookie.js` and so on). The first request after the tag can 404 until jsDelivr has fetched the tag.

## How later `v1.x` tags move `@1`

Publish a new three-part tag. Do not move `v1.0.0` when the file bytes change. jsDelivr stores an exact version permanently, so editing `v1.0.0` in place does not change what `@1.0.0` already stored.

```bash
git fetch origin
git tag -a v1.0.1 <full-sha> -m "v1.0.1"
git push origin v1.0.1
```

`@1` follows the highest `1.x.y`. The alias is cached for up to 7 days. Exact commit URLs and exact versions are not aliases: they stay on the first bytes jsDelivr stored, and the purge endpoint does not rewrite them.

If a path is missing from the newest `1.x` tag, jsDelivr can serve that path from an older `1.x` tag instead of returning 404. Keep every path in the table in each `v1` tag.

## Purge

One URL per request. Purge does not accept a directory. Run this after the tag is visible, and again after every later `v1.x` tag, so `@1` does not keep the previous alias for days:

```bash
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishCookie.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishPaginate.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishQus.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishProgress.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishWebMCP.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishGallery.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/styles/mt-gallery.css"
```

## Order of operations

1. Push the `v1.0.0` tag (commands above).
2. Swap the seven Webflow URLs in the table. That edit is manual.
3. Verify. `ops/author-scrub-dry-run.sh --check-site` must show no commit SHA in a jsDelivr URL. Before the swap it exits non-zero on purpose.
4. Only after that, the history scrub in `ops/AUTHOR-SCRUB.md`. That step is a force-push, and it is not part of this change.

The address scrub is prepared and not run. See `ops/AUTHOR-SCRUB.md`.
