export type Author = { id: string; handle: string; displayName: string; avatarUrl: string | null };

export type Post = {
  id: string;
  title: string;
  body: string;
  lang: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUrl: string | null;
  field: string;
  hashtags: string[];
  aiAssisted: boolean;
  promoted: boolean;
  viewCount: number;
  saveCount: number;
  createdAt: string;
  isFavorited: boolean;
  author: Author;
};

export type Me = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isCreator: boolean;
  isAdult: boolean;
  isPremium: boolean;
};

export type PriceItem = { name: string; price: number; description: string };

export type CreatorProfile = {
  user: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    bioLang: string;
    isCreator: boolean;
    theme: string;
    decoration: string;
    acceptingRequests: boolean;
    monthlyCapacity: number;
    remainingThisMonth: number;
    completedCount: number;
    followerCount: number;
    isFollowing: boolean;
    isSelf: boolean;
  };
  settings: {
    priceList: PriceItem[];
    samplePostIds: string[];
    samples: Post[];
    notes: string;
    productionDays: number;
    paymentTerms: string;
    retakeCount: number;
  };
  templates: { id: string; title: string; body: string }[];
  posts?: Post[];
};

export type RequestSummary = {
  id: string;
  title: string;
  price: number;
  dueDate: string;
  status: string;
  role: 'creator' | 'client';
  counterpart: Author;
  createdAt: string;
};
