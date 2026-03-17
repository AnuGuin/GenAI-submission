/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://genai-submission-eyxu.onrender.com/api/:path*",
      },
    ];
  },
};
module.exports = nextConfig;
