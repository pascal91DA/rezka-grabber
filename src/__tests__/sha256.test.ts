import { sha256Hex, sha256Bytes } from '../utils/sha256';

describe('sha256Hex', () => {
  it('пустая строка', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('"abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('длинная ASCII-строка', () => {
    expect(sha256Hex('The quick brown fox jumps over the lazy dog')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    );
  });

  it('многобайтовый UTF-8 и суррогатные пары', () => {
    // Сверено с Node crypto: sha256(utf8("Привет, мир 🌍"))
    expect(sha256Hex('Привет, мир 🌍')).toBe(
      '28185ce8f8b46ad4e81e4c1ca69e8b3b676cbefc725f9a8b9007ba111198d4c5',
    );
  });

  it('sha256Bytes возвращает 32 байта', () => {
    expect(sha256Bytes('anything').length).toBe(32);
  });
});

describe('proof-of-work совместимость', () => {
  // Anubis-воркер требует floor(difficulty/2) нулевых байт в начале хэша.
  it('найденный nonce даёт хэш с нужными нулевыми байтами (difficulty=2)', () => {
    const randomData = 'bfaadd01e83950900e14de5307ae2b9c';
    const difficulty = 2;
    const fullZeroBytes = Math.floor(difficulty / 2);
    let nonce = 0;
    let h = sha256Bytes(randomData + nonce);
    while (h[0] !== 0) {
      nonce++;
      h = sha256Bytes(randomData + nonce);
    }
    for (let i = 0; i < fullZeroBytes; i++) {
      expect(h[i]).toBe(0);
    }
  });
});
