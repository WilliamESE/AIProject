FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
EXPOSE 5173
# Vite dev server bound to 0.0.0.0 for container access
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]