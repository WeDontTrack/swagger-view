
import { UnusedDefinition, AnalysisResult, DefinitionType } from './types';
import { ISpecAnalyzer, IDefinitionCollector, IReferenceFinder } from './interfaces';
import { generateHash } from './hashUtils';
import { getAnalysisCache, CacheManager } from './services/CacheManager';

class Swagger2DefinitionCollector implements IDefinitionCollector {
    public collect(spec: any): Map<string, UnusedDefinition> {
        const definitions = new Map<string, UnusedDefinition>();

        if (spec.definitions) {
            this.addDefinitions(definitions, spec.definitions, 'definition', '#/definitions');
        }

        if (spec.parameters) {
            this.addDefinitions(definitions, spec.parameters, 'parameter', '#/parameters');
        }

        if (spec.responses) {
            this.addDefinitions(definitions, spec.responses, 'response', '#/responses');
        }

        return definitions;
    }

    private addDefinitions(
        map: Map<string, UnusedDefinition>,
        obj: Record<string, any>,
        type: DefinitionType,
        basePath: string
    ): void {
        for (const name in obj) {
            const path = `${basePath}/${name}`;
            map.set(path, { name, type, path });
        }
    }
}

class OpenAPI3DefinitionCollector implements IDefinitionCollector {
    public collect(spec: any): Map<string, UnusedDefinition> {
        const definitions = new Map<string, UnusedDefinition>();

        if (!spec.components) {
            return definitions;
        }

        const components = spec.components;
        const basePath = '#/components';

        if (components.schemas) {
            this.addDefinitions(definitions, components.schemas, 'schema', `${basePath}/schemas`);
        }

        if (components.parameters) {
            this.addDefinitions(definitions, components.parameters, 'parameter', `${basePath}/parameters`);
        }

        if (components.responses) {
            this.addDefinitions(definitions, components.responses, 'response', `${basePath}/responses`);
        }

        if (components.requestBodies) {
            this.addDefinitions(definitions, components.requestBodies, 'requestBody', `${basePath}/requestBodies`);
        }

        if (components.headers) {
            this.addDefinitions(definitions, components.headers, 'header', `${basePath}/headers`);
        }

        return definitions;
    }

    private addDefinitions(
        map: Map<string, UnusedDefinition>,
        obj: Record<string, any>,
        type: DefinitionType,
        basePath: string
    ): void {
        for (const name in obj) {
            const path = `${basePath}/${name}`;
            map.set(path, { name, type, path });
        }
    }
}

class ReferenceFinder implements IReferenceFinder {
    public findReferences(obj: any): Set<string> {
        const references = new Set<string>();
        this.traverse(obj, references, new Set());
        return references;
    }

    private traverse(obj: any, references: Set<string>, visited: Set<any>): void {
        if (obj === null || typeof obj !== 'object' || visited.has(obj)) {
            return;
        }

        visited.add(obj);

        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                this.traverse(obj[i], references, visited);
            }
        } else {
            const keys = Object.keys(obj);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const value = obj[key];

                if (key === '$ref' && typeof value === 'string') {
                    references.add(value);
                } else if (typeof value === 'object' && value !== null) {
                    this.traverse(value, references, visited);
                }
            }
        }
    }
}

export class SpecAnalyzer implements ISpecAnalyzer {
    private readonly spec: any;
    private readonly specString: string;
    private readonly cache: CacheManager<string, AnalysisResult>;
    private readonly swagger2Collector: IDefinitionCollector;
    private readonly openapi3Collector: IDefinitionCollector;
    private readonly referenceFinder: IReferenceFinder;

    constructor(spec: any, specString?: string, cache?: CacheManager<string, AnalysisResult>) {
        this.spec = spec;
        this.specString = specString || JSON.stringify(spec);
        this.cache = cache || getAnalysisCache();
        
        this.swagger2Collector = new Swagger2DefinitionCollector();
        this.openapi3Collector = new OpenAPI3DefinitionCollector();
        this.referenceFinder = new ReferenceFinder();
    }

    public analyze(): AnalysisResult {
        const hash = generateHash(this.specString);

        const cached = this.cache.get(hash);
        if (cached) {
            return cached;
        }

        const result = this.performAnalysis();

        this.cache.set(hash, result);

        return result;
    }

    private performAnalysis(): AnalysisResult {
        const definitions = this.collectAllDefinitions();

        const references = this.referenceFinder.findReferences(this.spec);

        const unusedDefinitions: UnusedDefinition[] = [];
        for (const [path, definition] of definitions) {
            if (!references.has(path)) {
                unusedDefinitions.push(definition);
            }
        }

        return {
            unusedDefinitions: unusedDefinitions.sort((a, b) => a.name.localeCompare(b.name)),
            totalDefinitions: definitions.size,
            totalReferences: references.size
        };
    }

    private collectAllDefinitions(): Map<string, UnusedDefinition> {
        const allDefinitions = new Map<string, UnusedDefinition>();

        const swagger2Defs = this.swagger2Collector.collect(this.spec);
        for (const [key, value] of swagger2Defs) {
            allDefinitions.set(key, value);
        }

        const openapi3Defs = this.openapi3Collector.collect(this.spec);
        for (const [key, value] of openapi3Defs) {
            allDefinitions.set(key, value);
        }

        return allDefinitions;
    }
}

export { getAnalysisCache, resetAnalysisCache } from './services/CacheManager';

export function clearAnalysisCache(): void {
    getAnalysisCache().clear();
}

export function getCacheStats() {
    return getAnalysisCache().getStats();
}
