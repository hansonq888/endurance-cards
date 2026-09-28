import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Markdown-friendly embed: ![card](https://host/username.png)
      {
        source: "/:username([A-Za-z0-9_\\-]+)\\.png",
        destination: "/api/scout/:username/card",
      },
    ];
  },
  // The PNG renderer reads vendored fonts from disk at runtime.
  outputFileTracingIncludes: {
    "/api/scout/[username]": ["./assets/fonts/**"],
    "/api/scout/[username]/card": ["./assets/fonts/**"],
    "/api/scout/[username]/story": ["./assets/fonts/**"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.strava.com" },
    ],
  },
};

export default nextConfig;
