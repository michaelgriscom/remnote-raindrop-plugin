import { RNPlugin } from '@remnote/plugin-sdk';
import { ArticleWithHighlights } from './types';
import {
  SETTING_IDS,
  IMPORT_LOCATIONS,
  RAINDROP_ARTICLES_REM_NAME,
} from './constants';

type HighlightColor = 'Red' | 'Orange' | 'Yellow' | 'Green' | 'Blue' | 'Purple';

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

function mapHighlightColor(raindropColor: string): HighlightColor | undefined {
  return COLOR_MAP[raindropColor?.toLowerCase()];
}

async function getOrCreateDedicatedParent(plugin: RNPlugin) {
  const name = await plugin.richText.text(RAINDROP_ARTICLES_REM_NAME).value();
  let rem = await plugin.rem.findByName(name, null);

  if (!rem) {
    rem = await plugin.rem.createRem();
    if (!rem) throw new Error('Could not create Raindrop Articles Rem');
    await rem.setText(name);
    await rem.setIsDocument(true);
  }

  return rem;
}

async function getOrCreateDailySection(plugin: RNPlugin) {
  const dailyDoc = await plugin.date.getTodaysDoc();
  if (!dailyDoc) throw new Error('Could not access daily document');

  const sectionName = await plugin.richText.text(RAINDROP_ARTICLES_REM_NAME).value();
  const children = await dailyDoc.getChildrenRem();

  for (const child of children) {
    const childText = child.text;
    if (childText && Array.isArray(childText) && childText.length > 0) {
      try {
        const textStr = await plugin.richText.toString(childText);
        if (textStr === RAINDROP_ARTICLES_REM_NAME) {
          return child;
        }
      } catch {
        // Skip children with unparsable text
      }
    }
  }

  const section = await plugin.rem.createRem();
  if (!section) throw new Error('Could not create Raindrop Articles section');
  await section.setText(sectionName);
  await section.setParent(dailyDoc._id);
  await section.setFontSize('H2');

  return section;
}

async function getImportParent(plugin: RNPlugin) {
  const location = await plugin.settings.getSetting<string>(SETTING_IDS.IMPORT_LOCATION);

  if (location === IMPORT_LOCATIONS.DAILY) {
    return getOrCreateDailySection(plugin);
  }

  return getOrCreateDedicatedParent(plugin);
}

export async function importArticle(
  plugin: RNPlugin,
  article: ArticleWithHighlights
): Promise<void> {
  const parentRem = await getImportParent(plugin);
  const includeColors = await plugin.settings.getSetting<boolean>(SETTING_IDS.INCLUDE_COLORS);

  const articleRem = await plugin.rem.createRem();
  if (!articleRem) throw new Error('Could not create article Rem');

  const titleText = await plugin.richText
    .text(article.title, ['bold'])
    .text(` (${article.domain})`)
    .value();
  await articleRem.setText(titleText);
  await articleRem.setParent(parentRem._id);

  // Link the source URL
  const linkRem = await plugin.rem.createLinkRem(article.sourceUrl, false);
  if (linkRem) {
    await articleRem.addSource(linkRem);
  }

  for (const highlight of article.highlights) {
    if (!highlight.text?.trim()) continue;

    const highlightRem = await plugin.rem.createRem();
    if (!highlightRem) continue;

    const highlightText = await plugin.richText.text(highlight.text).value();
    await highlightRem.setText(highlightText);
    await highlightRem.setIsQuote(true);
    await highlightRem.setParent(articleRem._id);

    if (includeColors) {
      const remColor = mapHighlightColor(highlight.color);
      if (remColor) {
        await highlightRem.setHighlightColor(remColor);
      }
    }

    if (highlight.note && highlight.note.trim()) {
      const noteRem = await plugin.rem.createRem();
      if (noteRem) {
        const noteText = await plugin.richText
          .text('Note: ', ['bold'])
          .text(highlight.note)
          .value();
        await noteRem.setText(noteText);
        await noteRem.setParent(highlightRem._id);
      }
    }
  }
}
