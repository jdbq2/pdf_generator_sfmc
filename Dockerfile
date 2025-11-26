# 1. Base image
FROM node:20-slim

# 2. Install system dependencies required for Puppeteer & Chrome
# We install wget and gnupg to verify Chrome's validity, then install Chrome itself.
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    && rm -rf /var/lib/apt/lists/*

# 3. Set Environment Variables
# Skip downloading Chromium (we installed Chrome above) to save space/time
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
# Tell Puppeteer where Chrome is installed
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# 4. Setup Work Directory
WORKDIR /app

# 5. Install Node Dependencies
COPY package*.json ./
RUN npm ci

# 6. Copy Source Code
COPY . .

# 7. Build Next.js
RUN npm run build

# 8. Expose Port and Start
EXPOSE 3000
CMD ["npm", "start"]