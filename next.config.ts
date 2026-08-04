import type { NextConfig } from "next";

// basePath 支持在无 pm. 子域时以 www.bitsouls.cn/pm 前缀部署（ADR-001）
const nextConfig: NextConfig = {
  basePath: process.env.APP_BASE_PATH || "",
  output: "standalone",
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
