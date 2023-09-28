import { fileTypeFromBuffer } from 'file-type';
import mime from 'mime-types'

interface testInput {
    bytes: Uint8Array
    path: string
}

type testOutput = Promise<string | undefined>

export const DEFAULT_MIME_TYPE = 'text/html'

const tests: Array<(input: testInput) => testOutput> = [
    // testing file-type from buffer
    async ({ bytes }): testOutput => (await fileTypeFromBuffer(bytes))?.mime,
    // testing file-type from path
    async ({ path }): testOutput => mime.lookup(path) || undefined,
    // svg
    async ({ bytes }): testOutput => new TextDecoder().decode(bytes.slice(0, 4)) === '<svg' ? 'image/svg+xml' : undefined,
    // default
    async (): Promise<string> => DEFAULT_MIME_TYPE
];

const overrides: Record<string, string> = {
    'video/quicktime': 'video/mp4'
}

export async function parseContentType (input: testInput): Promise<string> {
    let type = (await Promise.all(tests.map(async test => test(input)))).filter(Boolean)[0] as string
    if (type in overrides) {
        type = overrides[type]
    }
    return type
}
