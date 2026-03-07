import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  },
  outputFileTracingIncludes: {
    "/*": ["./prisma/dev.db"]
  },
  async redirects() {
    return [
      {
        source: "/trips",
        destination: "/tours",
        permanent: true
      },
      {
        source: "/trips/:slug",
        destination: "/tours/:slug",
        permanent: true
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
