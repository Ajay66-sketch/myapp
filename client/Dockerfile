# client/Dockerfile
# Multi-stage production Dockerfile for Vite + React application served by Nginx

# --- Stage 1: Build Static Assets ---
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency configs
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy client source files
COPY . .

# Set default production environment variables for Vite compiler
ARG VITE_API_URL=/api/v1
ARG VITE_SOCKET_URL=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

# Build production assets (outputs to /usr/src/app/dist)
RUN npm run build

# --- Stage 2: Serve Static Files via Nginx ---
FROM nginx:1.25-alpine

# Remove default nginx static assets and configuration
RUN rm -rf /usr/share/nginx/html/*

# Copy Vite production build assets from Stage 1
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html

# Copy custom Nginx configuration optimized for single page apps (SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
