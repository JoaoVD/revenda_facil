import { describe, expect, it } from 'vitest';
import { isPhone } from '@/lib/device';

describe('isPhone', () => {
  it('reconhece celulares pelo Client Hint do Chrome', () => {
    expect(isPhone('qualquer coisa', '?1')).toBe(true);
    expect(isPhone('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', '?0')).toBe(
      false,
    );
  });
  it('reconhece iPhone e Android celular pelo user agent', () => {
    expect(
      isPhone(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
        null,
      ),
    ).toBe(true);
    expect(
      isPhone(
        'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
        null,
      ),
    ).toBe(true);
  });
  it('trata computador e tablet Android como tela grande', () => {
    expect(
      isPhone(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
        null,
      ),
    ).toBe(false);
    expect(
      isPhone(
        'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
        null,
      ),
    ).toBe(false);
    expect(isPhone(null, null)).toBe(false);
  });
});
