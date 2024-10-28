################################################################
# Stage 1: Install the base dependencies
################################################################
# Use node version 20.11.0
FROM node:20.11.0 AS dependencies

LABEL maintainer="Daniyil Rasov <drasov@myseneca.ca>"
LABEL description="fragments-ui Dockerfile"

# We default to use port 1234 in our service
ENV PORT=1234

# Reduce npm spam when installing within Docker
# https://docs.npmjs.com/cli/v8/using-npm/config#loglevel
ENV NPM_CONFIG_LOGLEVEL=warn

# Disable colour when run inside Docker
# https://docs.npmjs.com/cli/v8/using-npm/config#color
ENV NPM_CONFIG_COLOR=false

# Set the NODE_ENV to production
ENV NODE_ENV=production

# Use /app as our working directory
WORKDIR /app

# Copy the package.json and package-lock.json files into /app
COPY package*.json ./

# Install node dependencies as defined in the package-lock.json
RUN npm ci --only=production

################################################################
# Stage 2: Build the application
################################################################
FROM node:20.11.0 AS build

# Set the working directory
WORKDIR /app

# Copy the generated node_modules from the previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy the rest of the source code into the image
COPY . .

# Install parcel-bundler for building the application
RUN npm install --no-save parcel-bundler

# Build the application
RUN npm run build

################################################################
# Stage 3: Run the application using Nginx
################################################################
FROM nginx:1.24.0-alpine AS deploy

# Copy the build output to Nginx
COPY --from=build /app/dist/ /usr/share/nginx/html

# We run our service on port 80
EXPOSE 80

# Added healthcheck
HEALTHCHECK --interval=30s --timeout=25s --start-period=5s --retries=3 \
  CMD wget -qO- "http://localhost:80/" || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
