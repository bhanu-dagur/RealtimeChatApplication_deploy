# ── Build the Angular bundle ──────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Production build (tsconfig + angular.json provide the prod target)
RUN npm run build -- --configuration production

# ── Serve via nginx ───────────────────────────────────────────────
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Angular puts the SPA under /browser when using the application builder (Angular 17+).
COPY --from=build /app/dist/ConnectHub.Web/browser/ /usr/share/nginx/html/
EXPOSE 80

# nginx serves index.html for any unmatched route (SPA fallback) — see nginx.conf.
CMD ["nginx", "-g", "daemon off;"]
