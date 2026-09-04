import { validateBookId, validateProgressInput, validateSettingsInput } from '../../src/main/ipc';

const validId = 'a'.repeat(64);

describe('IPC validation', () => {
  it('accepts only SHA-256 shaped managed book identifiers', () => {
    expect(validateBookId(validId)).toBe(validId);
    expect(() => validateBookId('../outside')).toThrow(/参数无效/);
    expect(() => validateBookId('A'.repeat(64))).toThrow(/参数无效/);
  });

  it('validates progress objects without silently coercing values', () => {
    expect(validateProgressInput({ bookId: validId, charOffset: 20 })).toEqual({
      bookId: validId,
      charOffset: 20,
    });
    expect(() => validateProgressInput({ bookId: validId, charOffset: '20' })).toThrow();
    expect(() => validateProgressInput({ bookId: validId, charOffset: 2.5 })).toThrow();
  });

  it('allows only the supported font-size setting', () => {
    expect(validateSettingsInput({ fontSize: 'large' })).toEqual({ fontSize: 'large' });
    expect(() => validateSettingsInput({ fontSize: 'huge' })).toThrow();
    expect(() => validateSettingsInput({ fontSize: 'small', extra: true })).toThrow();
  });
});
