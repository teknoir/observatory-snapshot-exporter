FROM node:22-slim

WORKDIR /usr/src/app

COPY . .

RUN npm install
RUN npm run build

# EXPOSE 8080

# Run the application
CMD ["npm", "run", "start"]


