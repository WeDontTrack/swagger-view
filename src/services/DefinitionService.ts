import * as vscode from 'vscode';
import { IDefinitionRangeFinder, DefinitionRange } from '../interfaces';
import { escapeRegExp } from '../utils';

export class DefinitionService implements IDefinitionRangeFinder {
    
    public findRange(name: string, lines: string[]): DefinitionRange | null {
        const searchPattern = new RegExp(`^(\\s*)${escapeRegExp(name)}\\s*:`);
        
        let startLineNumber = -1;
        let baseIndent = '';
        
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(searchPattern);
            if (match) {
                startLineNumber = i;
                baseIndent = match[1];
                break;
            }
        }

        if (startLineNumber === -1) {
            return null;
        }

        const endLineNumber = this.findBlockEnd(startLineNumber, baseIndent.length, lines);
        
        const actualStartLine = this.findActualStart(startLineNumber, lines);

        return {
            name,
            startLine: actualStartLine,
            endLine: endLineNumber,
            indent: baseIndent
        };
    }

    public findAllRanges(definitions: Array<{ name: string; type: string }>, lines: string[]): DefinitionRange[] {
        const ranges: DefinitionRange[] = [];

        for (const def of definitions) {
            const range = this.findRange(def.name, lines);
            if (range) {
                ranges.push(range);
            }
        }

        // Sort by startLine descending for safe deletion (bottom to top)
        return ranges.sort((a, b) => b.startLine - a.startLine);
    }

    private findBlockEnd(startLine: number, baseIndentLength: number, lines: string[]): number {
        let endLineNumber = startLine;
        
        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim() === '') {
                endLineNumber = i;
                continue;
            }
            
            const lineIndentMatch = line.match(/^(\s*)/);
            const lineIndent = lineIndentMatch ? lineIndentMatch[1].length : 0;
            
            if (lineIndent <= baseIndentLength && line.trim() !== '') {
                break;
            }
            
            endLineNumber = i;
        }

        return endLineNumber;
    }

    private findActualStart(startLine: number, lines: string[]): number {
        let actualStartLine = startLine;
        
        if (startLine > 0) {
            for (let i = startLine - 1; i >= 0; i--) {
                const line = lines[i].trim();
                
                if (line.startsWith('#') && line.includes('UNUSED')) {
                    actualStartLine = i;
                } else if (line === '') {
                    // Include blank line before comment
                    if (i > 0 && lines[i - 1].trim().startsWith('#')) {
                        continue;
                    }
                    break;
                } else {
                    break;
                }
            }
        }

        return actualStartLine;
    }

    public async deleteDefinition(
        document: vscode.TextDocument,
        name: string,
        type: string,
        showConfirmation: boolean = true
    ): Promise<boolean> {
        const lines = document.getText().split('\n');
        const range = this.findRange(name, lines);

        if (!range) {
            vscode.window.showWarningMessage(`Could not find definition "${name}" to delete.`);
            return false;
        }

        if (showConfirmation) {
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete "${name}"?`,
                { modal: true },
                'Delete'
            );

            if (confirm !== 'Delete') {
                return false;
            }
        }

        const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
        const success = await this.deleteRange(editor, range);

        if (success) {
            vscode.window.showInformationMessage(`Deleted unused ${type}: "${name}"`);
        }

        return success;
    }

    public async deleteAllDefinitions(
        document: vscode.TextDocument,
        definitions: Array<{ name: string; type: string }>,
        showConfirmation: boolean = true
    ): Promise<number> {
        if (definitions.length === 0) {
            return 0;
        }

        if (showConfirmation) {
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete all ${definitions.length} unused definition(s)?`,
                { modal: true },
                'Delete All'
            );

            if (confirm !== 'Delete All') {
                return 0;
            }
        }

        const lines = document.getText().split('\n');
        const ranges = this.findAllRanges(definitions, lines);

        if (ranges.length === 0) {
            vscode.window.showWarningMessage('No definitions found to delete.');
            return 0;
        }

        const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
        const success = await this.deleteMultipleRanges(editor, ranges);

        if (success) {
            vscode.window.showInformationMessage(`Deleted ${ranges.length} unused definition(s).`);
        }

        return success ? ranges.length : 0;
    }

    private async deleteRange(editor: vscode.TextEditor, range: DefinitionRange): Promise<boolean> {
        const startPosition = new vscode.Position(range.startLine, 0);
        const endPosition = new vscode.Position(range.endLine + 1, 0);
        const deleteRange = new vscode.Range(startPosition, endPosition);

        return editor.edit(editBuilder => {
            editBuilder.delete(deleteRange);
        });
    }

    private async deleteMultipleRanges(editor: vscode.TextEditor, ranges: DefinitionRange[]): Promise<boolean> {
        return editor.edit(editBuilder => {
            for (const range of ranges) {
                const startPosition = new vscode.Position(range.startLine, 0);
                const endPosition = new vscode.Position(range.endLine + 1, 0);
                const deleteRange = new vscode.Range(startPosition, endPosition);
                editBuilder.delete(deleteRange);
            }
        });
    }
}

let definitionServiceInstance: DefinitionService | null = null;

export function getDefinitionService(): DefinitionService {
    if (!definitionServiceInstance) {
        definitionServiceInstance = new DefinitionService();
    }
    return definitionServiceInstance;
}

