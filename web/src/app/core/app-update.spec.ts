import { isChunkLoadError, mayReload } from './app-update';

describe('isChunkLoadError', () => {
  it('recognises the errors a stale copy of the app gets', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/chunk-ABC.js'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 123 failed.'))).toBe(true);
    expect(isChunkLoadError(new SyntaxError("Unexpected token '<'"))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });
  it('leaves other errors alone', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('Not allowed')).toBe(false);
  });
});

describe('mayReload', () => {
  it('allows the first reload', () => expect(mayReload(null, 1000)).toBe(true));
  it('blocks a second reload within a minute, so it cannot loop', () => {
    expect(mayReload(1000, 30_000)).toBe(false);
  });
  it('allows another one after the window', () => {
    expect(mayReload(1000, 62_000)).toBe(true);
  });
});
