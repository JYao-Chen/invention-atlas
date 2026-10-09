import type {NextConfig} from 'next';
const config:NextConfig={serverExternalPackages:['@langchain/langgraph','@langchain/core'],experimental:{serverActions:{bodySizeLimit:'32mb'}}};
export default config;
