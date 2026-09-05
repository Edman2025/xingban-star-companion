# Fan community publishing

The existing custom domain and the Sites frontend share a single community API.
The custom domain proxies `/api/community` to a separate loopback-only Python
service on port 8790. Sites relays the same route to that HTTPS domain. This
preserves the existing two-host setup and prevents separate databases/feeds.
Chat and voice remain in their existing container, unchanged.

## Persistence and privacy

- `server/community_api.py` uses standard-library SQLite and bounded JPEG files.
- In production mount `/home/ttp/apps/xingban/shared/community-v1` read/write at
  `/data` and set `COMMUNITY_DATA_DIR=/data`. Do not put data inside releases.
- Mount the exact release's `server` folder read-only at `/app`. Run
  `python /app/community_api.py` using the existing local Python image. Expose
  only `127.0.0.1:8790:8790`; do not expose the service directly to the Internet.
- No provider API keys or voice credentials are needed by this service.
- Browser-local credentials are unverified visitor capabilities, not accounts.
  The server stores only a hash. Clearing browser storage, changing browser or
  switching domain loses management access; cross-device account login is not
  implemented. Nicknames cannot claim the star, studio, official or admin role.
- Published posts, images and likes live on the server. IndexedDB is only an
  unpublished temporary draft; localStorage holds only the visitor credential.
- Deletion is soft deletion. Feed and image routes immediately stop serving the
  deleted post. An operator can recover records from SQLite if needed.
- Uploads: 9 JPEG images maximum, 1 MiB each after browser recompression, source
  selection supports JPG/PNG/WebP up to 10 MiB each. Browser conversion strips
  EXIF location metadata. Server checks JPEG headers/size/dimensions; it does not
  perform semantic/image-content moderation. No SVG, arbitrary URL fetches or
  HTML rendering of post text.
- A request UUID makes retries idempotent. Ownership, validation and rate limits
  are enforced server-side. Media storage defaults to 2 GiB and preserves 1 GiB
  of disk headroom. `COMMUNITY_MAX_MEDIA_BYTES` can change the media quota.
- Public anonymous posting has basic abuse limits, not production-grade content
  moderation, verified accounts or a moderation console. Add these before large
  promotion. Do not advertise anonymous nicknames as verified people.

## Local development and checks

Run `PYTHONDONTWRITEBYTECODE=1 python3 server/community_api.py` in one session.
Run `COMMUNITY_API_ORIGIN=http://127.0.0.1:8790 npm run dev` in another. The local
data directory is ignored `work/community-data`. Production Sites uses the
default HTTPS upstream; never set the local override as a production variable.

Run `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'`;
run `node --test tests/*.test.mjs` and TypeScript checks. Tests use a separate
temporary database; never run fixture writes against live visitor data.

Use the existing static build for the custom domain and the Worker build for
Sites. Only add the community location block to the actual Tengine virtual host;
preserve its certificates and other locations. Validate with `nginx -t` before
reload. The actual binary is `/usr/local/tengine-2.3.2/sbin/nginx`, not Ubuntu's
separate inactive nginx service.

## Operations and recovery

Keep a copy of the old virtual host and release before deployment. Community is
a separate container, so a rollback does not restart chat or voice. Back up
SQLite using its online backup API (or SQLite `.backup`), together with the image
directory; copying a live WAL database alone is not a reliable backup. Uploaded
files, credentials, backups and databases must never enter Git or Sites archives.
No recurring backup or automated content moderation is installed by this change.
