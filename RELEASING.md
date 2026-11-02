# Releasing

The live site loads these files from jsDelivr at `@1`, which resolves to the newest `1.x.y` tag. A change goes live only through a new tag. Nothing here pushes a tag, purges the CDN, or edits Webflow.

## What the site loads

| Role | Where | URL |
| --- | --- | --- |
| Cookie banner | Every page | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishCookie.js` |
| Pagination | Every page | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishPaginate.js` |
| Comment counts | Every page | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishQus.js` |
| Reading progress | Every page | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishProgress.js` |
| In-browser agent tools | Every page | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishWebMCP.js` |
| Gallery | Article and news templates | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishGallery.js` |
| Gallery stylesheet | Same article and news templates | `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/styles/mt-gallery.css` |

Disqus `count.js` is Disqus, not this repo.

### PWA and push (not a Webflow script URL)

The footer loads `/pwa/app.js`, not jsDelivr. `/sw.js` is same-origin too. The worker that proxies these files is not in this repo. It pins one commit of this repo, and its `/pwa/release.json` announces that pin. Push display lives in `pwa/sw.js`.

## Publish a tag

jsDelivr only treats three-part semver tags as versions. A tag named `v1` or `v1.0` is ignored. `@1` means the newest `1.x.y` tag, not the branch tip.

Never reuse a version number. jsDelivr stores an exact version permanently, so moving a tag does not change what that version already stored.

```bash
git fetch origin
git tag -a v1.0.5 <full-sha> -m "v1.0.5"
git push origin v1.0.5
git ls-remote --tags origin refs/tags/v1.0.5
```

Confirm each URL returns 200 and the body matches the blob you tagged (`git rev-parse v1.0.5:scripts/MoorishCookie.js` and so on). The first request after the tag can 404 until jsDelivr has fetched the tag.

`@1` follows the highest `1.x.y`. The alias is cached for up to 7 days. Exact commit URLs and exact versions are not aliases: they stay on the first bytes jsDelivr stored, and the purge endpoint does not rewrite them.

If a path is missing from the newest `1.x` tag, jsDelivr can serve that path from an older `1.x` tag instead of returning 404. Keep every path in the table in each `v1` tag.

## Purge

One URL per request. Purge does not accept a directory. Run this after the tag is visible, so `@1` does not keep the previous alias for days:

```bash
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishCookie.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishPaginate.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishQus.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishProgress.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishWebMCP.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/scripts/MoorishGallery.js"
curl -fsS "https://purge.jsdelivr.net/gh/amerruki/MoorishTimes@1/styles/mt-gallery.css"
```
