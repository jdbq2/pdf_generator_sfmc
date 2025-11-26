/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      'app/api/generate/route': ['./node_modules/@sparticuz/chromium/**'],
    },
    serverComponentsExternalPackages: ['@sparticuz/chromium'],
  },
  output: 'standalone', 
};

export default nextConfig;
