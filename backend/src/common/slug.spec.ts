import { SLUG_PATTERN, slugify } from './slug.js';

describe('slugify', () => {
  it.each([
    ['Home & Garden', 'home-garden'],
    ['  Phones  ', 'phones'],
    ['Café Électronique', 'cafe-electronique'],
    ['USB-C -- cables!', 'usb-c-cables'],
  ])('turns "%s" into "%s"', (input, expected) => {
    expect(slugify(input)).toBe(expected);
    expect(SLUG_PATTERN.test(expected)).toBe(true);
  });

  it('returns an empty string when nothing is transliterable', () => {
    expect(slugify('Книги')).toBe('');
  });
});
