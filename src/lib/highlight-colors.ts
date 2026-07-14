export type HighlightColor = 'Red' | 'Orange' | 'Yellow' | 'Green' | 'Blue' | 'Purple';

// Raindrop allows arbitrary colors; map the common ones onto RemNote's palette.
const COLOR_MAP: Record<string, HighlightColor> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  indigo: 'Blue',
  purple: 'Purple',
  pink: 'Red',
  teal: 'Green',
  cyan: 'Blue',
  brown: 'Orange',
};

export function mapHighlightColor(raindropColor: string): HighlightColor | undefined {
  return COLOR_MAP[raindropColor?.toLowerCase()];
}
