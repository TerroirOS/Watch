import path from 'path';

const DEFAULT_DB_FILENAME = 'watch.db';

function readStringEnv(name: string): string | undefined {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}

function readBooleanEnv(name: string): boolean | undefined {
    const value = readStringEnv(name)?.toLowerCase();

    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    return undefined;
}

export function getWatchDbPath(): string {
    const configuredPath = readStringEnv('WATCH_DB_PATH');
    return configuredPath ? path.resolve(process.cwd(), configuredPath) : path.join(process.cwd(), DEFAULT_DB_FILENAME);
}

export function shouldUseMockAi(): boolean {
    const explicitMode = readBooleanEnv('WATCH_USE_MOCK_AI');

    if (explicitMode !== undefined) {
        return explicitMode;
    }

    return !readStringEnv('OPENAI_API_KEY');
}

export function getRequiredEnvironmentSummary() {
    const configuredDbPath = readStringEnv('WATCH_DB_PATH');
    const explicitMockAiMode = readBooleanEnv('WATCH_USE_MOCK_AI');

    return {
        envFilePath: path.join(process.cwd(), '.env.local'),
        watchDbPath: getWatchDbPath(),
        watchDbPathSource: configuredDbPath ? 'WATCH_DB_PATH' : 'default',
        openAiConfigured: Boolean(readStringEnv('OPENAI_API_KEY')),
        mockAiEnabled: shouldUseMockAi(),
        mockAiModeSource: explicitMockAiMode === undefined ? 'auto' : 'WATCH_USE_MOCK_AI',
        invalidBooleanEnvironmentVariables: ['WATCH_USE_MOCK_AI'].filter((name) => readStringEnv(name) !== undefined && readBooleanEnv(name) === undefined),
    };
}
