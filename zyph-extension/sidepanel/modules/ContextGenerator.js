window.Zyph = window.Zyph || {};

window.Zyph.ContextGenerator = class ContextGenerator {
    constructor(folderManager, promptManager) {
        this.folderManager = folderManager;
        this.promptManager = promptManager;
    }

    async generateFolderContext(folderId) {
        try {
            const folder = this.folderManager.findFolderById(folderId);
            if (!folder) return;

            // Ensure folder has context property
            if (!folder.context) {
                folder.context = {
                    summary: null,
                    lastUpdated: null,
                    isGenerating: false
                };
            }

            // Mark as generating
            this.folderManager.setFolderGenerating(folderId, true);

            // Get API key from storage
            const result = await chrome.storage.local.get('openaiApiKey');
            if (!result.openaiApiKey) {
                throw new Error('OpenAI API key not found. Please set it in settings.');
            }

            // Get folder content
            const folderContent = await this.folderManager.loadFolderContent(folderId);

            if (folderContent.length === 0) {
                this.folderManager.updateFolderContext(folderId, 'No content available in this folder yet.', false);
                return;
            }

            const existingContext = folder.context.summary;
            
            // Generate context using OpenAI
            const newContext = await this.callOpenAIAPI(result.openaiApiKey, folderContent, existingContext, folder.name);
            
            // Update folder context
            this.folderManager.updateFolderContext(folderId, newContext, false);

        } catch (error) {
            console.error('Error generating folder context:', error);
            this.folderManager.setFolderGenerating(folderId, false);
            throw error;
        }
    }

    async callOpenAIAPI(apiKey, folderContent, existingContext, folderName) {
        console.log(`[OpenAI API] Starting API call for folder: ${folderName}`);
        const sourceDocuments = this.formatSourceDocuments(folderContent);
        console.log(`[OpenAI API] Content length: ${sourceDocuments.length} characters`);
        console.log(`[OpenAI API] Has existing context: ${!!existingContext}`);
        
        // Load the appropriate prompt from file
        const basePrompt = existingContext
            ? await this.promptManager.loadIncrementalPrompt(folderName)
            : await this.promptManager.loadSystemPrompt(folderName);
        
        const messages = [
            {
                role: 'system',
                content: basePrompt
            }
        ];

        if (existingContext) {
            messages.push({
                role: 'user',
                content: `[Previous Context State]:\n${existingContext}\n\n[New Source Documents]:\n${sourceDocuments}`
            });
            console.log(`[OpenAI API] Using existing context mode`);
        } else {
            messages.push({
                role: 'user',
                content: sourceDocuments
            });
            console.log(`[OpenAI API] Creating new context`);
        }

        console.log(`[OpenAI API] Total messages: ${messages.length}`);
        console.log(`[OpenAI API] User message length: ${messages[messages.length - 1].content.length} characters`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const requestBody = {
            model: 'gpt-4.1',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.3
        };
        
        console.log(`[OpenAI API] Request body:`, {
            model: requestBody.model,
            messageCount: requestBody.messages.length,
            maxTokens: requestBody.max_tokens,
            temperature: requestBody.temperature
        });
        console.log(`[OpenAI API] API key prefix: ${apiKey.substring(0, 7)}...`);
        
        try {
            console.log(`[OpenAI API] Making request to OpenAI...`);
            const startTime = Date.now();
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;
            console.log(`[OpenAI API] Response received in ${duration}ms`);
            console.log(`[OpenAI API] Response status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                console.log(`[OpenAI API] Error response - status: ${response.status}`);
                let errorMessage = `API request failed with status ${response.status}`;
                try {
                    const error = await response.json();
                    console.log(`[OpenAI API] Error details:`, error);
                    errorMessage = error.error?.message || errorMessage;
                } catch (e) {
                    console.log(`[OpenAI API] Could not parse error response:`, e);
                    errorMessage = `API request failed: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            console.log(`[OpenAI API] Parsing response...`);
            const data = await response.json();
            console.log(`[OpenAI API] Response data:`, {
                choices: data.choices?.length || 0,
                usage: data.usage,
                model: data.model
            });
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.log(`[OpenAI API] Invalid response format:`, data);
                throw new Error('Invalid response format from OpenAI API');
            }
            
            const content = data.choices[0].message.content.trim();
            console.log(`[OpenAI API] Generated content length: ${content.length} characters`);
            console.log(`[OpenAI API] Content preview: ${content.substring(0, 100)}...`);
            console.log(`[OpenAI API] API call completed successfully`);
            
            return content;
            
        } catch (error) {
            clearTimeout(timeoutId);
            console.log(`[OpenAI API] Error occurred:`, error);
            if (error.name === 'AbortError') {
                console.log(`[OpenAI API] Request timed out`);
                throw new Error('Request timed out after 30 seconds. Please try again.');
            }
            throw error;
        }
    }

    async generateContextPrompt(folderId) {
        try {
            const folder = this.folderManager.findFolderById(folderId);
            if (!folder || !folder.context.summary) {
                throw new Error('No context available to generate prompt');
            }

            // Get folder content
            const folderContent = await this.folderManager.loadFolderContent(folderId);

            // Generate formatted context prompt
            const contextPrompt = this.createFormattedPrompt(folder, folderContent);
            
            return contextPrompt;

        } catch (error) {
            console.error('Error generating context prompt:', error);
            throw error;
        }
    }

    formatSourceDocuments(folderContent) {
        if (!folderContent || folderContent.length === 0) {
            return 'No source documents available.';
        }

        return folderContent.map(item => {
            const title = item.title || 'Untitled';
            const url = item.url || 'Unknown URL';
            const timestamp = item.timestamp ? new Date(item.timestamp).toISOString() : 'Unknown Timestamp';
            const content = item.content || '(No content captured)';

            return [
                '--- SOURCE START ---',
                `URL: ${url}`,
                `Title: ${title}`,
                `Timestamp: ${timestamp}`,
                `Content: ${content}`,
                '--- SOURCE END ---'
            ].join('\n');
        }).join('\n\n');
    }

    createFormattedPrompt(folder, folderContent) {
        const timestamp = new Date().toLocaleString();
        const contentCount = folderContent.length;
        const dateRange = this.getContentDateRange(folderContent);
        
        let prompt = `# Knowledge Base: ${folder.name}\n`;
        prompt += `*Last updated: ${timestamp} | ${contentCount} sources | Date range: ${dateRange}*\n\n`;
        
        // Add executive summary
        prompt += `## Executive Overview\n${folder.context.summary}\n\n`;
        
        // Add key facts section
        if (folderContent.length > 0) {
            const keyFacts = this.extractKeyFacts(folderContent);
            if (keyFacts.length > 0) {
                prompt += `## Key Facts & Entities\n\n`;
                keyFacts.forEach(fact => {
                    prompt += `- ${fact}\n`;
                });
                prompt += `\n`;
            }
        }
        
        // Add detailed sources
        if (folderContent.length > 0) {
            prompt += `## Detailed Sources & Content\n\n`;
            
            folderContent.forEach((item, index) => {
                prompt += `### Source ${index + 1}: ${item.title}\n`;
                prompt += `**URL:** ${item.url}\n`;
                prompt += `**Collected:** ${new Date(item.timestamp).toLocaleDateString()}\n`;
                prompt += `**Type:** ${item.type === 'selection' ? 'Selected Text' : 'Full Page Content'}\n\n`;
                prompt += `**Content:**\n${item.content}\n\n`;
                prompt += `---\n\n`;
            });
        }
        
        // Add timeline if multiple dates
        if (folderContent.length > 1) {
            prompt += `## Content Timeline\n\n`;
            const sortedContent = [...folderContent].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            sortedContent.forEach(item => {
                prompt += `- **${new Date(item.timestamp).toLocaleDateString()}:** ${item.title}\n`;
            });
            prompt += `\n`;
        }
        
        // Add context for understanding
        prompt += `## About This Knowledge Base\n\n`;
        prompt += `This comprehensive knowledge base contains all essential information about **${folder.name}**. `;
        prompt += `It has been curated from ${contentCount} verified web sources and provides complete context for understanding this subject.\n\n`;
        
        prompt += `**Purpose:** This knowledge base serves as a complete reference that enables anyone to quickly understand the background, current status, key players, and important details related to ${folder.name}. Perfect for onboarding, research, or as context for AI assistance.\n\n`;
        
        prompt += `**Content Validation:** All information is sourced from original web content with URLs provided for verification and further research.\n\n`;
        
        prompt += `*Generated by Zyph Extension - Intelligent Web Content Organization*`;
        
        return prompt;
    }

    getContentDateRange(folderContent) {
        if (folderContent.length === 0) return 'No content';
        if (folderContent.length === 1) return new Date(folderContent[0].timestamp).toLocaleDateString();
        
        const dates = folderContent.map(item => new Date(item.timestamp));
        const earliest = new Date(Math.min(...dates));
        const latest = new Date(Math.max(...dates));
        
        return `${earliest.toLocaleDateString()} - ${latest.toLocaleDateString()}`;
    }

    extractKeyFacts(folderContent) {
        const facts = [];
        
        // Extract URLs and domains
        const domains = [...new Set(folderContent.map(item => {
            try {
                return new URL(item.url).hostname;
            } catch {
                return null;
            }
        }).filter(Boolean))];
        
        if (domains.length > 0) {
            facts.push(`Primary sources: ${domains.slice(0, 3).join(', ')}${domains.length > 3 ? ` and ${domains.length - 3} others` : ''}`);
        }
        
        // Extract dates
        const dateRange = this.getContentDateRange(folderContent);
        if (dateRange !== 'No content') {
            facts.push(`Content collection period: ${dateRange}`);
        }
        
        // Extract content types
        const hasSelections = folderContent.some(item => item.type === 'selection');
        const hasFullPages = folderContent.some(item => item.type !== 'selection');
        
        if (hasSelections && hasFullPages) {
            facts.push('Content mix: Selected text excerpts and full page captures');
        } else if (hasSelections) {
            facts.push('Content type: Curated text selections');
        } else if (hasFullPages) {
            facts.push('Content type: Full page documentation');
        }
        
        return facts;
    }
};
