export interface LbEvent {
  _id: string;
  eventCode?: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  format?: 'online' | 'offline' | null;
  type?: string | null;
  authorId?: string | null;
  guests?: string[] | null;
  capacity?: number | null;
  registeredCount?: number | null;
  bookIds?: string[] | null;
  recordingUrl?: string | null;
  image?: string | null;
}

export interface NewsItem {
  _id: string;
  id?: string;
  title: string;
  desc?: string | null;
  category?: string | null;
  tag?: string | null;
  cover?: string | null;
  img?: string | null;
  imageCredit?: string | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  views?: number;
  readMinutes: number;
  content?: string;
  contentFormat?: string | null;
  quote?: string | null;
  author?: { name: string; role?: string | null; bio?: string | null; avatar?: string | null } | null;
  bookIds?: string[] | null;
  tags?: string[] | null;
}

export interface NewsPage {
  items: NewsItem[];
  total: number;
  categories: string[];
}
