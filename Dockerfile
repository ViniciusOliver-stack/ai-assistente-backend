# Use a specific version of Node.js
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package files and prisma schema first
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Generate Prisma Client BEFORE copying the rest of the files
RUN npx prisma generate

# Copy the rest of the project files
COPY . .

# Build the app
RUN npm run build

# Expose the port
EXPOSE 9901

# Start the app
CMD ["npm", "run", "start"]