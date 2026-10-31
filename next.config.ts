import type {NextConfig} from 'next';
const config:NextConfig={output:'standalone',serverExternalPackages:['@langchain/langgraph','@langchain/core','@langchain/openai','@langchain/langgraph-checkpoint','deepagents','langchain'],experimental:{serverActions:{bodySizeLimit:'32mb'}}};
export default config;
