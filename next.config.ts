import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js/Webpack from bundling officeparser. The package sets
  // __esModule: true on its CJS build, which causes Webpack's ESM interop
  // to use module.exports.default (the OfficeParser class) as the default
  // import rather than module.exports itself. The ESM wrapper then
  // destructures { OfficeParser } from the class, yielding undefined and
  // producing "Cannot read properties of undefined (reading 'parseOffice')".
  // Keeping it external lets Node.js load it natively, bypassing that issue.
  serverExternalPackages: ["officeparser"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
