import dotenv from 'dotenv';
import path from 'path';
import { getRequiredEnvironmentSummary } from '../lib/env';

const MIN_NODE_MAJOR = 20;

function getNodeMajorVersion(): number {
    return Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
}

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const nodeMajor = getNodeMajorVersion();
const env = getRequiredEnvironmentSummary();

console.log('Shield local environment check');
console.log(`- Node.js version: ${process.versions.node}`);
console.log(`- SQLite DB path: ${env.watchDbPath}`);
console.log(`- OpenAI API key configured: ${env.openAiConfigured ? 'yes' : 'no'}`);
console.log(`- Mock AI mode: ${env.mockAiEnabled ? 'enabled' : 'disabled'}`);

if (nodeMajor < MIN_NODE_MAJOR) {
    console.error(`Node.js ${MIN_NODE_MAJOR}+ is required.`);
    process.exit(1);
}

if (!env.openAiConfigured && !env.mockAiEnabled) {
    console.error('OPENAI_API_KEY is required when WATCH_USE_MOCK_AI=false.');
    process.exit(1);
}
