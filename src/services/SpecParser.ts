import * as yaml from 'js-yaml';
import { ISpecParser, ParseResult } from '../interfaces';

export class SpecParser implements ISpecParser {
    
    public parse(content: string): ParseResult {
        if (content.trim().length === 0) {
            return this.createFailure('The file is empty. Add a Swagger/OpenAPI specification to preview it.');
        }

        const jsonResult = this.tryParseJson(content);
        if (jsonResult.success) {
            return jsonResult;
        }

        const yamlResult = this.tryParseYaml(content);
        if (yamlResult.success) {
            return yamlResult;
        }

        // Both attempts failed. Surface the error from the format the content most
        // likely is, since js-yaml/JSON.parse report line/column and a snippet.
        const trimmed = content.trimStart();
        const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
        const detailedError = (looksLikeJson ? jsonResult.error : yamlResult.error)
            || yamlResult.error
            || jsonResult.error;

        return {
            success: false,
            spec: null,
            error: detailedError || 'Failed to parse specification. Please ensure it is valid JSON or YAML.',
            specString: content
        };
    }

    private tryParseJson(content: string): ParseResult {
        try {
            const spec = JSON.parse(content);
            
            if (!this.isValidSpec(spec)) {
                return this.createFailure(this.invalidSpecMessage());
            }

            return {
                success: true,
                spec,
                error: null,
                specString: content
            };
        } catch (e) {
            return this.createFailure('JSON parse error: ' + this.getErrorMessage(e));
        }
    }

    private tryParseYaml(content: string): ParseResult {
        try {
            const spec = yaml.load(content);
            
            if (!this.isValidSpec(spec)) {
                return this.createFailure(this.invalidSpecMessage());
            }

            return {
                success: true,
                spec,
                error: null,
                specString: JSON.stringify(spec)
            };
        } catch (e) {
            return this.createFailure('YAML parse error: ' + this.getErrorMessage(e));
        }
    }

    private isValidSpec(spec: any): boolean {
        return spec !== null && typeof spec === 'object';
    }

    private invalidSpecMessage(): string {
        return 'Parsed successfully, but the content does not look like a Swagger/OpenAPI specification (expected an object at the root with fields such as "swagger" or "openapi").';
    }

    private getErrorMessage(e: unknown): string {
        if (e instanceof Error && e.message) {
            return e.message;
        }
        return String(e);
    }

    private createFailure(error: string): ParseResult {
        return {
            success: false,
            spec: null,
            error,
            specString: ''
        };
    }
}

let specParserInstance: SpecParser | null = null;

export function getSpecParser(): SpecParser {
    if (!specParserInstance) {
        specParserInstance = new SpecParser();
    }
    return specParserInstance;
}
