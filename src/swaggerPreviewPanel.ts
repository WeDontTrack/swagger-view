import * as vscode from 'vscode';
import * as path from 'path';
import { SpecAnalyzer } from './specAnalyzer';
import { fastHash } from './hashUtils';
import { 
    getNavigationService, 
    getDefinitionService, 
    getSpecParser,
    NavigationService,
    DefinitionService,
    SpecParser
} from './services';

export class SwaggerPreviewPanel {
    public static currentPanel: SwaggerPreviewPanel | undefined;
    
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _navigationService: NavigationService;
    private readonly _definitionService: DefinitionService;
    private readonly _specParser: SpecParser;
    
    private _disposables: vscode.Disposable[] = [];
    private _isInitialized: boolean = false;
    private _lastSpecHash: string = '';
    
    public document: vscode.TextDocument | undefined;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.document = document;
        
        // Initialize services (Dependency Injection)
        this._navigationService = getNavigationService();
        this._definitionService = getDefinitionService();
        this._specParser = getSpecParser();

        this._update(document);
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._setupMessageHandlers();
    }

    private _setupMessageHandlers(): void {
        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    private async _handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'goToDefinition':
                await this._goToDefinition(message.name, message.type);
                break;
            case 'deleteDefinition':
                await this._deleteDefinition(message.name, message.type);
                break;
            case 'deleteAllDefinitions':
                await this._deleteAllDefinitions(message.definitions);
                break;
            case 'goToPath':
                await this._goToPath(message.path, message.method);
                break;
        }
    }

    private async _goToDefinition(name: string, type: string): Promise<void> {
        if (!this.document) {
            return;
        }

        const lines = this.document.getText().split('\n');
        const lineNumber = this._navigationService.findLineNumber(name, lines, type);

        if (lineNumber === -1) {
            vscode.window.showWarningMessage(`Could not find definition "${name}" in the document.`);
            return;
        }

        await this._navigationService.navigateToLine(this.document, lineNumber);
    }

    private async _deleteDefinition(name: string, type: string): Promise<void> {
        if (!this.document) {
            return;
        }

        await this._definitionService.deleteDefinition(this.document, name, type);
    }

    private async _deleteAllDefinitions(definitions: Array<{ name: string; type: string }>): Promise<void> {
        if (!this.document || definitions.length === 0) {
            return;
        }

        await this._definitionService.deleteAllDefinitions(this.document, definitions);
    }

    private async _goToPath(apiPath: string, method: string): Promise<void> {
        if (!this.document) {
            return;
        }

        const lines = this.document.getText().split('\n');
        const lineNumber = this._navigationService.findPathLineNumber(apiPath, method, lines);

        if (lineNumber === -1) {
            vscode.window.showWarningMessage(`Could not find path "${apiPath}" in the document.`);
            return;
        }

        await this._navigationService.navigateToLine(this.document, lineNumber);
    }

    public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument) {
        const column = vscode.ViewColumn.Beside;

        if (SwaggerPreviewPanel.currentPanel) {
            SwaggerPreviewPanel.currentPanel._panel.reveal(column);
            SwaggerPreviewPanel.currentPanel.update(document);
            return;
        }

        const panel = this.createNewPanel(extensionUri, column);

        SwaggerPreviewPanel.currentPanel = new SwaggerPreviewPanel(panel, extensionUri, document);
    }

    public static createNewPanel(extensionUri: vscode.Uri, column: vscode.ViewColumn.Beside): vscode.WebviewPanel {
        return vscode.window.createWebviewPanel(
            'swaggerPreview', 'Swagger Preview', column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [ vscode.Uri.joinPath(extensionUri, 'node_modules', 'swagger-ui-dist')]
            }
        )
    }

    public showNotSupportedWebView(){
        this._panel.title = `Preview error`;
        this._panel.webview.html = this._getErrorHtml('Invalid specification format.');
    }

    public update(document: vscode.TextDocument) {
        this.document = document;
        this._update(document);
    }

    public dispose() {
        SwaggerPreviewPanel.currentPanel = undefined;
        this._panel.dispose();
        
        // Reset state
        this._lastSpecHash = '';

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _update(document: vscode.TextDocument) {
        const specContent = document.getText();
        const contentHash = fastHash(specContent);
        
        if (contentHash === this._lastSpecHash && this._isInitialized) {
            return;
        }
        
        this._lastSpecHash = contentHash;
        
        if (this._isInitialized) {
            const updateResult = this._tryIncrementalUpdate(specContent);
            if (updateResult) {
                return;
            }
        }
        
        const webview = this._panel.webview;
        this._panel.title = `Preview: ${path.basename(document.fileName)}`;
        this._panel.webview.html = this._getHtmlForWebview(webview, document);
        this._isInitialized = true;
    }

    private _tryIncrementalUpdate(specContent: string): boolean {
        try {
            const parseResult = this._specParser.parse(specContent);
            
            if (!parseResult.success || !parseResult.spec) {
                return false;
            }
            
            const analyzer = new SpecAnalyzer(parseResult.spec, parseResult.specString);
            const analysisResult = analyzer.analyze();
            
            this._panel.webview.postMessage({
                command: 'updateSpec',
                spec: parseResult.spec,
                analysis: analysisResult
            });
            
            return true;
        } catch (e) {
            return false;
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview, document: vscode.TextDocument): string {
        const swaggerUiPath = vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'swagger-ui-dist');
        const swaggerUiCssUri = webview.asWebviewUri(vscode.Uri.joinPath(swaggerUiPath, 'swagger-ui.css'));
        const swaggerUiBundleUri = webview.asWebviewUri(vscode.Uri.joinPath(swaggerUiPath, 'swagger-ui-bundle.js'));
        const swaggerUiStandaloneUri = webview.asWebviewUri(vscode.Uri.joinPath(swaggerUiPath, 'swagger-ui-standalone-preset.js'));

        const specContent = document.getText();
        const parseResult = this._specParser.parse(specContent);

        if (!parseResult.success || !parseResult.spec) {
            return this._getErrorHtml(parseResult.error || 'Invalid specification format.');
        }

        const specJson = parseResult.spec;
        const specJsonString = parseResult.specString;
        
        const analyzer = new SpecAnalyzer(specJson, specJsonString);
        const analysisResult = analyzer.analyze();
        const analysisJsonString = JSON.stringify(analysisResult);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Swagger Preview</title>
    <link rel="stylesheet" type="text/css" href="${swaggerUiCssUri}" />
    <style>
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin: 0;
            padding: 0;
            background: #fafafa;
        }
        #swagger-ui {
            max-width: 1460px;
            margin: 0 auto;
        }
        .topbar {
            display: none;
        }
        
        /* Unused Definitions Banner */
        #unused-definitions-banner {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 4px;
            padding: 16px;
            margin: 20px auto;
            max-width: 1460px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        #unused-definitions-banner.no-unused {
            background: #d4edda;
            border-color: #28a745;
        }
        #unused-definitions-banner.no-unused .banner-icon {
            color: #28a745;
        }
        .banner-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            user-select: none;
        }
        .banner-title-section {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .banner-icon {
            font-size: 20px;
            color: #ff6f00;
        }
        .banner-title {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #333;
        }
        .banner-count {
            background: #ff6f00;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
        }
        .banner-count.success {
            background: #28a745;
        }
        .banner-toggle {
            font-size: 12px;
            color: #666;
        }
        .banner-content {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid #e0e0e0;
        }
        .banner-content.collapsed {
            display: none;
        }
        .banner-stats {
            font-size: 13px;
            color: #666;
            flex: 1;
        }
        .unused-list {
            list-style: none;
            padding: 0;
            margin: 0;
            max-height: 300px;
            overflow-y: auto;
        }
        .unused-item {
            padding: 8px 12px;
            margin-bottom: 6px;
            background: white;
            border-left: 3px solid;
            border-radius: 3px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            transition: background-color 0.2s, transform 0.1s;
        }
        .unused-item:hover {
            background: #f0f7ff;
            transform: translateX(2px);
        }
        .unused-item-type {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 3px;
            color: white;
        }
        .unused-item-name {
            flex: 1;
            color: #333;
        }
        .unused-item-path {
            font-size: 11px;
            color: #999;
        }
        .unused-item-actions {
            display: flex;
            gap: 8px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .unused-item:hover .unused-item-actions {
            opacity: 1;
        }
        .unused-item-goto {
            font-size: 11px;
            color: #1976d2;
            padding: 2px 6px;
            border-radius: 3px;
            background: #e3f2fd;
        }
        .unused-item-delete {
            font-size: 11px;
            color: #d32f2f;
            padding: 2px 6px;
            border-radius: 3px;
            background: #ffebee;
            cursor: pointer;
            border: none;
            transition: background 0.2s;
        }
        .unused-item-delete:hover {
            background: #ffcdd2;
        }
        .delete-all-btn {
            background: #d32f2f;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .delete-all-btn:hover {
            background: #b71c1c;
        }
        .banner-actions {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
        }
        
        /* Custom navigation button for Swagger UI operations */
        .goto-source-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px 6px;
            border-radius: 4px;
            font-size: 14px;
            color: #1976d2;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: 4px;
        }
        .goto-source-btn:hover {
            background: rgba(25, 118, 210, 0.1);
            color: #1565c0;
        }
        .goto-source-btn:active {
            transform: scale(0.95);
        }
        .goto-source-btn .btn-text {
            font-size: 11px;
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div id="unused-definitions-banner"></div>
    <div id="swagger-ui"></div>
    <script src="${swaggerUiBundleUri}"></script>
    <script src="${swaggerUiStandaloneUri}"></script>
    <script>
        const vscode = acquireVsCodeApi();
        let analysisResult = ${analysisJsonString};
        let currentSpec = ${specJsonString};
        
        // Listen for incremental updates from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateSpec') {
                // Update spec and analysis
                currentSpec = message.spec;
                analysisResult = message.analysis;
                
                // Re-render UI components
                renderUnusedDefinitionsBanner();
                
                // Update Swagger UI with new spec
                if (window.ui) {
                    window.ui.specActions.updateSpec(message.spec);
                }
                
                // Re-add navigation buttons after a short delay
                setTimeout(addNavigationButtons, 200);
            }
        });
        
        function goToDefinition(name, type) {
            vscode.postMessage({
                command: 'goToDefinition',
                name: name,
                type: type
            });
        }
        
        function deleteDefinition(event, name, type) {
            event.stopPropagation(); // Prevent triggering goToDefinition
            vscode.postMessage({
                command: 'deleteDefinition',
                name: name,
                type: type
            });
        }
        
        function deleteAllDefinitions() {
            const definitions = analysisResult.unusedDefinitions.map(def => ({
                name: def.name,
                type: def.type
            }));
            vscode.postMessage({
                command: 'deleteAllDefinitions',
                definitions: definitions
            });
        }
        
        function goToPath(path, method) {
            vscode.postMessage({
                command: 'goToPath',
                path: path,
                method: method
            });
        }
        
        function addNavigationButtons() {
            // Find all operation blocks in Swagger UI
            const opblocks = document.querySelectorAll('.opblock-summary');
            
            opblocks.forEach(opblock => {
                // Skip if we already added a button
                if (opblock.querySelector('.goto-source-btn')) {
                    return;
                }
                
                // Get the path and method from the operation block
                const pathElement = opblock.querySelector('.opblock-summary-path, .opblock-summary-path__deprecated');
                const methodElement = opblock.querySelector('.opblock-summary-method');
                
                if (!pathElement) return;
                
                const path = pathElement.textContent?.trim() || pathElement.getAttribute('data-path');
                const method = methodElement?.textContent?.trim().toLowerCase();
                
                if (!path) return;
                
                // Find the controls container (where copy button is)
                const controlsContainer = opblock.querySelector('.opblock-summary-control');
                
                if (controlsContainer) {
                    // Create navigation button
                    const navBtn = document.createElement('button');
                    navBtn.className = 'goto-source-btn';
                    navBtn.title = 'Go to source in editor';
                    navBtn.innerHTML = '📍<span class="btn-text">Source</span>';
                    navBtn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        goToPath(path, method);
                    };
                    
                    // Insert before the first child (before copy button)
                    controlsContainer.insertBefore(navBtn, controlsContainer.firstChild);
                }
            });
        }
        
        // Use MutationObserver to detect when Swagger UI renders new elements
        function setupNavigationObserver() {
            const swaggerUiContainer = document.getElementById('swagger-ui');
            if (!swaggerUiContainer) return;
            
            const observer = new MutationObserver((mutations) => {
                // Debounce the button addition
                clearTimeout(window.navButtonTimeout);
                window.navButtonTimeout = setTimeout(addNavigationButtons, 100);
            });
            
            observer.observe(swaggerUiContainer, {
                childList: true,
                subtree: true
            });
            
            // Initial run after Swagger UI loads
            setTimeout(addNavigationButtons, 500);
        }
        
        function renderUnusedDefinitionsBanner() {
            const banner = document.getElementById('unused-definitions-banner');
            const { unusedDefinitions, totalDefinitions } = analysisResult;
            const unusedCount = unusedDefinitions.length;
            
            // Hide banner if there are no unused definitions
            if (unusedCount === 0) {
                banner.style.display = 'none';
                return;
            }
            
            banner.style.display = 'block';
            
            const typeColors = {
                'definition': '#1976d2',
                'parameter': '#388e3c',
                'response': '#f57c00',
                'schema': '#1976d2',
                'requestBody': '#7b1fa2',
                'header': '#0097a7'
            };
            
            const typeLabels = {
                'definition': 'Definition',
                'parameter': 'Parameter',
                'response': 'Response',
                'schema': 'Schema',
                'requestBody': 'Request Body',
                'header': 'Header'
            };
            
            let html = \`
                <div class="banner-header" onclick="toggleBannerContent()">
                    <div class="banner-title-section">
                        <span class="banner-icon">⚠️</span>
                        <h3 class="banner-title">Unused Definitions Found</h3>
                        <span class="banner-count">\${unusedCount} / \${totalDefinitions}</span>
                    </div>
                    <span class="banner-toggle" id="banner-toggle">▼ Click to expand</span>
                </div>
            \`;
            
            html += \`
                <div class="banner-content collapsed" id="banner-content">
                    <div class="banner-actions">
                        <div class="banner-stats">
                            Found <strong>\${unusedCount}</strong> unused definition(s) out of <strong>\${totalDefinitions}</strong> total.
                        </div>
                        <button class="delete-all-btn" onclick="deleteAllDefinitions()" title="Delete all unused definitions">
                            🗑 Delete All (\${unusedCount})
                        </button>
                    </div>
                    <ul class="unused-list">
            \`;
            
            unusedDefinitions.forEach(def => {
                const color = typeColors[def.type] || '#757575';
                html += \`
                    <li class="unused-item" style="border-left-color: \${color}" onclick="goToDefinition('\${def.name}', '\${def.type}')" title="Click to go to definition">
                        <span class="unused-item-type" style="background-color: \${color}">
                            \${typeLabels[def.type] || def.type}
                        </span>
                        <span class="unused-item-name">\${def.name}</span>
                        <span class="unused-item-path">\${def.path}</span>
                        <span class="unused-item-actions">
                            <span class="unused-item-goto">→ Go to</span>
                            <button class="unused-item-delete" onclick="deleteDefinition(event, '\${def.name}', '\${def.type}')" title="Delete this definition">🗑 Delete</button>
                        </span>
                    </li>
                \`;
            });
            
            html += \`
                    </ul>
                </div>
            \`;
            
            banner.innerHTML = html;
        }
        
        function toggleBannerContent() {
            const content = document.getElementById('banner-content');
            const toggle = document.getElementById('banner-toggle');
            
            if (content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                toggle.textContent = '▲ Click to collapse';
            } else {
                content.classList.add('collapsed');
                toggle.textContent = '▼ Click to expand';
            }
        }
        
        window.onload = function() {
            // Debug: Log analysis result
            console.log('Analysis Result:', analysisResult);
            console.log('Unused count:', analysisResult.unusedDefinitions.length);
            console.log('Total definitions:', analysisResult.totalDefinitions);
            
            // Render unused definitions banner
            renderUnusedDefinitionsBanner();
            
            // Initialize Swagger UI
            const spec = ${specJsonString};
            
            window.ui = SwaggerUIBundle({
                spec: spec,
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                defaultModelsExpandDepth: 1,
                defaultModelExpandDepth: 1
            });
            
            // Setup navigation buttons for API paths
            setupNavigationObserver();
        };
    </script>
</body>
</html>`;
    }

    private _getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Swagger Preview Error</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            padding: 20px;
            background: #f5f5f5;
        }
        .error-container {
            background: white;
            border-left: 4px solid #d32f2f;
            padding: 20px;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .error-title {
            color: #d32f2f;
            margin-top: 0;
            font-size: 20px;
        }
        .error-message {
            color: #333;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <h2 class="error-title">⚠️ Error</h2>
        <p class="error-message">${message}</p>
    </div>
</body>
</html>`;
    }
}

