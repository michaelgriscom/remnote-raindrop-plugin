import { describe, expect, it } from 'vitest';
import { formatSyncSummary } from './sync-report';

describe('formatSyncSummary', () => {
  it('reports imported highlights', () => {
    expect(formatSyncSummary({ imported: 3, archived: 0, errors: [] })).toBe(
      'Imported 3 highlight(s).'
    );
  });

  it('reports archived articles', () => {
    expect(formatSyncSummary({ imported: 0, archived: 2, errors: [] })).toBe(
      'Archived 2 article(s).'
    );
  });

  it('combines imports and archives into one sentence', () => {
    expect(formatSyncSummary({ imported: 3, archived: 1, errors: [] })).toBe(
      'Imported 3 highlight(s), archived 1 article(s).'
    );
  });

  it('reports when nothing happened', () => {
    expect(formatSyncSummary({ imported: 0, archived: 0, errors: [] })).toBe(
      'No new highlights to import.'
    );
  });

  it('reports errors when nothing was imported or archived', () => {
    expect(formatSyncSummary({ imported: 0, archived: 0, errors: ['boom'] })).toBe(
      'Sync completed with errors.'
    );
  });

  it('still reports partial progress when there are errors', () => {
    expect(formatSyncSummary({ imported: 2, archived: 0, errors: ['boom'] })).toBe(
      'Imported 2 highlight(s).'
    );
  });
});
