FROM node:20-slim

WORKDIR /app

# Install firecrawl-mcp globally (provides the MCP server binary)
RUN npm install -g firecrawl-mcp

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install --production

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Expose MCP server port
EXPOSE 8080

# Start firecrawl-mcp in HTTP streamable mode
# The Firecrawl API URL is passed via env var (set in fly.toml or fly secrets)
CMD ["firecrawl-mcp"]
