/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
    // Tree-shake / lazy-resolve barrel imports from packages whose default
    // entrypoints pull in everything. lucide-react is the worst offender —
    // a single icon import loads ~1k icons without this hint.
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-toast",
      "@radix-ui/react-slot",
    ],
  },
};

export default nextConfig;
