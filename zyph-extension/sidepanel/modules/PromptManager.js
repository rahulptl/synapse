window.Zyph = window.Zyph || {};

window.Zyph.PromptManager = class PromptManager {
    constructor() {
        this.promptCache = {
            system: null,
            incremental: null
        };
        this.promptPaths = {
            system: 'prompts/system-prompt.txt',
            incremental: 'prompts/incremental-system-prompt.txt'
        };
    }

    async loadSystemPrompt(folderName) {
        try {
            console.log(`[PromptManager] Loading system prompt from file...`);

            await this.ensurePromptCached('system');

            const systemPrompt = this.applyReplacements(this.promptCache.system, {
                folderName
            });

            console.log(`[PromptManager] System prompt customized for folder: ${folderName}`);
            return systemPrompt;

        } catch (error) {
            console.warn(`[PromptManager] Could not load system prompt from file, using fallback:`, error);
            return this.getSystemFallbackPrompt(folderName);
        }
    }

    async loadIncrementalPrompt(folderName) {
        try {
            console.log(`[PromptManager] Loading incremental prompt from file...`);

            await this.ensurePromptCached('incremental');

            const incrementalPrompt = this.applyReplacements(this.promptCache.incremental, {
                folderName
            });

            console.log(`[PromptManager] Incremental prompt loaded`);
            return incrementalPrompt;

        } catch (error) {
            console.warn(`[PromptManager] Could not load incremental prompt from file, using fallback:`, error);
            return this.getIncrementalFallbackPrompt(folderName);
        }
    }

    async ensurePromptCached(promptType) {
        const path = this.promptPaths[promptType];
        if (!path) {
            throw new Error(`Unknown prompt type: ${promptType}`);
        }

        if (!this.promptCache[promptType]) {
            const response = await fetch(chrome.runtime.getURL(path));
            if (!response.ok) {
                throw new Error(`Failed to load ${promptType} prompt: ${response.status}`);
            }
            this.promptCache[promptType] = await response.text();
            console.log(`[PromptManager] ${promptType.charAt(0).toUpperCase() + promptType.slice(1)} prompt loaded and cached`);
        }
    }

    applyReplacements(template, replacements = {}) {
        let prompt = template;
        Object.entries(replacements).forEach(([key, value]) => {
            if (value) {
                prompt = prompt.replaceAll(`{${key}}`, value);
            }
        });
        return prompt;
    }

    getSystemFallbackPrompt(folderName) {
        return `You are an expert knowledge base curator creating comprehensive overviews for folders containing content about projects, people, or ideas. For the folder "${folderName}", analyze all provided content and create a detailed knowledge base overview that explains:\n\n1. What this folder is about (main subject/purpose)\n2. Key entities involved (people, organizations, projects, concepts)\n3. Important details, facts, and context\n4. Current status or recent developments\n5. Relationships between different pieces of content\n\nMake it comprehensive enough that anyone reading it will understand the full context and background. Structure it clearly with key points and specific details. Aim for 3-4 paragraphs that serve as a complete knowledge base overview.`;
    }

    getIncrementalFallbackPrompt(folderName) {
        const targetName = folderName || 'this folder';
        return `You are updating an existing knowledge base summary for "${targetName}". Review the previous context state provided, then integrate the new source documents. Maintain the existing structure, refine prior details when the new information clarifies or corrects them, insert new events chronologically, and rewrite the current-state summary to reflect the latest information. Remove any open questions that are now answered and add new gaps that emerge.`;
    }

    async reloadPrompt() {
        console.log(`[PromptManager] Clearing prompt cache and reloading...`);
        this.promptCache.system = null;
        this.promptCache.incremental = null;
        return await this.loadSystemPrompt('test');
    }

    async validatePrompt() {
        try {
            await this.ensurePromptCached('system');
            await this.ensurePromptCached('incremental');

            const testSystemPrompt = this.applyReplacements(this.promptCache.system, {
                folderName: 'TestFolder'
            });
            const testIncrementalPrompt = this.applyReplacements(this.promptCache.incremental, {
                folderName: 'TestFolder'
            });

            return {
                isValid: testSystemPrompt.includes('TestFolder') && testIncrementalPrompt.length > 0,
                length: testSystemPrompt.length,
                incrementalLength: testIncrementalPrompt.length,
                hasPlaceholder: this.promptCache.system.includes('{folderName}')
            };
        } catch (error) {
            return {
                isValid: false,
                error: error.message
            };
        }
    }

    getPromptInfo() {
        return {
            paths: this.promptPaths,
            cached: {
                system: !!this.promptCache.system,
                incremental: !!this.promptCache.incremental
            },
            cacheLengths: {
                system: this.promptCache.system ? this.promptCache.system.length : 0,
                incremental: this.promptCache.incremental ? this.promptCache.incremental.length : 0
            }
        };
    }
};
