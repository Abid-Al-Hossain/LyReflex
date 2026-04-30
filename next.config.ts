import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // onnxruntime-node is a server-only native binary — exclude from browser builds.
  // (Kept as a precaution; @xenova/transformers is no longer imported client-side.)
  serverExternalPackages: ["onnxruntime-node"],
};

export default nextConfig;
