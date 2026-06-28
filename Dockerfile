FROM node:22-alpine

RUN apk add --no-cache libreoffice font-noto ttf-dejavu

# Build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Install Cambria font for document generation
COPY fonts/cambria.ttf /usr/share/fonts/cambria/cambria.ttf
RUN fc-cache -f

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Keep libstdc++ needed by better-sqlite3 at runtime
RUN apk del python3 make g++ && apk add --no-cache libstdc++

COPY . .

# Cookies sécurisés (Secure) + HOME inscriptible pour le profil LibreOffice
ENV NODE_ENV=production \
    HOME=/root

# Données persistantes (SQLite + uploads) sur l'unique disque Render monté
# sur /app/persist. On y redirige data/ et uploads/ via des liens symboliques.
RUN rm -rf /app/data /app/uploads \
    && ln -s /app/persist/data /app/data \
    && ln -s /app/persist/uploads /app/uploads \
    && mkdir -p /app/tmp

EXPOSE 3000

# Crée les cibles des liens symboliques sur le disque monté (/app/persist)
# avant de démarrer, sinon mkdir('/app/data') échoue (lien cassé au 1er boot).
CMD ["sh", "-c", "mkdir -p /app/persist/data /app/persist/uploads && node index.js"]
