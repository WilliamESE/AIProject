# Includes all required browsers & system deps
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Install browser binaries (already present, but safe to keep up-to-date)
RUN npx playwright install --with-deps

COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]