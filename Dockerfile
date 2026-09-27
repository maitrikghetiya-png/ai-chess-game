FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=8765
EXPOSE 8765
CMD ["node", "server.js"]
