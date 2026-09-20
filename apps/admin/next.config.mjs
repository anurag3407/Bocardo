/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // required for the slim Docker runtime image
  transpilePackages: ['@bocardo/shared-types', '@bocardo/ui', '@bocardo/api-client'],
};

export default nextConfig;
