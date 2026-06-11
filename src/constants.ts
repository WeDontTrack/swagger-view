export const COMMANDS = {
    SWAGGER_PREVIEW: 'swagger-preview.preview',
    SWAGGER_PREVIEW_FILE: 'swagger-preview.previewFile'
} as const;

export const CONFIG = {
    SECTION: 'swagger-preview',
    CLOSE_ON_EDITOR_CHANGE: 'closeOnEditorChange'
} as const;

export const DEBOUNCE_DELAY_MS = 400;

export const SWAGGER_INDICATORS = [
    'swagger:',
    'openapi:',
    '"swagger"',
    '"openapi"'
] as const;

export const CONTENT_CHECK_LENGTH = 50;

export const SWAGGER_CHECKS = [ "swagger", "openapi" ];
