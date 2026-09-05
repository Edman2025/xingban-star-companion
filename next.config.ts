import type { NextConfig } from 'next';

const nextConfig: NextConfig = process.env.XINGBAN_SERVER_BUILD === '1'
  ? {}
  : { output: 'export' };

export default nextConfig;
