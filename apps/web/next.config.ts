import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const config: NextConfig = { output: "export", trailingSlash: true, basePath, reactStrictMode: true, turbopack: { root: fileURLToPath(new URL("../..", import.meta.url)) } };
export default config;
