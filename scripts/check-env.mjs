import fs from 'fs';
import path from 'path';

const envFilePath = path.join(process.cwd(), '.env.local');
const packageJsonPath = path.join(process.cwd(), 'package.json');
const DEFAULT_DB_FILENAME = 'watch.db';
const expectedDependencyNames = ['next', 'react', 'react-dom', 'better-sqlite3', 'openai', 'pdf-parse', 'typescript'];

function parseDotEnv(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const values = {};
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        values[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }

    return values;
}

function readStringEnv(name, fileValues) {
    const processValue = process.env[name]?.trim();
    if (processValue) {
        return processValue;
    }

    const fileValue = fileValues[name]?.trim();
    return fileValue ? fileValue : undefined;
}

function readBooleanEnv(name, fileValues) {
    const value = readStringEnv(name, fileValues)?.toLowerCase();
    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    return undefined;
}

function getInstalledDependencyVersion(name) {
    const dependencyPackageJsonPath = path.join(process.cwd(), 'node_modules', name, 'package.json');

    if (!fs.existsSync(dependencyPackageJsonPath)) {
        return null;
    }

    const dependencyPackageJson = JSON.parse(fs.readFileSync(dependencyPackageJsonPath, 'utf-8'));
    return dependencyPackageJson.version ?? 'unknown';
}

const envFileValues = parseDotEnv(envFilePath);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const nodeMajorVersion = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
const configuredDbPath = readStringEnv('WATCH_DB_PATH', envFileValues);
const explicitMockAiMode = readBooleanEnv('WATCH_USE_MOCK_AI', envFileValues);
const watchDbPath = configuredDbPath ? path.resolve(process.cwd(), configuredDbPath) : path.join(process.cwd(), DEFAULT_DB_FILENAME);
const openAiConfigured = Boolean(readStringEnv('OPENAI_API_KEY', envFileValues));
const mockAiEnabled = explicitMockAiMode !== undefined ? explicitMockAiMode : !openAiConfigured;
const invalidBooleanEnvironmentVariables = ['WATCH_USE_MOCK_AI'].filter((name) => {
    return readStringEnv(name, envFileValues) !== undefined && readBooleanEnv(name, envFileValues) === undefined;
});
const dbDirectory = path.dirname(watchDbPath);

console.log('Terroir Watch local environment audit');
console.log(`- .env.local present: ${fs.existsSync(envFilePath) ? 'yes' : 'no (using defaults)'}`);
console.log(`- Node.js: ${process.versions.node}`);
console.log(`- SQLite DB path: ${watchDbPath} (${configuredDbPath ? 'WATCH_DB_PATH' : 'default'})`);
console.log(`- SQLite DB directory present: ${fs.existsSync(dbDirectory) ? 'yes' : 'no'}`);
console.log(`- OpenAI API key configured: ${openAiConfigured ? 'yes' : 'no'}`);
console.log(`- Mock AI mode: ${mockAiEnabled ? 'enabled' : 'disabled'} (${explicitMockAiMode === undefined ? 'auto' : 'WATCH_USE_MOCK_AI'})`);

console.log('- Dependency validation:');
for (const dependencyName of expectedDependencyNames) {
    const declaredVersion = packageJson.dependencies?.[dependencyName] ?? packageJson.devDependencies?.[dependencyName] ?? 'not declared';
    const installedVersion = getInstalledDependencyVersion(dependencyName);
    console.log(`  - ${dependencyName}: declared ${declaredVersion}; installed ${installedVersion ?? 'missing'}`);
}

if (nodeMajorVersion < 20) {
    console.error('Node.js 20 or newer is required.');
    process.exit(1);
}

if (invalidBooleanEnvironmentVariables.length > 0) {
    console.error(`Invalid boolean env value(s): ${invalidBooleanEnvironmentVariables.join(', ')}. Use true, false, or leave empty.`);
    process.exit(1);
}

if (!openAiConfigured && !mockAiEnabled) {
    console.error('OPENAI_API_KEY is required when WATCH_USE_MOCK_AI=false.');
    process.exit(1);
}

const missingDependencies = expectedDependencyNames.filter((dependencyName) => !getInstalledDependencyVersion(dependencyName));
if (missingDependencies.length > 0) {
    console.error(`Missing installed dependencies: ${missingDependencies.join(', ')}. Run npm.cmd install before continuing.`);
    process.exit(1);
}

console.log('Environment audit passed.');
