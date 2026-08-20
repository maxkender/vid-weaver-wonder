FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fontconfig ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# Police Anton (sous-titres du studio).
RUN mkdir -p /usr/share/fonts/truetype/anton \
 && curl -fsSL -o /usr/share/fonts/truetype/anton/Anton-Regular.ttf \
    https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf \
 && fc-cache -f

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=8787
EXPOSE 8787
CMD ["node", "server.js"]
