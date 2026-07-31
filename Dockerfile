# Multi-stage web build for Typesetly (Vite dist). Electron is not run in Docker.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
RUN apk add --no-cache apache2-utils
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker-entrypoint.sh /usr/local/bin/typesetly-entrypoint
RUN chmod 755 /usr/local/bin/typesetly-entrypoint
EXPOSE 80
ENTRYPOINT ["/usr/local/bin/typesetly-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]
