FROM node:24-alpine

# libreoffice : conversion DOCX vers PDF. poppler-utils et tesseract : extraction
# de texte et reconnaissance de caractères sur les statuts issus de l'INPI.
RUN apk add --no-cache libreoffice font-noto ttf-dejavu \
    poppler-utils tesseract-ocr tesseract-ocr-data-fra

# Cambria est employée par les gabarits Word : sans elle, LibreOffice substitue
# une autre police et la mise en page des statuts change.
COPY fonts/cambria.ttf /usr/share/fonts/cambria/cambria.ttf
RUN fc-cache -f

WORKDIR /app

# Les gabarits sont lus depuis la racine du dépôt par web/, d'où leur place ici.
COPY templates ./templates
COPY migrations ./migrations

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./

# Le client Prisma n'est pas versionné : il se génère depuis le schéma.
RUN npx prisma generate

ENV NODE_ENV=production \
    HOME=/root

RUN npm run build

WORKDIR /app

# Les pièces déposées vivent sur le disque persistant de Render, monté sur
# /app/persist. Elles passeront au stockage objet, ce qui rendra ce lien inutile.
RUN rm -rf /app/uploads && ln -s /app/persist/uploads /app/uploads

EXPOSE 3000

CMD ["sh", "-c", "mkdir -p /app/persist/uploads && cd /app/web && npm run start -- --port 3000 --hostname 0.0.0.0"]
