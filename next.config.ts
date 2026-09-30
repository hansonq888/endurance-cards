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
  // The PNG renderers read vendored fonts and the demo-card photos from disk at runtime.
  outputFileTracingIncludes: {
    "/api/scout/[username]/card": ["./assets/fonts/**", "./public/demo-avatars/**"],
    "/api/scout/[username]/story": ["./assets/fonts/**", "./public/demo-avatars/**", "./public/strava/powered-by-strava.svg"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.strava.com" },
    ],
  },
};

export default nextConfig;
