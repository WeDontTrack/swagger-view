import { AnalysisResult, UnusedDefinition } from './types';

export interface ICache<K, V> {
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    size(): number;
}

export interface ISpecAnalyzer {
    analyze(): AnalysisResult;
}

export interface ISpecParser {
    parse(content: string): ParseResult;
}

export interface ParseResult {
    success: boolean;
    spec: any | null;
    error: string | null;
    specString: string;
}

export interface IDefinitionRangeFinder {
    findRange(name: string, lines: string[]): DefinitionRange | null;
    findAllRanges(definitions: Array<{ name: string; type: string }>, lines: string[]): DefinitionRange[];
}

export interface DefinitionRange {
    name: string;
    startLine: number;
    endLine: number;
    indent: string;
}

export interface INavigationService {
    findLineNumber(name: string, lines: string[], type?: string): number;
    findPathLineNumber(path: string, method: string, lines: string[]): number;
}

export interface IDefinitionCollector {
    collect(spec: any): Map<string, UnusedDefinition>;
}

export interface IReferenceFinder {
    findReferences(obj: any): Set<string>;
}

export interface CacheConfig {
    maxAgeMs: number;
    maxEntries: number;
}

export interface CacheStats {
    size: number;
    hits: number;
    misses: number;
    entries: string[];
}

