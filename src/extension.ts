import * as vscode from 'vscode';
import * as path from 'path';
import { SwaggerPreviewPanel } from './swaggerPreviewPanel';
import { COMMANDS, DEBOUNCE_DELAY_MS, CONTENT_CHECK_LENGTH, SWAGGER_INDICATORS } from './constants';

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
        const fileName: string = path.basename(document.fileName);
        
        const content: string = document.getText().substring(0, CONTENT_CHECK_LENGTH);
        const isSwaggerFile: boolean = SWAGGER_INDICATORS.some(indicator => content.includes(indicator));
        
        const hasSwaggerInName = fileName.toLowerCase().includes('swagger') || 
                                  fileName.toLowerCase().includes('openapi');
        
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

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            const currentPanel = SwaggerPreviewPanel.currentPanel;
            if (currentPanel && e.document === vscode.window.activeTextEditor?.document) {
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

    context.subscriptions.push({
        dispose: () => {
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
        }
    });
}

export function deactivate() {}
