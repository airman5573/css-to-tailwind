const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('playwright');
const CleanCSS = require('clean-css');
const { expand: expandShorthand } = require('inline-style-expand-shorthand');

// Tailwind breakpoints configuration
const BREAKPOINTS = {
    'default': { width: 1280, height: 800 }  // Desktop
};

class CSSToTailwindConverter {
    constructor() {
        this.cssContent = '';
        this.htmlContent = '';
        this.processedCSS = '';
        this.elementCount = 0;
        this.CssToTailwindTranslator = null;
        this.logStream = null;
        this.logFile = null;
    }

    async initLogging() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logDir = path.join(__dirname, 'logs');
        await fs.mkdir(logDir, { recursive: true }); // Ensure log directory exists locally
        this.logFile = path.join(logDir, `converter-${timestamp}.log`);
        await this.log('='.repeat(80));
        await this.log(`CSS to Tailwind Converter - Debug Log`);
        await this.log(`Started at: ${new Date().toISOString()}`);
        await this.log('='.repeat(80));
    }

    async log(message, data = null) {
        const timestamp = new Date().toISOString();
        let logEntry = `[${timestamp}] ${message}`;
        
        if (data !== null) {
            if (typeof data === 'object') {
                logEntry += '\n' + JSON.stringify(data, null, 2);
            } else {
                logEntry += '\n' + data;
            }
        }
        
        logEntry += '\n';
        
        // Append to log file
        if (this.logFile) {
            await fs.appendFile(this.logFile, logEntry).catch(err => {
                console.error('Failed to write to log file:', err);
            });
        }
    }

    async run() {
        try {
            console.log('Starting CSS to Tailwind conversion...\n');
            
            // Initialize logging
            await this.initLogging();
            await this.log('Starting conversion process');
            
            // Dynamically import ESM module
            await this.log('Loading CSS to Tailwind translator module...');
            const module = await import('css-to-tailwind-translator');
            this.CssToTailwindTranslator = module.CssToTailwindTranslator;
            await this.log('Module loaded successfully');
            
            // Load input files
            await this.loadInputFiles();
            
            // Phase 0: Validate media queries
            console.log('Phase 0: Validating media queries...');
            await this.validateMediaQueries();
            
            // Phase 1: CSS Pre-processing
            console.log('Phase 1: Pre-processing CSS and adding element IDs...');
            await this.preprocessCSS();
            await this.addElementIds();
            
            // Phase 2: Style extraction with Playwright
            console.log('Phase 2: Extracting styles with Playwright...');
            await this.extractStyles();
            
            // Phase 3: Convert to Tailwind
            console.log('Phase 3: Converting CSS to Tailwind classes...');
            await this.convertToTailwind();
            
            // Phase 4: Generate final HTML
            console.log('Phase 4: Generating final HTML...');
            await this.generateFinalHTML();
            
            console.log('\n✅ Conversion completed successfully!');
            console.log('Output file: test/output/tailwind.html');
            console.log('JSON files: test/output/json/');
            
        } catch (error) {
            console.error('❌ Error during conversion:', error);
            process.exit(1);
        }
    }

    async loadInputFiles() {
        await this.log('Loading input files...');
        this.cssContent = await fs.readFile('test/input/style.css', 'utf-8');
        this.htmlContent = await fs.readFile('test/input/index.html', 'utf-8');
        await this.log('CSS content length:', this.cssContent.length);
        await this.log('HTML content length:', this.htmlContent.length);
        console.log('✓ Input files loaded');
    }

    async validateMediaQueries() {
        const mediaQueryRegex = /@media\s*\([^)]+\)/g;
        const matches = this.cssContent.match(mediaQueryRegex) || [];
        
        if (matches.length > 0) {
            await this.log('Media queries detected; proceeding with desktop-only viewport', matches);
            console.log('✓ Media queries detected and evaluated at the desktop viewport');
        } else {
            console.log('✓ No media queries detected');
        }
    }

    async preprocessCSS() {
        await this.log('Starting CSS preprocessing...');
        
        // Step 1: Clean and consolidate CSS
        await this.log('Cleaning and consolidating CSS...');
        const cleanCSS = new CleanCSS({
            level: 2,
            format: 'beautify'
        });
        
        const cleaned = cleanCSS.minify(this.cssContent);
        if (cleaned.errors && cleaned.errors.length > 0) {
            await this.log('CSS cleaning warnings:', cleaned.errors);
            console.warn('CSS cleaning warnings:', cleaned.errors);
        }
        
        await this.log('Cleaned CSS:', cleaned.styles);
        
        // Step 2: Expand shorthand properties
        await this.log('Expanding shorthand properties...');
        const expandedCSS = this.expandCSSShorthands(cleaned.styles);
        this.processedCSS = expandedCSS;
        
        await this.log('Processed CSS with expanded shorthands:', this.processedCSS);
        
        // Save processed CSS for debugging
        await fs.writeFile('test/output/json/processed.css', this.processedCSS);
        console.log('✓ CSS pre-processed and shorthand properties expanded');
    }

    expandCSSShorthands(css) {
        // Simple regex-based expansion for common shorthands
        // In production, you'd want a more robust CSS parser
        let expanded = css;
        
        // This is a simplified version - in reality you'd parse the CSS properly
        // and use the inline-style-expand-shorthand library on each declaration
        const rules = css.match(/[^{}]+\{[^}]+\}/g) || [];
        const expandedRules = [];
        
        for (const rule of rules) {
            const [selector, declarations] = rule.split('{');
            const props = this.splitDeclarations(declarations.replace('}', ''));
            const expandedProps = [];
            
            for (const prop of props) {
                const colonIndex = prop.indexOf(':');
                if (colonIndex === -1) {
                    continue;
                }
                const property = prop.slice(0, colonIndex).trim();
                const value = prop.slice(colonIndex + 1).trim();
                if (property && value) {
                    // Create an object with the single property
                    const styleObj = {};
                    styleObj[property] = value;
                    const expanded = expandShorthand(styleObj);
                    
                    if (expanded && Object.keys(expanded).length > Object.keys(styleObj).length) {
                        // It was a shorthand, use expanded version
                        for (const [key, val] of Object.entries(expanded)) {
                            expandedProps.push(`${key}: ${val}`);
                        }
                    } else {
                        // Not a shorthand or couldn't expand
                        expandedProps.push(prop.trim());
                    }
                }
            }
            
            expandedRules.push(`${selector}{${expandedProps.join('; ')}}`);
        }
        
        return expandedRules.join('\n');
    }

    splitDeclarations(declarationBlock) {
        const declarations = [];
        let current = '';
        let depth = 0;
        let inQuote = null;
        let escapeNext = false;
        
        for (const char of declarationBlock) {
            if (escapeNext) {
                current += char;
                escapeNext = false;
                continue;
            }
            
            if (char === '\\') {
                current += char;
                escapeNext = true;
                continue;
            }
            
            if (inQuote) {
                current += char;
                if (char === inQuote) {
                    inQuote = null;
                }
                continue;
            }
            
            if (char === '"' || char === "'") {
                inQuote = char;
                current += char;
                continue;
            }
            
            if (char === '(') {
                depth++;
                current += char;
                continue;
            }
            
            if (char === ')') {
                depth = Math.max(0, depth - 1);
                current += char;
                continue;
            }
            
            if (char === ';' && depth === 0) {
                const trimmed = current.trim();
                if (trimmed) {
                    declarations.push(trimmed);
                }
                current = '';
                continue;
            }
            
            current += char;
        }
        
        const final = current.trim();
        if (final) {
            declarations.push(final);
        }
        
        return declarations;
    }

    async addElementIds() {
        // Parse HTML and add data-element-id to each element
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM(this.htmlContent);
        const document = dom.window.document;
        
        let elementId = 1;
        const addIds = (element) => {
            if (element.nodeType === 1) { // Element node
                element.setAttribute('data-element-id', elementId++);
                for (const child of element.children) {
                    addIds(child);
                }
            }
        };
        
        // Start from body
        const body = document.body;
        if (body) {
            addIds(body);
        }
        
        this.elementCount = elementId - 1;
        this.htmlContent = dom.serialize();
        
        // Save the modified HTML
        await fs.writeFile('test/output/html-with-ids.html', this.htmlContent);
        console.log(`✓ Added data-element-id to ${this.elementCount} elements`);
    }

    async extractStyles() {
        const browser = await chromium.launch({ headless: true });
        
        try {
            for (const [breakpoint, viewport] of Object.entries(BREAKPOINTS)) {
                console.log(`  Extracting styles for ${breakpoint} breakpoint...`);
                await this.extractBreakpointStyles(browser, breakpoint, viewport);
            }
        } finally {
            await browser.close();
        }
    }

    async extractBreakpointStyles(browser, breakpoint, viewport) {
        await this.log(`\nExtracting styles for breakpoint: ${breakpoint}`, viewport);
        
        const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height }
        });
        const page = await context.newPage();
        
        // Set up CDP session
        const client = await context.newCDPSession(page);
        await client.send('DOM.enable');
        await client.send('CSS.enable');
        
        // Step 1: Load page WITHOUT CSS
        await this.log('Loading page without CSS...');
        await page.route('**/*.css', route => route.abort());
        await page.goto(`file://${path.resolve('test/output/html-with-ids.html')}`);
        
        const stylesWithoutCSS = await this.captureComputedStyles(page, client);
        await this.log(`Captured styles without CSS for ${this.elementCount} elements`);
        await fs.writeFile(
            `test/output/json/${breakpoint}-css-disabled.json`,
            JSON.stringify(stylesWithoutCSS, null, 2)
        );
        
        // Step 2: Load page WITH CSS
        await this.log('Loading page with CSS...');
        await page.unroute('**/*.css');
        await page.goto(`file://${path.resolve('test/output/html-with-ids.html')}`);
        
        // Inject our processed CSS
        await page.addStyleTag({ content: this.processedCSS });
        await this.log('Injected processed CSS');
        
        const stylesWithCSS = await this.captureComputedStyles(page, client);
        await this.log(`Captured styles with CSS for ${this.elementCount} elements`);
        await fs.writeFile(
            `test/output/json/${breakpoint}-css-enabled.json`,
            JSON.stringify(stylesWithCSS, null, 2)
        );
        
        // Step 3: Find changed properties
        const changedProperties = this.findChangedProperties(stylesWithoutCSS, stylesWithCSS);
        await fs.writeFile(
            `test/output/json/${breakpoint}-changed-css-property.json`,
            JSON.stringify(changedProperties, null, 2)
        );
        
        // Step 4: Get matched CSS rules (authored values)
        const matchedRules = await this.getMatchedCSSRules(page, client, changedProperties);
        await fs.writeFile(
            `test/output/json/${breakpoint}-matched-css-rule.json`,
            JSON.stringify(matchedRules, null, 2)
        );
        
        await context.close();
    }

    async captureComputedStyles(page, client) {
        const styles = {};
        this.elementTags = {}; // Store element tag names
        
        // Get document root first
        const { root } = await client.send('DOM.getDocument', { depth: -1 });
        
        for (let id = 1; id <= this.elementCount; id++) {
            const element = await page.$(`[data-element-id="${id}"]`);
            if (element) {
                try {
                    // Get the tag name
                    const tagName = await element.evaluate(el => el.tagName.toLowerCase());
                    this.elementTags[`element-id-${id}`] = tagName;
                    
                    // Query for the specific element
                    const { nodeId } = await client.send('DOM.querySelector', {
                        nodeId: root.nodeId,
                        selector: `[data-element-id="${id}"]`
                    });
                    
                    if (nodeId && nodeId !== 0) {
                        const { computedStyle } = await client.send('CSS.getComputedStyleForNode', {
                            nodeId: nodeId
                        });
                        
                        const styleObj = {};
                        for (const prop of computedStyle) {
                            styleObj[prop.name] = prop.value;
                        }
                        styles[`element-id-${id}`] = styleObj;
                    }
                } catch (err) {
                    console.warn(`Could not get styles for element ${id}:`, err.message);
                }
            }
        }
        
        return styles;
    }

    findChangedProperties(withoutCSS, withCSS) {
        const changed = {};
        
        for (const elementId in withCSS) {
            const before = withoutCSS[elementId] || {};
            const after = withCSS[elementId] || {};
            const changedProps = [];
            
            for (const prop in after) {
                if (before[prop] !== after[prop]) {
                    changedProps.push(prop);
                }
            }
            
            if (changedProps.length > 0) {
                changed[elementId] = changedProps;
            }
        }
        
        this.log('Changed properties detected:', changed);
        return changed;
    }

    async getMatchedCSSRules(page, client, changedProperties) {
        await this.log('Getting matched CSS rules for changed properties...');
        const matchedRules = {};
        
        // Get document root first
        const { root } = await client.send('DOM.getDocument', { depth: -1 });
        
        for (const elementId in changedProperties) {
            const id = elementId.replace('element-id-', '');
            const element = await page.$(`[data-element-id="${id}"]`);
            
            if (element) {
                try {
                    // Query for the specific element
                    const { nodeId } = await client.send('DOM.querySelector', {
                        nodeId: root.nodeId,
                        selector: `[data-element-id="${id}"]`
                    });
                    
                    if (nodeId && nodeId !== 0) {
                        const { matchedCSSRules } = await client.send('CSS.getMatchedStylesForNode', {
                            nodeId: nodeId
                        });
                        
                        await this.log(`Matched CSS rules for element ${elementId}:`, matchedCSSRules?.length || 0);
                        
                        const rules = {};
                        const props = changedProperties[elementId];
                        
                        // Extract only the properties we care about
                        for (const rule of matchedCSSRules || []) {
                            if (rule.rule && rule.rule.style && rule.rule.style.cssProperties) {
                                for (const cssProp of rule.rule.style.cssProperties) {
                                    if (props.includes(cssProp.name)) {
                                        rules[cssProp.name] = cssProp.value;
                                        await this.log(`Found CSS property for ${elementId}: ${cssProp.name} = ${cssProp.value}`);
                                    }
                                }
                            }
                        }
                        
                        if (Object.keys(rules).length > 0) {
                            matchedRules[elementId] = rules;
                            await this.log(`Final matched rules for ${elementId}:`, rules);
                        }
                    }
                } catch (err) {
                    console.warn(`Could not get matched rules for element ${id}:`, err.message);
                }
            }
        }
        
        return matchedRules;
    }

    async convertToTailwind() {
        await this.log('\nStarting Tailwind conversion phase...');
        
        for (const breakpoint of Object.keys(BREAKPOINTS)) {
            const rulesFile = `test/output/json/${breakpoint}-matched-css-rule.json`;
            
            try {
                await this.log(`\nConverting CSS to Tailwind for breakpoint: ${breakpoint}`);
                const rulesContent = await fs.readFile(rulesFile, 'utf-8');
                const rules = JSON.parse(rulesContent);
                const tailwindClasses = {};
                
                for (const [elementId, cssProps] of Object.entries(rules)) {
                    await this.log(`Converting element ${elementId}:`, cssProps);
                    
                    // Create CSS string from properties
                    const cssString = Object.entries(cssProps)
                        .map(([prop, value]) => `${prop}: ${value}`)
                        .join('; ');
                    
                    // Wrap in a dummy selector for the translator
                    const cssCode = `.dummy { ${cssString} }`;
                    await this.log(`CSS code for conversion: ${cssCode}`);
                    
                    try {
                        const result = this.CssToTailwindTranslator(cssCode, {
                            useAllDefaultValues: true
                        });
                        
                        if (result.code === 'OK' && result.data && result.data[0]) {
                            tailwindClasses[elementId] = result.data[0].resultVal;
                            await this.log(`Converted to Tailwind: ${result.data[0].resultVal}`);
                        } else {
                            // If conversion fails, create arbitrary value classes
                            tailwindClasses[elementId] = this.createArbitraryClasses(cssProps);
                            await this.log(`Conversion failed, using arbitrary classes: ${tailwindClasses[elementId]}`);
                        }
                    } catch (err) {
                        await this.log(`Error converting CSS for ${elementId}: ${err.message}`);
                        console.warn(`Could not convert CSS for ${elementId}:`, err.message);
                        tailwindClasses[elementId] = this.createArbitraryClasses(cssProps);
                    }
                }
                
                await fs.writeFile(
                    `test/output/json/${breakpoint}-tailwind-class.json`,
                    JSON.stringify(tailwindClasses, null, 2)
                );
                
                console.log(`  ✓ Converted ${Object.keys(tailwindClasses).length} elements for ${breakpoint}`);
                
            } catch (err) {
                console.warn(`Could not process ${breakpoint}:`, err.message);
            }
        }
    }

    createArbitraryClasses(cssProps) {
        const classes = [];
        
        for (const [prop, value] of Object.entries(cssProps)) {
            // Convert CSS property to Tailwind arbitrary value format
            const tailwindProp = this.cssToTailwindProperty(prop);
            if (tailwindProp) {
                classes.push(`${tailwindProp}-[${value}]`);
            }
        }
        
        return classes.join(' ');
    }

    cssToTailwindProperty(cssProp) {
        // Map common CSS properties to Tailwind prefixes
        const mapping = {
            'margin': 'm',
            'margin-top': 'mt',
            'margin-right': 'mr',
            'margin-bottom': 'mb',
            'margin-left': 'ml',
            'padding': 'p',
            'padding-top': 'pt',
            'padding-right': 'pr',
            'padding-bottom': 'pb',
            'padding-left': 'pl',
            'width': 'w',
            'height': 'h',
            'background-color': 'bg',
            'color': 'text',
            'font-size': 'text',
            'font-weight': 'font',
            'border-radius': 'rounded',
            'display': '',
            'position': '',
            'top': 'top',
            'right': 'right',
            'bottom': 'bottom',
            'left': 'left'
        };
        
        return mapping[cssProp] || null;
    }

    async generateFinalHTML() {
        const { JSDOM } = require('jsdom');
        const dom = new JSDOM(this.htmlContent);
        const document = dom.window.document;
        
        // Collect all Tailwind classes for each element
        for (let id = 1; id <= this.elementCount; id++) {
            const element = document.querySelector(`[data-element-id="${id}"]`);
            if (element) {
                const classes = [];
                
                for (const breakpoint of Object.keys(BREAKPOINTS)) {
                    try {
                        const tailwindFile = `test/output/json/${breakpoint}-tailwind-class.json`;
                        const content = await fs.readFile(tailwindFile, 'utf-8');
                        const tailwindData = JSON.parse(content);
                        const elementKey = `element-id-${id}`;
                        
                        if (tailwindData[elementKey]) {
                            const breakpointClasses = tailwindData[elementKey].split(' ');
                            
                            if (breakpoint === 'default') {
                                classes.push(...breakpointClasses);
                            } else {
                                // Add responsive prefix
                                const prefixedClasses = breakpointClasses.map(c => `${breakpoint}:${c}`);
                                classes.push(...prefixedClasses);
                            }
                        }
                    } catch (err) {
                        // Skip if file doesn't exist or can't be parsed
                    }
                }
                
                if (classes.length > 0) {
                    element.setAttribute('class', classes.join(' '));
                }
            }
        }
        
        // Add Tailwind CDN to head
        const head = document.head;
        const tailwindScript = document.createElement('script');
        tailwindScript.src = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';
        head.appendChild(tailwindScript);
        
        // Remove the original CSS link
        const cssLink = document.querySelector('link[rel="stylesheet"]');
        if (cssLink) {
            cssLink.remove();
        }
        
        // Save final HTML
        const finalHTML = dom.serialize();
        await fs.writeFile('test/output/tailwind.html', finalHTML);
        console.log('✓ Final HTML generated with Tailwind classes');
    }
}

// Install jsdom if not present
async function checkDependencies() {
    try {
        require('jsdom');
    } catch {
        console.log('Installing additional dependency: jsdom...');
        const { execSync } = require('child_process');
        execSync('npm install jsdom', { stdio: 'inherit' });
    }
}

// Main execution
async function main() {
    await checkDependencies();
    const converter = new CSSToTailwindConverter();
    await converter.run();
}

main().catch(console.error);
