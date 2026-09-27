FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json server.js deployment-start.mjs ./
COPY lib ./lib
COPY public ./public
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "deployment-start.mjs"]
