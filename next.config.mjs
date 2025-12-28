const repoName =
  process.env.NEXT_PUBLIC_BASE_PATH ||
  process.env.NEXT_BASE_PATH ||
  (process.env.NODE_ENV === "production" ? "LED-Badge-Designer" : "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: repoName ? `/${repoName}` : "",
  assetPrefix: repoName ? `/${repoName}/` : undefined,
  images: {
    unoptimized: true
  },
  trailingSlash: true
};

export default nextConfig;
