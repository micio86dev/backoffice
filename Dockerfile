# Multi-stage Dockerfile — backoffice (Nuxt 4 SPA)
#
# Stage 1: Build — Bun 1.3 installs dependencies and runs nuxt generate (static SPA)
# Stage 2: Runtime — nginx:1.27-alpine serves the static output (non-root)
#
# Per D17 (non-root, healthchecked, small final image) and D18 (Bun build → static serve).

# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM oven/bun:1.3.14 AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json bun.lock ./

# Install all dependencies (including devDependencies for build)
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# The API base is BAKED IN at build time. This is a statically generated SPA, so
# a runtime `environment:` entry in docker-compose has no effect whatsoever — the
# value is compiled into the JS bundle here and cannot be changed afterwards.
#
# It MUST include the `/api` suffix: the composables build `${apiBase}/auth/login`,
# and Laravel's CORS middleware only covers `api/*`. Without the suffix the browser
# hits `/auth/login`, gets a 404 carrying no Access-Control-Allow-Origin header,
# and reports it as a CORS failure — masking a simple wrong-URL bug.
#
# Declaring it as an ARG makes the built image explicit and independent of whatever
# `.env` happens to sit in the build context on a given developer's machine.
#
# NO DEFAULT, deliberately. This used to fall back to http://localhost:8000/api,
# and a production build that never received the arg baked that in — producing an
# image that passed its healthcheck, served the login page correctly, and sent
# every visitor's credentials to a port on THEIR OWN machine. The symptom was a
# 401 that looked exactly like a wrong password. docker-compose already passes
# this arg explicitly, so nothing legitimate depended on the default.
ARG NUXT_PUBLIC_API_BASE
RUN test -n "$NUXT_PUBLIC_API_BASE" || { \
      echo "ERROR: build arg NUXT_PUBLIC_API_BASE is required."; \
      echo "  It is baked into the static bundle and cannot be set at runtime."; \
      echo "  Example: --build-arg NUXT_PUBLIC_API_BASE=https://api.example.com/api"; \
      exit 1; \
    }
ENV NUXT_PUBLIC_API_BASE=${NUXT_PUBLIC_API_BASE}

# Generate the static SPA output (Nuxt SPA mode: ssr: false → nuxt generate)
RUN bun run generate

# Assert the value REACHED the bundle. The check above only proves the arg was
# passed; this proves Nuxt inlined it. They are different failures, and the
# second one is just as invisible from the outside as the first was.
RUN grep -q "apiBase:\"${NUXT_PUBLIC_API_BASE}\"" .output/public/index.html || { \
      echo "ERROR: NUXT_PUBLIC_API_BASE was set to '${NUXT_PUBLIC_API_BASE}' but is not in the generated bundle."; \
      echo "  Found instead: $(grep -o 'apiBase:\"[^\"]*\"' .output/public/index.html || echo '<nothing>')"; \
      exit 1; \
    }

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM nginx:1.27.5-alpine AS runtime

# Remove default nginx config; replace with SPA-friendly config
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=builder /app/.output/public /usr/share/nginx/html

# SPA routing: serve index.html for all unknown paths (client-side router)
# Security headers applied at nginx level (D29 / task 7.8).
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    # Emit RELATIVE redirects. nginx listens on 80 but is published on another\n\
    # port (3001 locally), and with the default absolute_redirect it answers\n\
    # /login with "Location: http://localhost/login/" — dropping the published\n\
    # port and sending the browser to a port where nothing serves. Every\n\
    # directory-style route of the generated SPA was unreachable by direct URL.\n\
    absolute_redirect off;\n\
\n\
    # Security headers (D29 / task 7.8)\n\
    add_header X-Frame-Options "DENY" always;\n\
    add_header X-Content-Type-Options "nosniff" always;\n\
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\n\
    # HSTS applied by Railway (HTTPS termination at edge) — not needed here\n\
    # CSP deferred to C2\n\
\n\
    # Serve the health page as a static file\n\
    location /health {\n\
        try_files $uri $uri/ /health/index.html;\n\
    }\n\
\n\
    # SPA fallback: all routes return index.html for client-side routing\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Cache static assets\n\
    location ~* \\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$ {\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

# Non-root: nginx worker runs as existing nginx user (uid 101 on alpine)
# We adjust permissions so the nginx user can write to required dirs
RUN chown -R nginx:nginx /usr/share/nginx/html \
  && chmod -R 755 /usr/share/nginx/html \
  && chown -R nginx:nginx /var/cache/nginx \
  && chown -R nginx:nginx /var/log/nginx \
  && touch /var/run/nginx.pid \
  && chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

# Health check against the SPA health page (nginx listens on port 80)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:80/health > /dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
