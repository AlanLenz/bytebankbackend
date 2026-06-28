# Use a lightweight Node.js image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to cache dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose the port your Express app runs on
EXPOSE 4000

# Command to run your app (adjust if using a build step like 'npm run build' for TypeScript)
CMD ["npm", "start"]