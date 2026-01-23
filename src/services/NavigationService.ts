
import * as vscode from 'vscode';
import { INavigationService } from '../interfaces';
import { escapeRegExp } from '../utils';

export class NavigationService implements INavigationService {
    
    public findLineNumber(name: string, lines: string[], type?: string): number {
        const searchPattern = new RegExp(`^\\s*${escapeRegExp(name)}\\s*:`, 'm');
        
        for (let i = 0; i < lines.length; i++) {
            if (searchPattern.test(lines[i])) {
                return i;
            }
        }
        
        return -1;
    }

    public findPathLineNumber(apiPath: string, method: string, lines: string[]): number {
        const pathPatterns = [
            new RegExp(`^\\s*${escapeRegExp(apiPath)}\\s*:`, 'm'),
            new RegExp(`^\\s*["']${escapeRegExp(apiPath)}["']\\s*:`, 'm'),
        ];
        
        let pathLineNumber = -1;
        
        for (let i = 0; i < lines.length; i++) {
            for (const pattern of pathPatterns) {
                if (pattern.test(lines[i])) {
                    pathLineNumber = i;
                    break;
                }
            }
            if (pathLineNumber !== -1) {
                break;
            }
        }

        if (pathLineNumber === -1) {
            return -1;
        }

        if (!method) {
            return pathLineNumber;
        }

        return this.findMethodInPath(pathLineNumber, method.toLowerCase(), lines);
    }

    private findMethodInPath(pathLineNumber: number, method: string, lines: string[]): number {
        const methodPattern = new RegExp(`^\\s*${method}\\s*:`, 'i');
        const pathIndentMatch = lines[pathLineNumber].match(/^(\s*)/);
        const pathIndent = pathIndentMatch ? pathIndentMatch[1].length : 0;

        for (let i = pathLineNumber + 1; i < lines.length; i++) {
            const line = lines[i];
            
            if (i > pathLineNumber) {
                const currentIndentMatch = line.match(/^(\s*)/);
                const currentIndent = currentIndentMatch ? currentIndentMatch[1].length : 0;
                
                if (currentIndent <= pathIndent && line.trim() !== '' && !methodPattern.test(line)) {
                    break;
                }
            }
            
            if (methodPattern.test(line)) {
                return i;
            }
        }

        return pathLineNumber;
    }

    public async navigateToLine(
        document: vscode.TextDocument,
        lineNumber: number,
        viewColumn: vscode.ViewColumn = vscode.ViewColumn.One
    ): Promise<void> {
        const editor = await vscode.window.showTextDocument(document, viewColumn);
        const position = new vscode.Position(lineNumber, 0);
        const range = new vscode.Range(position, position);
        
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
}

let navigationServiceInstance: NavigationService | null = null;

export function getNavigationService(): NavigationService {
    if (!navigationServiceInstance) {
        navigationServiceInstance = new NavigationService();
    }
    return navigationServiceInstance;
}

