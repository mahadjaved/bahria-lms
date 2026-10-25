/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // impit is a native (napi) module used for Chrome-impersonated portal
    // requests — keep it external so webpack doesn't try to bundle it.
    serverComponentsExternalPackages: ["impit"]
  }
};
export default nextConfig;
