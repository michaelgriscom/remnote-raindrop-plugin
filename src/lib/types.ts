export interface RaindropHighlight {
  _id: string;
  raindropRef: number;
  text: string;
  title: string;
  color: string;
  note: string;
  created: string;
  lastUpdate: string;
  tags: string[];
  link: string;
}

export interface HighlightsResponse {
  result: boolean;
  items: RaindropHighlight[];
}

export interface RaindropsResponse {
  result: boolean;
  items: { _id: number }[];
}

export interface ArticleWithHighlights {
  sourceUrl: string;
  title: string;
  domain: string;
  highlights: RaindropHighlight[];
  lastUpdate: string;
}

export interface SyncResult {
  imported: number;
  archived: number;
  errors: string[];
}
