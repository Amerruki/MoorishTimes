# The Moorish Times

Front-end code the live site at moorishtimes.com loads. Nothing else belongs here: this repository is public.

- `scripts/` — site scripts. The live site still loads these commit-pinned from jsDelivr. After the tag in `RELEASING.md`, the URL is `https://cdn.jsdelivr.net/gh/amerruki/MoorishTimes@1/<path>`.
- `styles/` — stylesheets, same URL shape.
- `pwa/` — manifests, service worker, icons and screenshots for the installable web app, served same-origin through the PWA worker. The worker pin is recorded in `RELEASING.md`.

`ops/` is not loaded by the site. A change goes live only when the owner points the site at a new `v1` tag (until that swap, at a new commit).
