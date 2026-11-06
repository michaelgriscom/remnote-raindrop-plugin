import { RNPlugin } from '@remnote/plugin-sdk';
import { ArticleWithHighlights, RaindropHighlight } from './types';
import { mapHighlightColor } from './highlight-colors';
import {
  SETTING_IDS,
  STORAGE_KEYS,
  IMPORT_LOCATIONS,
  RAINDROP_ARTICLES_REM_NAME,
  COMPLETED_SECTION_NAME,
} from './constants';

// The SDK doesn't re-export its Rem class from the package root.
type Rem = NonNullable<Awaited<ReturnType<RNPlugin['rem']['createRem']>>>;

async function findChildByText(
  plugin: RNPlugin,
  parent: Rem,
  name: string
): Promise<Rem | undefined> {
  const children = await parent.getChildrenRem();

  for (const child of children) {
    const childText = child.text;
    if (childText && Array.isArray(childText) && childText.length > 0) {
      try {
        const textStr = await plugin.richText.toString(childText);
        if (textStr === name) {
          return child;
        }
      } catch {
        // Skip children with unparsable text
      }
    }
  }

  return undefined;
}

async function getOrCreateDedicatedParent(plugin: RNPlugin) {
  // Prefer the Rem we created earlier: findByName only matches top-level Rem,
  // so once the user files the document under another Rem a name lookup would
  // miss it and every sync would spawn a fresh top-level copy.
  const storedId = await plugin.storage.getSynced<string>(STORAGE_KEYS.DEDICATED_PARENT_REM_ID);
  if (storedId) {
    const stored = await plugin.rem.findOne(storedId);
    if (stored) return stored;
  }

  const name = await plugin.richText.text(RAINDROP_ARTICLES_REM_NAME).value();
  let rem = await plugin.rem.findByName(name, null);

  if (!rem) {
    rem = await plugin.rem.createRem();
    if (!rem) throw new Error('Could not create Raindrop Articles Rem');
    await rem.setText(name);
    await rem.setIsDocument(true);
  }

  await plugin.storage.setSynced(STORAGE_KEYS.DEDICATED_PARENT_REM_ID, rem._id);
  return rem;
}

async function getOrCreateDailySection(plugin: RNPlugin) {
  const dailyDoc = await plugin.date.getTodaysDoc();
  if (!dailyDoc) throw new Error('Could not access daily document');

  const existing = await findChildByText(plugin, dailyDoc, RAINDROP_ARTICLES_REM_NAME);
  if (existing) return existing;

  const sectionName = await plugin.richText.text(RAINDROP_ARTICLES_REM_NAME).value();
  const section = await plugin.rem.createRem();
  if (!section) throw new Error('Could not create Raindrop Articles section');
  await section.setText(sectionName);
  await section.setParent(dailyDoc._id);
  await section.setFontSize('H2');

  return section;
}

async function getOrCreateCompletedSection(plugin: RNPlugin) {
  const dedicatedParent = await getOrCreateDedicatedParent(plugin);

  const existing = await findChildByText(plugin, dedicatedParent, COMPLETED_SECTION_NAME);
  if (existing) return existing;

  // Add a blank separator before the Completed heading
  const separator = await plugin.rem.createRem();
  if (separator) {
    await separator.setParent(dedicatedParent._id);
  }

  const section = await plugin.rem.createRem();
  if (!section) throw new Error('Could not create Completed section');
  const sectionName = await plugin.richText.text(COMPLETED_SECTION_NAME).value();
  await section.setText(sectionName);
  await section.setParent(dedicatedParent._id);
  await section.setFontSize('H2');

  return section;
}

export async function moveArticleToCompleted(plugin: RNPlugin, remId: string): Promise<void> {
  const rem = await plugin.rem.findOne(remId);
  if (!rem) return;

  const completedParent = await getOrCreateCompletedSection(plugin);
  await rem.setParent(completedParent._id);
}

async function getImportParent(plugin: RNPlugin) {
  const location = await plugin.settings.getSetting<string>(SETTING_IDS.IMPORT_LOCATION);

  if (location === IMPORT_LOCATIONS.DAILY) {
    return getOrCreateDailySection(plugin);
  }

  return getOrCreateDedicatedParent(plugin);
}

export interface ImportArticleResult {
  articleRemId: string;
  /** Ids of highlights that were written (or intentionally skipped as empty). */
  importedHighlightIds: string[];
  /** One message per highlight that could not be written. */
  errors: string[];
}

/**
 * Create (or extend) the Rem for an article and append its highlights.
 *
 * Throws only when the article Rem itself cannot be created. A failure while
 * writing an individual highlight is reported in `errors` instead, so the
 * caller can still record the article Rem and the highlights that did land;
 * otherwise the next sync would re-import everything into a duplicate article.
 */
export async function importArticle(
  plugin: RNPlugin,
  article: ArticleWithHighlights,
  existingArticleRemId?: string
): Promise<ImportArticleResult> {
  const includeColors = await plugin.settings.getSetting<boolean>(SETTING_IDS.INCLUDE_COLORS);

  let articleRem;
  if (existingArticleRemId) {
    articleRem = await plugin.rem.findOne(existingArticleRemId);
  }

  if (!articleRem) {
    const parentRem = await getImportParent(plugin);
    articleRem = await plugin.rem.createRem();
    if (!articleRem) throw new Error('Could not create article Rem');

    const titleText = await plugin.richText
      .text(article.title, ['bold'])
      .text(` (${article.domain})`)
      .value();
    await articleRem.setText(titleText);
    await articleRem.setParent(parentRem._id, 0);

    // Link the source URL
    const linkRem = await plugin.rem.createLinkRem(article.sourceUrl, false);
    if (linkRem) {
      await articleRem.addSource(linkRem);
    }
  }

  const importedHighlightIds: string[] = [];
  const errors: string[] = [];

  for (const highlight of article.highlights) {
    if (!highlight.text?.trim()) {
      importedHighlightIds.push(highlight._id);
      continue;
    }

    try {
      await createHighlightRem(plugin, articleRem, highlight, !!includeColors);
      importedHighlightIds.push(highlight._id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to import a highlight from "${article.title}": ${message}`);
    }
  }

  return { articleRemId: articleRem._id, importedHighlightIds, errors };
}

async function createHighlightRem(
  plugin: RNPlugin,
  articleRem: Rem,
  highlight: RaindropHighlight,
  includeColors: boolean
): Promise<void> {
  const highlightRem = await plugin.rem.createRem();
  if (!highlightRem) throw new Error('Could not create highlight Rem');

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
      const noteText = await plugin.richText.text('Note: ', ['bold']).text(highlight.note).value();
      await noteRem.setText(noteText);
      await noteRem.setParent(highlightRem._id);
    }
  }
}
