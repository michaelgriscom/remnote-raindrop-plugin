import { describe, expect, it } from 'vitest';
import { mapHighlightColor } from './highlight-colors';

describe('mapHighlightColor', () => {
  it('maps RemNote-native colors directly', () => {
    expect(mapHighlightColor('yellow')).toBe('Yellow');
    expect(mapHighlightColor('blue')).toBe('Blue');
  });

  it('maps non-native colors to the closest RemNote color', () => {
    expect(mapHighlightColor('pink')).toBe('Red');
    expect(mapHighlightColor('teal')).toBe('Green');
    expect(mapHighlightColor('brown')).toBe('Orange');
  });

  it('is case-insensitive', () => {
    expect(mapHighlightColor('Yellow')).toBe('Yellow');
    expect(mapHighlightColor('INDIGO')).toBe('Blue');
  });

  it('returns undefined for unknown or missing colors', () => {
    expect(mapHighlightColor('chartreuse')).toBeUndefined();
    expect(mapHighlightColor('')).toBeUndefined();
    expect(mapHighlightColor(undefined as unknown as string)).toBeUndefined();
  });
});
