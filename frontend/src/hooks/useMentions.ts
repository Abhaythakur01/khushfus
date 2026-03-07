"use client";

import { useState, useEffect, useCallback } from "react";

export interface MentionFilters {
  platform?: string;
  sentiment?: string;
  language?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface MentionAuthor {
  name: string;
  handle: string;
  avatar_url?: string;
  followers: number;
  influence_score: number;
  is_bot: boolean;
}

export interface Mention {
  id: number;
  platform: string;
  author: MentionAuthor;
  text: string;
  sentiment: "positive" | "negative" | "neutral";
  sentiment_score: number;
  sentiment_confidence: number;
  likes: number;
  shares: number;
  comments: number;
  reach: number;
  keywords: string[];
  topics: string[];
  source_url: string;
  has_media: boolean;
  is_flagged: boolean;
  language: string;
  created_at: string;
}

const MOCK_MENTIONS: Mention[] = [
  {
    id: 1,
    platform: "twitter",
    author: { name: "Sarah Chen", handle: "@sarahc_design", followers: 24500, influence_score: 72, is_bot: false },
    text: "Just tried the new @NovaBrand skincare line and I'm genuinely impressed. The hydrating serum absorbed instantly and my skin feels incredible after just one week. Highly recommend! #NovaBrand #Skincare",
    sentiment: "positive",
    sentiment_score: 0.92,
    sentiment_confidence: 0.95,
    likes: 342,
    shares: 89,
    comments: 47,
    reach: 18200,
    keywords: ["NovaBrand", "skincare", "serum"],
    topics: ["Product Review", "Skincare"],
    source_url: "https://twitter.com/sarahc_design/status/123456",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-07T10:30:00Z",
  },
  {
    id: 2,
    platform: "instagram",
    author: { name: "Mike Torres", handle: "@mike.torres.fit", followers: 156000, influence_score: 85, is_bot: false },
    text: "Morning routine featuring @NovaBrand Vitamin C serum. 3 months in and the results speak for themselves. Swipe for before/after! #sponsored #NovaSkin",
    sentiment: "positive",
    sentiment_score: 0.88,
    sentiment_confidence: 0.91,
    likes: 4521,
    shares: 230,
    comments: 312,
    reach: 89000,
    keywords: ["NovaBrand", "Vitamin C", "serum"],
    topics: ["Influencer", "Skincare"],
    source_url: "https://instagram.com/p/abc123",
    has_media: true,
    is_flagged: true,
    language: "en",
    created_at: "2026-03-07T08:15:00Z",
  },
  {
    id: 3,
    platform: "reddit",
    author: { name: "skincare_guru22", handle: "u/skincare_guru22", followers: 890, influence_score: 35, is_bot: false },
    text: "Has anyone else had issues with NovaBrand customer service? Ordered 2 weeks ago and still no shipping confirmation. Their chat support just keeps giving canned responses. Pretty disappointed.",
    sentiment: "negative",
    sentiment_score: -0.76,
    sentiment_confidence: 0.88,
    likes: 127,
    shares: 12,
    comments: 43,
    reach: 3400,
    keywords: ["NovaBrand", "customer service", "shipping"],
    topics: ["Customer Service", "Complaints"],
    source_url: "https://reddit.com/r/skincare/comments/xyz",
    has_media: false,
    is_flagged: true,
    language: "en",
    created_at: "2026-03-07T06:45:00Z",
  },
  {
    id: 4,
    platform: "youtube",
    author: { name: "Beauty by Priya", handle: "@beautybypriya", followers: 320000, influence_score: 91, is_bot: false },
    text: "HONEST REVIEW: NovaBrand's entire 2026 spring collection. Some products are amazing, others... not so much. Full breakdown with swatches and wear tests in this video.",
    sentiment: "neutral",
    sentiment_score: 0.12,
    sentiment_confidence: 0.82,
    likes: 8923,
    shares: 1240,
    comments: 892,
    reach: 245000,
    keywords: ["NovaBrand", "spring collection", "review"],
    topics: ["Product Review", "Beauty"],
    source_url: "https://youtube.com/watch?v=def456",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-06T22:00:00Z",
  },
  {
    id: 5,
    platform: "twitter",
    author: { name: "James R.", handle: "@jamesr_nyc", followers: 1200, influence_score: 18, is_bot: false },
    text: "NovaBrand really needs to reformulate their moisturizer. The new version broke me out badly. Old formula was perfect, why change it? @NovaBrand #disappointed",
    sentiment: "negative",
    sentiment_score: -0.82,
    sentiment_confidence: 0.93,
    likes: 56,
    shares: 14,
    comments: 22,
    reach: 980,
    keywords: ["NovaBrand", "moisturizer", "reformulate"],
    topics: ["Product Feedback", "Complaints"],
    source_url: "https://twitter.com/jamesr_nyc/status/789012",
    has_media: false,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-06T19:30:00Z",
  },
  {
    id: 6,
    platform: "facebook",
    author: { name: "Lisa Wang", handle: "lisa.wang.beauty", followers: 5600, influence_score: 42, is_bot: false },
    text: "Just attended the NovaBrand pop-up event in downtown LA and it was such a great experience! Free samples, live demos, and the team was so welcoming. Can't wait for the next one!",
    sentiment: "positive",
    sentiment_score: 0.91,
    sentiment_confidence: 0.94,
    likes: 234,
    shares: 45,
    comments: 38,
    reach: 4200,
    keywords: ["NovaBrand", "pop-up", "event"],
    topics: ["Events", "Brand Experience"],
    source_url: "https://facebook.com/lisa.wang/posts/321",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-06T16:00:00Z",
  },
  {
    id: 7,
    platform: "tiktok",
    author: { name: "Glow Queen", handle: "@glowqueen", followers: 890000, influence_score: 95, is_bot: false },
    text: "POV: You finally find a sunscreen that doesn't leave a white cast. Thank you @NovaBrand SPF 50! Dark skin friendly sunscreen that actually works. Link in bio #sunscreen #darkskin #NovaBrand",
    sentiment: "positive",
    sentiment_score: 0.95,
    sentiment_confidence: 0.97,
    likes: 45000,
    shares: 12300,
    comments: 3400,
    reach: 1200000,
    keywords: ["NovaBrand", "sunscreen", "SPF"],
    topics: ["Product Review", "Inclusivity"],
    source_url: "https://tiktok.com/@glowqueen/video/111",
    has_media: true,
    is_flagged: true,
    language: "en",
    created_at: "2026-03-06T14:20:00Z",
  },
  {
    id: 8,
    platform: "linkedin",
    author: { name: "David Park", handle: "david-park-cmo", followers: 18500, influence_score: 68, is_bot: false },
    text: "Impressed by NovaBrand's sustainability report for Q1 2026. Their commitment to recyclable packaging and carbon-neutral shipping sets a new benchmark for the beauty industry. Other brands should take note.",
    sentiment: "positive",
    sentiment_score: 0.85,
    sentiment_confidence: 0.90,
    likes: 567,
    shares: 123,
    comments: 45,
    reach: 12300,
    keywords: ["NovaBrand", "sustainability", "packaging"],
    topics: ["Sustainability", "Industry"],
    source_url: "https://linkedin.com/posts/david-park/456",
    has_media: false,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-06T11:00:00Z",
  },
  {
    id: 9,
    platform: "twitter",
    author: { name: "BotFarm3000", handle: "@totally_real_user99", followers: 12, influence_score: 1, is_bot: true },
    text: "NovaBrand is the BEST brand EVER! Buy NovaBrand now! Amazing products! Click here for 90% off!!!",
    sentiment: "positive",
    sentiment_score: 0.99,
    sentiment_confidence: 0.45,
    likes: 0,
    shares: 0,
    comments: 0,
    reach: 5,
    keywords: ["NovaBrand"],
    topics: ["Spam"],
    source_url: "https://twitter.com/totally_real_user99/status/spam",
    has_media: false,
    is_flagged: true,
    language: "en",
    created_at: "2026-03-06T09:00:00Z",
  },
  {
    id: 10,
    platform: "instagram",
    author: { name: "Emma Rodriguez", handle: "@emmabeautyrd", followers: 45000, influence_score: 76, is_bot: false },
    text: "Comparing NovaBrand vs GlowCo retinol serums side by side. After 6 weeks of testing, here's my honest take. NovaBrand has better texture but GlowCo edges ahead on results. Full review in stories.",
    sentiment: "neutral",
    sentiment_score: 0.05,
    sentiment_confidence: 0.86,
    likes: 1890,
    shares: 340,
    comments: 267,
    reach: 32000,
    keywords: ["NovaBrand", "GlowCo", "retinol", "serum"],
    topics: ["Product Comparison", "Competitor"],
    source_url: "https://instagram.com/p/compare789",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-05T20:30:00Z",
  },
  {
    id: 11,
    platform: "twitter",
    author: { name: "Ana Lucia", handle: "@analuciabeauty", followers: 8900, influence_score: 55, is_bot: false },
    text: "Me encanta la nueva linea de NovaBrand! Los productos son increibles y los precios son muy accesibles. Recomiendo el serum de acido hialuronico. #NovaBrand #belleza",
    sentiment: "positive",
    sentiment_score: 0.89,
    sentiment_confidence: 0.91,
    likes: 234,
    shares: 56,
    comments: 28,
    reach: 6700,
    keywords: ["NovaBrand", "serum", "acido hialuronico"],
    topics: ["Product Review", "Spanish Market"],
    source_url: "https://twitter.com/analuciabeauty/status/es123",
    has_media: false,
    is_flagged: false,
    language: "es",
    created_at: "2026-03-05T18:00:00Z",
  },
  {
    id: 12,
    platform: "reddit",
    author: { name: "ingredient_nerd", handle: "u/ingredient_nerd", followers: 2300, influence_score: 41, is_bot: false },
    text: "Broke down the NovaBrand Vitamin C serum ingredients list. It's actually quite well-formulated: 15% L-ascorbic acid, vitamin E, ferulic acid. The pH is around 3.5 which is ideal. Solid product for the price point.",
    sentiment: "positive",
    sentiment_score: 0.72,
    sentiment_confidence: 0.87,
    likes: 456,
    shares: 89,
    comments: 67,
    reach: 8900,
    keywords: ["NovaBrand", "Vitamin C", "ingredients"],
    topics: ["Product Analysis", "Ingredients"],
    source_url: "https://reddit.com/r/skincareaddiction/comments/ijk",
    has_media: false,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-05T15:45:00Z",
  },
  {
    id: 13,
    platform: "facebook",
    author: { name: "Karen Mitchell", handle: "karen.mitchell.55", followers: 320, influence_score: 8, is_bot: false },
    text: "Worst experience with NovaBrand! Received a damaged package, took 5 calls to get a replacement. When it finally arrived, it was the wrong product! Never again. Switching to GlowCo.",
    sentiment: "negative",
    sentiment_score: -0.93,
    sentiment_confidence: 0.96,
    likes: 23,
    shares: 8,
    comments: 15,
    reach: 450,
    keywords: ["NovaBrand", "GlowCo", "damaged", "replacement"],
    topics: ["Customer Service", "Complaints"],
    source_url: "https://facebook.com/karen.mitchell/posts/999",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-05T12:30:00Z",
  },
  {
    id: 14,
    platform: "tiktok",
    author: { name: "Derek Styles", handle: "@derekstyles", followers: 67000, influence_score: 78, is_bot: false },
    text: "Men's skincare routine using only NovaBrand products. Yes guys, skincare is for everyone. This cleanser + moisturizer combo is chef's kiss. #menskincare #NovaBrand #grwm",
    sentiment: "positive",
    sentiment_score: 0.86,
    sentiment_confidence: 0.89,
    likes: 12300,
    shares: 2100,
    comments: 890,
    reach: 178000,
    keywords: ["NovaBrand", "mens skincare", "cleanser", "moisturizer"],
    topics: ["Men's Grooming", "Product Review"],
    source_url: "https://tiktok.com/@derekstyles/video/222",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-05T10:00:00Z",
  },
  {
    id: 15,
    platform: "youtube",
    author: { name: "Dr. Amy Liu", handle: "@dramyliu", followers: 520000, influence_score: 93, is_bot: false },
    text: "Dermatologist reacts to NovaBrand's new anti-aging line. Breaking down the science behind their peptide complex and whether it actually delivers on the claims. Spoiler: mostly yes, with some caveats.",
    sentiment: "neutral",
    sentiment_score: 0.25,
    sentiment_confidence: 0.84,
    likes: 15600,
    shares: 3200,
    comments: 1450,
    reach: 380000,
    keywords: ["NovaBrand", "anti-aging", "peptide", "dermatologist"],
    topics: ["Expert Review", "Science"],
    source_url: "https://youtube.com/watch?v=science789",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-04T22:00:00Z",
  },
  {
    id: 16,
    platform: "twitter",
    author: { name: "Tech Beauty Blog", handle: "@techbeautyblog", followers: 34000, influence_score: 71, is_bot: false },
    text: "NovaBrand just launched their AR try-on feature in their app. Tested it out and it's surprisingly accurate for foundation shade matching. The tech is powered by AI and works great even in low light. #beautytech",
    sentiment: "positive",
    sentiment_score: 0.78,
    sentiment_confidence: 0.88,
    likes: 890,
    shares: 234,
    comments: 67,
    reach: 24500,
    keywords: ["NovaBrand", "AR", "app", "AI", "foundation"],
    topics: ["Technology", "Innovation"],
    source_url: "https://twitter.com/techbeautyblog/status/tech456",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-04T17:30:00Z",
  },
  {
    id: 17,
    platform: "linkedin",
    author: { name: "Rachel Foster", handle: "rachel-foster-vp", followers: 11200, influence_score: 62, is_bot: false },
    text: "Congratulations to NovaBrand on being named one of Fast Company's Most Innovative Beauty Companies for 2026. Their DTC strategy and community-first approach is a masterclass in modern brand building.",
    sentiment: "positive",
    sentiment_score: 0.88,
    sentiment_confidence: 0.92,
    likes: 345,
    shares: 78,
    comments: 23,
    reach: 8900,
    keywords: ["NovaBrand", "Fast Company", "innovative", "DTC"],
    topics: ["Awards", "Industry"],
    source_url: "https://linkedin.com/posts/rachel-foster/789",
    has_media: false,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-04T14:00:00Z",
  },
  {
    id: 18,
    platform: "instagram",
    author: { name: "Marie Dupont", handle: "@mariedupont_paris", followers: 78000, influence_score: 80, is_bot: false },
    text: "NovaBrand arrive enfin en France! J'ai teste toute la gamme et je suis conquise. Le serum a la vitamine C est mon favori. Revue complete dans mon dernier post. #NovaBrand #beauteFrancaise",
    sentiment: "positive",
    sentiment_score: 0.91,
    sentiment_confidence: 0.89,
    likes: 3400,
    shares: 567,
    comments: 234,
    reach: 56000,
    keywords: ["NovaBrand", "France", "vitamine C", "serum"],
    topics: ["International Expansion", "Product Review"],
    source_url: "https://instagram.com/p/france456",
    has_media: true,
    is_flagged: false,
    language: "fr",
    created_at: "2026-03-04T10:00:00Z",
  },
  {
    id: 19,
    platform: "twitter",
    author: { name: "Consumer Watch", handle: "@consumerwatch", followers: 89000, influence_score: 82, is_bot: false },
    text: "BREAKING: NovaBrand recalls batch #NB-2026-Q1 of their eye cream due to potential contamination. If you purchased between Jan-Feb, check the batch number on the packaging. Full details on our site.",
    sentiment: "negative",
    sentiment_score: -0.65,
    sentiment_confidence: 0.94,
    likes: 2340,
    shares: 4500,
    comments: 890,
    reach: 156000,
    keywords: ["NovaBrand", "recall", "eye cream", "contamination"],
    topics: ["Product Safety", "Crisis"],
    source_url: "https://twitter.com/consumerwatch/status/recall123",
    has_media: false,
    is_flagged: true,
    language: "en",
    created_at: "2026-03-03T20:00:00Z",
  },
  {
    id: 20,
    platform: "reddit",
    author: { name: "deal_hunter_99", handle: "u/deal_hunter_99", followers: 450, influence_score: 15, is_bot: false },
    text: "PSA: NovaBrand is having a 30% off sale on their website right now. Code SPRING26. Stocking up on the cleanser and the SPF. Best prices I've seen for these products.",
    sentiment: "positive",
    sentiment_score: 0.68,
    sentiment_confidence: 0.85,
    likes: 234,
    shares: 123,
    comments: 45,
    reach: 5600,
    keywords: ["NovaBrand", "sale", "discount", "cleanser", "SPF"],
    topics: ["Deals", "Promotions"],
    source_url: "https://reddit.com/r/beautydeals/comments/sale",
    has_media: false,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-03T15:00:00Z",
  },
  {
    id: 21,
    platform: "tiktok",
    author: { name: "Aisha K", handle: "@aishak_beauty", followers: 23000, influence_score: 64, is_bot: false },
    text: "Exposing NovaBrand's 'clean beauty' claims. I looked into their ingredient sourcing and... it's complicated. Not as green as they market themselves. Thread in comments. #cleanbeauty #greenwashing",
    sentiment: "negative",
    sentiment_score: -0.58,
    sentiment_confidence: 0.83,
    likes: 8900,
    shares: 3400,
    comments: 1200,
    reach: 134000,
    keywords: ["NovaBrand", "clean beauty", "greenwashing", "ingredients"],
    topics: ["Sustainability", "Controversy"],
    source_url: "https://tiktok.com/@aishak_beauty/video/333",
    has_media: true,
    is_flagged: true,
    language: "en",
    created_at: "2026-03-03T12:00:00Z",
  },
  {
    id: 22,
    platform: "facebook",
    author: { name: "NovaBrand Community", handle: "novabrand.community", followers: 15600, influence_score: 58, is_bot: false },
    text: "Who else is excited about NovaBrand's new collab with designer Yuki Tanaka? The limited edition packaging is EVERYTHING. Drop date is March 15th. Setting my alarm! Who's joining?",
    sentiment: "positive",
    sentiment_score: 0.87,
    sentiment_confidence: 0.90,
    likes: 678,
    shares: 145,
    comments: 89,
    reach: 12000,
    keywords: ["NovaBrand", "collaboration", "Yuki Tanaka", "limited edition"],
    topics: ["Collaboration", "Brand News"],
    source_url: "https://facebook.com/novabrand.community/posts/collab",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-03T09:00:00Z",
  },
  {
    id: 23,
    platform: "twitter",
    author: { name: "Raj Patel", handle: "@rajpatel_reviews", followers: 3400, influence_score: 32, is_bot: false },
    text: "Switched from NovaBrand to their competitor after the price increase. Same quality products at 40% less. NovaBrand needs to reconsider their pricing strategy if they want to keep mid-range customers.",
    sentiment: "negative",
    sentiment_score: -0.52,
    sentiment_confidence: 0.86,
    likes: 145,
    shares: 34,
    comments: 56,
    reach: 2800,
    keywords: ["NovaBrand", "price increase", "competitor", "pricing"],
    topics: ["Pricing", "Customer Churn"],
    source_url: "https://twitter.com/rajpatel_reviews/status/price789",
    has_media: false,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-02T21:00:00Z",
  },
  {
    id: 24,
    platform: "instagram",
    author: { name: "Clean Beauty Co", handle: "@cleanbeautyco", followers: 210000, influence_score: 88, is_bot: false },
    text: "Our top 10 cruelty-free brands for 2026 and @NovaBrand made the list at #3! Their commitment to ethical sourcing and vegan formulas continues to impress. Full list in our latest blog post.",
    sentiment: "positive",
    sentiment_score: 0.83,
    sentiment_confidence: 0.91,
    likes: 5600,
    shares: 890,
    comments: 345,
    reach: 145000,
    keywords: ["NovaBrand", "cruelty-free", "vegan", "ethical"],
    topics: ["Awards", "Ethics"],
    source_url: "https://instagram.com/p/list789",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-02T16:00:00Z",
  },
  {
    id: 25,
    platform: "youtube",
    author: { name: "Budget Beauty", handle: "@budgetbeauty", followers: 145000, influence_score: 83, is_bot: false },
    text: "NovaBrand DUPES that are just as good! Found 5 drugstore alternatives that perform identically to their bestsellers. Save your money and watch this before buying!",
    sentiment: "negative",
    sentiment_score: -0.35,
    sentiment_confidence: 0.78,
    likes: 23400,
    shares: 5600,
    comments: 2100,
    reach: 320000,
    keywords: ["NovaBrand", "dupes", "drugstore", "alternatives"],
    topics: ["Competitor", "Budget Beauty"],
    source_url: "https://youtube.com/watch?v=dupes456",
    has_media: true,
    is_flagged: false,
    language: "en",
    created_at: "2026-03-02T12:00:00Z",
  },
];

export function useMentions(projectId: number, filters?: MentionFilters) {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [currentFilters, setCurrentFilters] = useState<MentionFilters>(filters || {});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMentions = useCallback(() => {
    setIsLoading(true);
    setError(null);

    // Simulate API call with filtering
    setTimeout(() => {
      let filtered = [...MOCK_MENTIONS];

      if (currentFilters.platform && currentFilters.platform !== "all") {
        filtered = filtered.filter((m) => m.platform === currentFilters.platform);
      }
      if (currentFilters.sentiment && currentFilters.sentiment !== "all") {
        filtered = filtered.filter((m) => m.sentiment === currentFilters.sentiment);
      }
      if (currentFilters.language && currentFilters.language !== "all") {
        filtered = filtered.filter((m) => m.language === currentFilters.language);
      }
      if (currentFilters.search) {
        const q = currentFilters.search.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            m.text.toLowerCase().includes(q) ||
            m.author.name.toLowerCase().includes(q) ||
            m.author.handle.toLowerCase().includes(q)
        );
      }
      if (currentFilters.dateFrom) {
        filtered = filtered.filter((m) => m.created_at >= currentFilters.dateFrom!);
      }
      if (currentFilters.dateTo) {
        filtered = filtered.filter((m) => m.created_at <= currentFilters.dateTo!);
      }

      setTotal(filtered.length);
      const start = (page - 1) * pageSize;
      setMentions(filtered.slice(start, start + pageSize));
      setIsLoading(false);
    }, 600);
  }, [page, pageSize, currentFilters]);

  useEffect(() => {
    fetchMentions();
  }, [fetchMentions]);

  const setFilters = (newFilters: MentionFilters) => {
    setCurrentFilters(newFilters);
    setPage(1);
  };

  const toggleFlag = (id: number) => {
    setMentions((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_flagged: !m.is_flagged } : m))
    );
  };

  return {
    mentions,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    setFilters,
    filters: currentFilters,
    isLoading,
    error,
    toggleFlag,
    refetch: fetchMentions,
  };
}
