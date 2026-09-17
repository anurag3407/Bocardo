/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@bocardo/shared-types', '@bocardo/ui', '@bocardo/api-client'],
};

export default nextConfig;
