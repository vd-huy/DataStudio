# Web edition (Docker)

The web edition runs the same backend and UI in a container; you use it in a browser.

```sh
docker run -d --name datastudio -p 127.0.0.1:8080:8080 -v datastudio-data:/data ghcr.io/vd-huy/datastudio
docker logs datastudio
```

To build the image yourself: `docker build -t datastudio .` and use `datastudio` as the image name.

1. **Sign in**: on first start the log prints a sign-in address with a random access token, e.g.
   `http://localhost:8080/?token=3f9c…`. Open it; the token is exchanged for a session cookie (30 days) and removed from the address.
   The token is kept in the data volume; print the address again with
   `docker exec datastudio /app/datastudio-server token`.
   Signing out (`POST /api/logout`) ends **every** session, in all browsers: there is one access token per server, not per user.
   If the token may have leaked, replace it with `docker exec datastudio /app/datastudio-server rotate-token`: the old token
   and all sessions stop working at once, without a restart, and the new sign-in address is printed. (With `DATASTUDIO_TOKEN`
   set, change that variable and recreate the container instead.)
2. **Data**: workspaces, connections, query history, the access token and the encrypted saved passwords live in the `/data` volume.
   Saved passwords are encrypted with a key that is also stored there (`datastudio-secret.key`) unless you set
   `DATASTUDIO_SECRET_KEY`; **if the key is lost, saved passwords cannot be recovered** (re-enter them).
3. **Databases on your machine**: inside the container, `localhost` is the container itself. Use `host.docker.internal` as the
   host (Docker Desktop provides it; on Linux add `--add-host=host.docker.internal:host-gateway` to `docker run`). The connection
   dialog shows this hint when you type `localhost` or `127.0.0.1`.
4. **Updating**: see [Updating](#updating); everything in the volume is kept.

`deploy/docker-compose.yml` runs the same container, optionally with a MariaDB to try it out
(`docker compose -f deploy/docker-compose.yml --profile demo up -d`).

| Variable                       | Default                     | Meaning                                                                                                     |
| ------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `DATASTUDIO_TOKEN`           | generated, in `/data`       | Access token to sign in with (at least 16 characters).                                                      |
| `DATASTUDIO_AUTH`            | `token`                     | `off` disables sign-in. Only for a trusted machine or behind your own authenticating proxy; logs a warning. |
| `DATASTUDIO_SECRET_KEY`      | generated, in `/data`       | 64 hex characters (`openssl rand -hex 32`) that encrypt saved passwords and API keys.                       |
| `DATASTUDIO_DATA`            | `/data`                     | Data directory.                                                                                             |
| `DATASTUDIO_LISTEN`          | `0.0.0.0:8080` in the image | Address and port to listen on.                                                                              |
| `DATASTUDIO_PUBLIC_URL`      | `http://localhost:<port>`   | Base of the sign-in address printed in the log.                                                             |
| `DATASTUDIO_ALLOWED_ORIGINS` | none                        | Extra origins allowed to call the API, comma-separated (e.g. `https://studio.example.com` behind a proxy).  |
| `DATASTUDIO_ALLOWED_HOSTS`   | any (loopback if auth off)  | Host names requests may use, comma-separated.                                                               |
| `DATASTUDIO_SECURE_COOKIE`   | off                         | `on` marks the session cookie `Secure`; set it when an HTTPS proxy is in front.                             |
| `DATASTUDIO_TASKS`           | off                         | `on` allows workspace commands. They run inside the container, which has no extra programs (no `kubectl`).  |

Differences from the desktop app: exports and diagram images are downloaded by the browser, there is no "Show in folder", workspace
commands are off unless `DATASTUDIO_TASKS=on`, saved passwords are in the encrypted file instead of Windows Credential Manager, and
assistant requests go from the server to the provider. There is one access token per server, not separate user accounts.
For access over a network, put the server behind HTTPS (a reverse proxy) and set `DATASTUDIO_SECURE_COOKIE=on`.

## MCP clients

Turn on _Settings → MCP server_ and the server answers MCP clients at `/mcp` with its own **MCP token**, which the dialog shows
(_Show_, _Copy_, _Rotate…_): `claude mcp add --transport http datastudio https://<host>/mcp --header "Authorization: Bearer <MCP token>"`.
The MCP token is not the access token: `/mcp` refuses the access token, and the MCP token cannot sign in or call the UI's API. It is
kept in the encrypted secret store. Stdio clients run `docker exec -i datastudio /app/datastudio-server mcp`, which reads the
MCP token itself. Workspaces stay invisible until _Edit workspace → MCP clients_ allows them, and `run_query` approvals appear in
every open browser session (denied after 120 seconds when nobody answers). MCP clients never start workspace commands: a connection
that needs one works only while it runs. With `DATASTUDIO_AUTH=off` the endpoint is off. See [mcp.md](mcp.md).

## Updating

The app checks GitHub for a new release once a day (Settings → Check for updates) and shows _Update X.Y.Z_ in the status bar. It
never touches Docker itself. To update by hand, pull the image and re-create the container on the same volume:

```sh
docker pull ghcr.io/vd-huy/datastudio
docker rm -f datastudio
docker run -d --name datastudio -p 127.0.0.1:8080:8080 -v datastudio-data:/data ghcr.io/vd-huy/datastudio
```

With Compose: `docker compose -f deploy/docker-compose.yml pull` then `docker compose -f deploy/docker-compose.yml up -d`.

To update automatically, the Compose file has an optional [Watchtower](https://containrrr.dev/watchtower/) service that updates only
the `datastudio` container, once a day:

```sh
docker compose -f deploy/docker-compose.yml --profile autoupdate up -d
```

## Oracle in the web edition

The first Oracle connection offers to download Oracle Instant Client into the data volume (`/data/oracle`); it loads at once,
because the server puts that folder on `LD_LIBRARY_PATH` when it starts, and the image includes `libaio`. To use your own client
instead, put it on `LD_LIBRARY_PATH` (for example with `-e LD_LIBRARY_PATH=/data/my-client`) before the container starts. See [engines/oracle.md](engines/oracle.md).
