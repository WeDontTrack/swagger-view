export type DefinitionType = 'definition' | 'parameter' | 'response' | 'schema' | 'requestBody' | 'header';

export interface UnusedDefinition {
    name: string;
    type: DefinitionType;
    path: string;
}

export interface AnalysisResult {
    unusedDefinitions: UnusedDefinition[];
    totalDefinitions: number;
    totalReferences: number;
}
