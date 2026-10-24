# The Moorish Times

Front-end code the live site at moorishtimes.com loads. Nothing else belongs here: this repository is public.

- `scripts/` — site scripts, loaded commit-pinned from jsDelivr (`cdn.jsdelivr.net/gh/amerruki/MoorishTimes@<sha>/scripts/...`)
- `styles/` — stylesheets, loaded the same way
- `pwa/` — manifests, service worker, icons and screenshots for the installable web app, served same-origin through the PWA worker on pwa.moorish.cloud

Files are referenced by commit hash, so a change goes live only when the pin on the site or worker is moved to the new commit.
