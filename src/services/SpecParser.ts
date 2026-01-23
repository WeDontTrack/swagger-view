import * as yaml from 'js-yaml';
import { ISpecParser, ParseResult } from '../interfaces';

export class SpecParser implements ISpecParser {
    
    public parse(content: string): ParseResult {
        const jsonResult = this.tryParseJson(content);
        if (jsonResult.success) {
            return jsonResult;
        }

        const yamlResult = this.tryParseYaml(content);
        if (yamlResult.success) {
            return yamlResult;
        }

        return {
            success: false,
            spec: null,
            error: 'Failed to parse specification. Please ensure it is valid JSON or YAML.',
            specString: content
        };
    }

    private tryParseJson(content: string): ParseResult {
        try {
            const spec = JSON.parse(content);
            
            if (!this.isValidSpec(spec)) {
                return this.createFailure('Invalid specification format.');
            }

            return {
                success: true,
                spec,
                error: null,
                specString: content
            };
        } catch (e) {
            return this.createFailure('Not valid JSON');
        }
    }

    private tryParseYaml(content: string): ParseResult {
        try {
            const spec = yaml.load(content);
            
            if (!this.isValidSpec(spec)) {
                return this.createFailure('Invalid specification format.');
            }

            return {
                success: true,
                spec,
                error: null,
                specString: JSON.stringify(spec)
            };
        } catch (e) {
            return this.createFailure('Not valid YAML');
        }
    }

    private isValidSpec(spec: any): boolean {
        return spec !== null && typeof spec === 'object';
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
