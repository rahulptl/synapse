/**
 * Environment Configuration for Zyph Extension
 *
 * To switch environments:
 * 1. Change the ENVIRONMENT variable below to 'local', 'dev', or 'prod'
 * 2. Reload the extension in chrome://extensions
 *
 * OR use the popup UI to switch environments dynamically
 */

const ENVIRONMENTS = {
    local: {

        name: 'Local Development',
        apiUrl: 'http://localhost:8000/api/v1',
        description: 'Running backend locally'
    },
    dev: {
        name: 'Development (Cloud)',
        apiUrl: 'https://synapse-backend-dev-7e75zz4oja-el.a.run.app/api/v1',
        description: 'Cloud Run development environment'
    },
    prod: {
        name: 'Production',
        apiUrl: 'https://synapse-backend-prod-XXXXXXXXXX-el.a.run.app/api/v1',
        description: 'Production Cloud Run environment'
    }
};

// ============================================
// CHANGE THIS TO SWITCH ENVIRONMENTS
// ============================================
const DEFAULT_ENVIRONMENT = 'dev';  // Options: 'local', 'dev', 'prod'
// ============================================

/**
 * Get the current environment configuration
 * This checks chrome.storage first, then falls back to DEFAULT_ENVIRONMENT
 */
async function getEnvironmentConfig() {
    try {
        // Try to get from storage (set by popup UI)
        const result = await chrome.storage.local.get('zyphEnvironment');
        const envKey = result.zyphEnvironment || DEFAULT_ENVIRONMENT;

        const config = ENVIRONMENTS[envKey];
        if (!config) {
            console.warn(`[Config] Invalid environment: ${envKey}, falling back to ${DEFAULT_ENVIRONMENT}`);
            return ENVIRONMENTS[DEFAULT_ENVIRONMENT];
        }

        console.log(`[Config] Using environment: ${config.name} (${config.apiUrl})`);
        return config;
    } catch (error) {
        console.error('[Config] Failed to load environment:', error);
        return ENVIRONMENTS[DEFAULT_ENVIRONMENT];
    }
}

/**
 * Get just the API URL (for backwards compatibility)
 */
async function getApiBaseUrl() {
    const config = await getEnvironmentConfig();
    return config.apiUrl;
}

/**
 * Set the active environment
 */
async function setEnvironment(envKey) {
    if (!ENVIRONMENTS[envKey]) {
        throw new Error(`Invalid environment: ${envKey}`);
    }

    await chrome.storage.local.set({ zyphEnvironment: envKey });
    console.log(`[Config] Environment changed to: ${ENVIRONMENTS[envKey].name}`);

    // Notify other parts of the extension
    chrome.runtime.sendMessage({
        type: 'ENVIRONMENT_CHANGED',
        environment: envKey,
        config: ENVIRONMENTS[envKey]
    });

    return ENVIRONMENTS[envKey];
}

/**
 * Get all available environments
 */
function getAllEnvironments() {
    return ENVIRONMENTS;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getEnvironmentConfig,
        getApiBaseUrl,
        setEnvironment,
        getAllEnvironments,
        ENVIRONMENTS
    };
}

// Make available globally for extension scripts
if (typeof window !== 'undefined') {
    window.ZyphConfig = {
        getEnvironmentConfig,
        getApiBaseUrl,
        setEnvironment,
        getAllEnvironments,
        ENVIRONMENTS
    };
}
