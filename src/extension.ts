import * as vscode from 'vscode';
import * as path from 'path';
import { SwaggerPreviewPanel } from './swaggerPreviewPanel';
import { COMMANDS, CONFIG, DEBOUNCE_DELAY_MS, CONTENT_CHECK_LENGTH, SWAGGER_INDICATORS, SWAGGER_CHECKS } from './constants';

export function activate(context: vscode.ExtensionContext) {
    console.log('Swagger Preview extension is now active');

    let updateTimeout: NodeJS.Timeout | undefined;

    const swaggerPreview = vscode.commands.registerCommand(COMMANDS.SWAGGER_PREVIEW, () => {
        const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }

        const document: vscode.TextDocument = editor.document;
        const fileName: string = path.basename(document.fileName).toLowerCase();
        
        const content: string = document.getText().substring(0, CONTENT_CHECK_LENGTH);
        
        const isSwaggerFile: boolean = SWAGGER_INDICATORS.some(indicator => content.includes(indicator));
        const hasSwaggerInName = SWAGGER_CHECKS.some(check => fileName.includes(check));

        
        if (!isSwaggerFile && !hasSwaggerInName) {
            const choice = vscode.window.showWarningMessage(
                'This file may not be a Swagger/OpenAPI specification. Preview anyway?',
                'Yes', 'No'
            );
            
            choice.then(option => {
                if (option === 'Yes') {
                    SwaggerPreviewPanel.createOrShow(context.extensionUri, document);
                }
            });
            return;
        }

        SwaggerPreviewPanel.createOrShow(context.extensionUri, document);
    });
    context.subscriptions.push(swaggerPreview);

    // Preview a specific file even if it is not the active editor. Invoked from the
    // Explorer context menu (receives a Uri) or the Command Palette (shows a picker).
    const swaggerPreviewFile = vscode.commands.registerCommand(
        COMMANDS.SWAGGER_PREVIEW_FILE,
        async (uri?: vscode.Uri) => {
            const targetUri = uri ?? await pickSpecFile();
            if (!targetUri) {
                return;
            }

            try {
                const document = await vscode.workspace.openTextDocument(targetUri);
                SwaggerPreviewPanel.createOrShow(context.extensionUri, document);
            } catch (e) {
                vscode.window.showErrorMessage(`Could not open "${targetUri.fsPath}" for preview.`);
            }
        }
    );
    context.subscriptions.push(swaggerPreviewFile);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            const currentPanel = SwaggerPreviewPanel.currentPanel;
            // Update whenever the document bound to the preview changes, regardless
            // of which editor is currently focused.
            if (currentPanel && e.document === currentPanel.document) {
                if (updateTimeout) {
                    clearTimeout(updateTimeout);
                }
                
                updateTimeout = setTimeout(() => {
                    currentPanel.update(e.document);
                }, DEBOUNCE_DELAY_MS);
            }
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            const currentPanel = SwaggerPreviewPanel.currentPanel;
            if (currentPanel && currentPanel.document?.uri.toString() === document.uri.toString()) {
                if (updateTimeout) {
                    clearTimeout(updateTimeout);
                }
                currentPanel.dispose();
            }
        })
    );

    // Optionally close the preview when the user switches to a different editor.
    // Disabled by default so the preview stays pinned (e.g. when opening a .java file).
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            const currentPanel = SwaggerPreviewPanel.currentPanel;
            if (!currentPanel) {
                return;
            }

            const closeOnEditorChange = vscode.workspace
                .getConfiguration(CONFIG.SECTION)
                .get<boolean>(CONFIG.CLOSE_ON_EDITOR_CHANGE, false);

            if (!closeOnEditorChange) {
                return;
            }

            // Ignore when there is no active editor (e.g. focus moved to the webview
            // panel) or when the active editor still shows the previewed document.
            if (!editor || editor.document === currentPanel.document) {
                return;
            }

            currentPanel.dispose();
        })
    );

    context.subscriptions.push({
        dispose: () => {
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
        }
    });
}

async function pickSpecFile(): Promise<vscode.Uri | undefined> {
    const files = await vscode.workspace.findFiles('**/*.{yaml,yml,json}', '**/node_modules/**');
    if (files.length === 0) {
        vscode.window.showInformationMessage('No YAML or JSON files found in the workspace to preview.');
        return undefined;
    }

    const items = files
        .map(file => ({
            label: path.basename(file.fsPath),
            description: vscode.workspace.asRelativePath(file),
            uri: file
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Swagger/OpenAPI file to preview'
    });

    return picked?.uri;
}

export function deactivate() {}
