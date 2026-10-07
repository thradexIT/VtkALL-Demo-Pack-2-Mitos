# syntax=docker/dockerfile:1

FROM node:lts-alpine AS build
WORKDIR /bookcars/frontend
COPY ./frontend ./
# Docker builds must use the explicit Docker environment as the authoritative
# Vite source, including production-mode builds. Vite gives mode-specific local
# env files higher precedence than .env, so copy the same Docker env there too
# to prevent ignored local .env.production* files from silently selecting a
# different payment gateway.
COPY ./frontend/.env.docker .env
COPY ./frontend/.env.docker .env.production.local
COPY ./packages /bookcars/packages
RUN npm install --force
RUN npm run build

FROM nginx:stable-alpine
WORKDIR /usr/share/nginx/html
RUN rm -rf -- *
COPY --from=build /bookcars/frontend/build .
COPY ./frontend/nginx.conf /etc/nginx/conf.d/default.conf
CMD ["nginx", "-g", "daemon off;"]
EXPOSE 80
EXPOSE 443
