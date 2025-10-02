class ZyphContentCapture {
    constructor() {
        this.selectedText = '';
        this.restrictionWarningEl = null;
        this.restrictionWarningTimeout = null;
        this.bindEvents();
    }

    bindEvents() {
        document.addEventListener('selectionchange', () => {
            this.updateSelectedText();
        });

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'getPageContent') {
                console.log('[Content] Received getPageContent request');
                this.getPageContent().then(content => {
                    console.log('[Content] Sending page content response:', {
                        title: content.title,
                        contentLength: content.content?.length || 0,
                        selectedTextLength: content.selectedText?.length || 0,
                        url: content.url
                    });
                    sendResponse(content);
                }).catch(error => {
                    console.error('[Content] Error getting page content:', error);
                    sendResponse({
                        title: document.title,
                        url: window.location.href,
                        error: error.message
                    });
                });
                return true;
            }
            
            if (message.action === 'getSelectedText') {
                console.log('[Content] Received getSelectedText request');
                sendResponse({
                    selectedText: this.selectedText,
                    hasSelection: this.selectedText.length > 0
                });
            }

            if (message.action === 'showRestrictedWarning') {
                console.log('[Content] Received restricted warning message');
                this.showRestrictedWarning(message.payload);
            }
        });
    }

    updateSelectedText() {
        const selection = window.getSelection();
        const newSelectedText = selection.toString().trim();
        
        if (newSelectedText !== this.selectedText) {
            this.selectedText = newSelectedText;
            console.log('[Content] Selection updated:', {
                length: this.selectedText.length,
                text: this.selectedText.substring(0, 100) + (this.selectedText.length > 100 ? '...' : '')
            });
        }
    }

    async getPageContent() {
        const title = document.title;
        const url = window.location.href;
        const favicon = this.getFavicon();
        
        const content = this.extractMainContent();
        const rawHtml = this.getRawPageSource();
        const metadata = this.extractMetadata();
        
        return {
            title,
            url,
            favicon,
            content,
            rawHtml,
            metadata,
            selectedText: this.selectedText,
            timestamp: new Date().toISOString(),
            domain: window.location.hostname
        };
    }

    getRawPageSource() {
        try {
            // Get the complete HTML source including doctype
            const doctype = document.doctype ? 
                `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ''}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ''}>\n` : '';
            
            const htmlSource = document.documentElement.outerHTML;
            
            return {
                fullSource: doctype + htmlSource,
                bodyOnly: document.body.innerHTML,
                headContent: document.head.innerHTML,
                scripts: this.extractScripts(),
                stylesheets: this.extractStylesheets(),
                size: (doctype + htmlSource).length
            };
        } catch (error) {
            console.error('Error getting raw page source:', error);
            return {
                fullSource: document.documentElement.outerHTML,
                bodyOnly: document.body.innerHTML,
                headContent: document.head.innerHTML,
                scripts: [],
                stylesheets: [],
                size: document.documentElement.outerHTML.length
            };
        }
    }

    extractScripts() {
        return Array.from(document.querySelectorAll('script')).map(script => ({
            src: script.src || null,
            inline: !script.src,
            content: script.src ? null : script.innerHTML,
            type: script.type || 'text/javascript'
        }));
    }

    extractStylesheets() {
        return Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(element => ({
            href: element.href || null,
            inline: element.tagName.toLowerCase() === 'style',
            content: element.tagName.toLowerCase() === 'style' ? element.innerHTML : null,
            media: element.media || 'all'
        }));
    }

    getFavicon() {
        const link = document.querySelector('link[rel="shortcut icon"]') || 
                    document.querySelector('link[rel="icon"]') ||
                    document.querySelector('link[rel="apple-touch-icon"]');
        
        if (link) {
            return new URL(link.href, window.location.origin).href;
        }
        
        return `${window.location.origin}/favicon.ico`;
    }

    extractMainContent() {
        const selectors = [
            'main',
            'article',
            '[role="main"]',
            '.main-content',
            '.content',
            '#content',
            '.post-content',
            '.article-content'
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                return this.cleanText(element.innerText);
            }
        }

        const paragraphs = Array.from(document.querySelectorAll('p'))
            .map(p => p.innerText.trim())
            .filter(text => text.length > 50)
            .slice(0, 10)
            .join('\n\n');

        return paragraphs || this.cleanText(document.body.innerText).substring(0, 2000);
    }

    extractMetadata() {
        const getMetaContent = (name) => {
            const meta = document.querySelector(`meta[name="${name}"]`) ||
                         document.querySelector(`meta[property="${name}"]`) ||
                         document.querySelector(`meta[property="og:${name}"]`) ||
                         document.querySelector(`meta[name="twitter:${name}"]`);
            return meta ? meta.getAttribute('content') : '';
        };

        return {
            description: getMetaContent('description'),
            keywords: getMetaContent('keywords'),
            author: getMetaContent('author'),
            publishedTime: getMetaContent('published_time') || getMetaContent('article:published_time'),
            siteName: getMetaContent('site_name') || getMetaContent('og:site_name')
        };
    }

    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();
    }

    showRestrictedWarning(payload = {}) {
        try {
            if (!document || !document.body) {
                return;
            }

            if (this.restrictionWarningTimeout) {
                clearTimeout(this.restrictionWarningTimeout);
                this.restrictionWarningTimeout = null;
            }

            this.dismissRestrictedWarning(true);

            const {
                headline = "Protected Content - Use Right-Click to Save",
                message = 'This is a protected page that Zyph cannot read automatically.',
                instructions = 'To save content: 1) Select the text you want to save, 2) Right-click on the selection, 3) Choose "Save to Zyph" from the context menu.',
                domain = ''
            } = payload || {};

            const container = document.createElement('div');
            container.id = 'zyph-restricted-warning';
            container.setAttribute('role', 'alert');
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 360px;
                max-width: calc(100vw - 40px);
                background: linear-gradient(135deg, rgba(20, 30, 48, 0.98), rgba(30, 41, 59, 0.98));
                color: #F8FAFC;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                padding: 20px 22px;
                border-radius: 16px;
                border: 1px solid rgba(59, 130, 246, 0.3);
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
                z-index: 2147483647;
                line-height: 1.5;
                opacity: 0;
                transform: translateY(-12px) scale(0.95);
                transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                backdrop-filter: blur(12px);
            `;

            const layout = document.createElement('div');
            layout.style.cssText = 'display: flex; align-items: flex-start; gap: 14px;';

            // Add an icon
            const iconEl = document.createElement('div');
            iconEl.style.cssText = `
                flex-shrink: 0;
                width: 24px;
                height: 24px;
                background: rgba(59, 130, 246, 0.2);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-top: 2px;
            `;
            iconEl.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2.5">
                    <path d="M9 12l2 2 4-4"/>
                    <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"/>
                    <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"/>
                    <path d="M13 12h3"/>
                    <path d="M8 12H5"/>
                </svg>
            `;

            const contentBox = document.createElement('div');
            contentBox.style.cssText = 'flex: 1;';

            const titleEl = document.createElement('div');
            titleEl.textContent = headline;
            titleEl.style.cssText = 'font-weight: 700; font-size: 16px; margin-bottom: 8px; color: #F1F5F9;';

            const messageEl = document.createElement('div');
            messageEl.textContent = message;
            messageEl.style.cssText = 'font-size: 14px; margin-bottom: 12px; color: #CBD5E1;';

            const instructionsEl = document.createElement('div');
            instructionsEl.style.cssText = `
                font-size: 13px;
                color: #E2E8F0;
                background: rgba(59, 130, 246, 0.1);
                padding: 12px 14px;
                border-radius: 10px;
                border-left: 3px solid #3B82F6;
                line-height: 1.6;
            `;

            // Format instructions as a list
            const instructionsList = instructions.split(', ').map((step, index) => {
                if (step.includes(') ')) {
                    return step;
                }
                return `${index + 1}) ${step}`;
            });

            instructionsEl.innerHTML = instructionsList.join('<br>');

            contentBox.appendChild(titleEl);
            contentBox.appendChild(messageEl);
            contentBox.appendChild(instructionsEl);

            if (domain) {
                const domainEl = document.createElement('div');
                domainEl.textContent = domain;
                domainEl.style.cssText = `
                    font-size: 12px;
                    color: #64748B;
                    margin-top: 12px;
                    padding: 4px 8px;
                    background: rgba(15, 23, 42, 0.3);
                    border-radius: 6px;
                    text-align: center;
                `;
                contentBox.appendChild(domainEl);
            }

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.setAttribute('aria-label', 'Dismiss Zyph restricted page warning');
            closeButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
            closeButton.style.cssText = `
                background: rgba(71, 85, 105, 0.2);
                border: none;
                color: #CBD5E1;
                cursor: pointer;
                padding: 8px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                flex-shrink: 0;
            `;

            closeButton.addEventListener('mouseenter', () => {
                closeButton.style.background = 'rgba(248, 113, 113, 0.2)';
                closeButton.style.color = '#FCA5A5';
            });

            closeButton.addEventListener('mouseleave', () => {
                closeButton.style.background = 'rgba(71, 85, 105, 0.2)';
                closeButton.style.color = '#CBD5E1';
            });

            closeButton.addEventListener('click', () => {
                this.dismissRestrictedWarning();
            });

            layout.appendChild(iconEl);
            layout.appendChild(contentBox);
            layout.appendChild(closeButton);

            container.appendChild(layout);
            document.body.appendChild(container);

            requestAnimationFrame(() => {
                container.style.opacity = '1';
                container.style.transform = 'translateY(0) scale(1)';
            });

            this.restrictionWarningEl = container;
            this.restrictionWarningTimeout = setTimeout(() => {
                this.dismissRestrictedWarning();
            }, 18000);
        } catch (error) {
            console.error('[Content] Failed to show restricted warning:', error);
        }
    }

    dismissRestrictedWarning(skipAnimation = false) {
        if (!this.restrictionWarningEl) {
            return;
        }

        if (this.restrictionWarningTimeout) {
            clearTimeout(this.restrictionWarningTimeout);
            this.restrictionWarningTimeout = null;
        }

        const element = this.restrictionWarningEl;
        this.restrictionWarningEl = null;

        const removeElement = () => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        };

        if (skipAnimation) {
            removeElement();
            return;
        }

        element.style.opacity = '0';
        element.style.transform = 'translateY(-8px)';
        setTimeout(removeElement, 250);
    }

    highlightSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.className = 'zyph-highlight';
        span.style.cssText = `
            background-color: rgba(102, 126, 234, 0.3);
            border-radius: 2px;
            padding: 1px 2px;
            animation: zyph-flash 0.5s ease-in-out;
        `;

        try {
            range.surroundContents(span);
            setTimeout(() => {
                if (span.parentNode) {
                    const parent = span.parentNode;
                    parent.replaceChild(document.createTextNode(span.textContent), span);
                    parent.normalize();
                }
            }, 2000);
        } catch (e) {
            console.log('Could not highlight selection');
        }
    }
}

if (!window.zyphContentCapture) {
    window.zyphContentCapture = new ZyphContentCapture();

    const style = document.createElement('style');
    style.textContent = `
        @keyframes zyph-flash {
            0% { background-color: rgba(102, 126, 234, 0.6); }
            100% { background-color: rgba(102, 126, 234, 0.3); }
        }
    `;
    document.head.appendChild(style);
}
