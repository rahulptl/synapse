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
                headline = "💡 Tip: How to Save This Page",
                message = 'This page needs a simple extra step to save content.',
                instructions = 'Select the text you want, right-click, and choose "Save to Zyph".',
                domain = ''
            } = payload || {};

            const container = document.createElement('div');
            container.id = 'zyph-restricted-warning';
            container.setAttribute('role', 'alert');
            container.style.cssText = `
                position: fixed;
                top: 12px;
                right: 12px;
                width: 280px;
                max-width: calc(100vw - 24px);
                background: rgba(255, 255, 255, 0.97);
                color: #1e293b;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
                padding: 10px 12px;
                border-radius: 10px;
                border: 1px solid rgba(226, 232, 240, 0.8);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06);
                z-index: 2147483647;
                opacity: 0;
                transform: translateY(-6px) scale(0.97);
                transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            `;

            const layout = document.createElement('div');
            layout.style.cssText = 'display: flex; align-items: flex-start; gap: 8px;';

            // Minimal lightbulb icon
            const iconEl = document.createElement('div');
            iconEl.style.cssText = `
                flex-shrink: 0;
                width: 16px;
                height: 16px;
                margin-top: 1px;
            `;
            iconEl.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                    <circle cx="12" cy="12" r="4"/>
                </svg>
            `;

            const contentBox = document.createElement('div');
            contentBox.style.cssText = 'flex: 1; min-width: 0;';

            const titleEl = document.createElement('div');
            titleEl.textContent = headline;
            titleEl.style.cssText = 'font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #0f172a; letter-spacing: -0.01em;';

            const messageEl = document.createElement('div');
            messageEl.textContent = message;
            messageEl.style.cssText = 'font-size: 12px; color: #64748b; line-height: 1.4; margin-bottom: 6px;';

            const instructionsEl = document.createElement('div');
            instructionsEl.style.cssText = `
                font-size: 11px;
                color: #475569;
                background: rgba(241, 245, 249, 0.8);
                padding: 6px 8px;
                border-radius: 6px;
                line-height: 1.5;
                border: 1px solid rgba(226, 232, 240, 0.6);
            `;

            // Simple instruction text - no numbering for brevity
            instructionsEl.textContent = instructions;

            contentBox.appendChild(titleEl);
            contentBox.appendChild(messageEl);
            contentBox.appendChild(instructionsEl);

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.setAttribute('aria-label', 'Dismiss tip');
            closeButton.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            `;
            closeButton.style.cssText = `
                background: transparent;
                border: none;
                color: #94a3b8;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
                flex-shrink: 0;
                margin-top: -2px;
                margin-right: -2px;
            `;

            closeButton.addEventListener('mouseenter', () => {
                closeButton.style.background = 'rgba(148, 163, 184, 0.15)';
                closeButton.style.color = '#64748b';
            });

            closeButton.addEventListener('mouseleave', () => {
                closeButton.style.background = 'transparent';
                closeButton.style.color = '#94a3b8';
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
