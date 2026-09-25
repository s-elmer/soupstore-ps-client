# Soup Store client image. Build from this repo with the server repo as a named
# build context (the teambuilder data is generated from our server's formats):
#
#   docker build -f soupstore/Dockerfile --build-context server=../soupstore-ps-server \
#     -t soupstore-client .
#
# Optional build args override hostnames (e.g. for a local test build).

FROM node:24.21.0-trixie-slim AS build
ARG SOUPSTORE_CLIENT_HOST=
ARG SOUPSTORE_SERVER=
ARG SOUPSTORE_REPLAYS_HOST=
WORKDIR /server
COPY --from=server package.json package-lock.json ./
RUN npm ci --omit=optional --no-audit --no-fund
COPY --from=server . .
WORKDIR /client
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN SOUPSTORE_CLIENT_HOST="$SOUPSTORE_CLIENT_HOST" SOUPSTORE_SERVER="$SOUPSTORE_SERVER" \
	SOUPSTORE_REPLAYS_HOST="$SOUPSTORE_REPLAYS_HOST" soupstore/build.sh /server /out

FROM caddy:2.11.4-alpine
ENV XDG_CONFIG_HOME=/tmp/caddy-config XDG_DATA_HOME=/tmp/caddy-data
COPY soupstore/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /out /srv
# We listen on 8080, so drop caddy's file capability (cap_net_bind_service).
# Otherwise it can't start in a container that drops all capabilities.
RUN apk add --no-cache libcap && setcap -r /usr/bin/caddy && apk del libcap
USER nobody
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
