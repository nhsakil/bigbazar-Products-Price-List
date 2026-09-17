/**
 * Shared customer-query routing for Big Bazar assistant.
 * Used by production Cloudflare Function and Vite local middleware.
 */
import { FAQ_KB, matchFAQ, DELIVERY_AREAS } from './assistant-kb.js';

const ORDER_INTENT_RE =
  /nite\s*cai|nite\s*chai|নিতে\s*চাই|নিবো|\bnibo\b|order\s*korte|অর্ডার\s*করতে|kinte\s*cai|kinte\s*chai|কিনতে\s*চাই|pathan|পাঠান|\bkinbo\b|কিনব/i;

const DETAIL_INQUIRY_RE =
  /video|ভিডিও|kapor|কাপড়|কাপর|fabric|ফেব্রি|মেটেরিয়াল|material|কোয়ালিটি|quality|rong|রং|কালার|color|wash|ওয়াশ|suiti|সুতি|silk|সিল্ক|jamdani|জামদানি|dupiyan|ডুপিয়ান|chobi|ছবি|photo|picture|real|লাইভ|হাতে|পাওয়া|কতদিন|সময়|ঠিকানা|শোরুম|কম|discount|customer|দাম|price|koto|কত|পেমেন্ট|বিকাশ|bkash|delivery|ডেলিভারি|charge|payment|সাইজ|size|return|রিটার্ন|whatsapp|হোয়াটস|facebook|ইনস্টা|tiktok/i;

const CATALOG_SEARCH_RE =
  /কালেকশন|collection|দেখাও|দেখান|show|খুঁজছি|dekhte\s*chai|দেখতে\s*চাই|dress|পোশাক|poshak|পাওয়া\s*যাবে|pawa\s*jabe|aro|আরও|more|next/i;

export function mapProductRow(r) {
  let imgs = [];
  try { imgs = r.images ? (typeof r.images === 'string' ? JSON.parse(r.images) : r.images) : []; } catch (_) {}
  let sizes = [];
  try { sizes = typeof r.available_sizes === 'string' ? JSON.parse(r.available_sizes) : (r.available_sizes || []); } catch (_) {}
  let colors = [];
  try { colors = typeof r.available_colors === 'string' ? JSON.parse(r.available_colors) : (r.available_colors || []); } catch (_) {}

  return {
    id: r.id,
    name: r.name,
    price: parseFloat(r.price),
    original_price: r.original_price ? parseFloat(r.original_price) : null,
    image_url: r.image_url || imgs[0] || '',
    images: imgs,
    available_sizes: sizes,
    available_colors: colors,
    description: r.description || '',
    category: r.category || '',
    subcategory: r.subcategory || '',
    stock_count: r.stock_count || 0,
    is_exclusive: Boolean(r.is_exclusive)
  };
}

export function extractOrderQuantity(lowerMsg) {
  let orderQty = 1;
  const numMatch = lowerMsg.match(/(\d+)\s*(?:ta|ti|টা|টি|piece|পিস|pish)?/i);
  if (numMatch?.[1]) orderQty = Math.max(1, parseInt(numMatch[1], 10));
  else if (/(?:char|চার|৪)\s*(?:ta|ti|টা|টি)?/i.test(lowerMsg)) orderQty = 4;
  else if (/(?:tin|তিন|৩)\s*(?:ta|ti|টা|টি)?/i.test(lowerMsg)) orderQty = 3;
  else if (/(?:dui|দুই|২)\s*(?:ta|ti|টা|টি)?/i.test(lowerMsg)) orderQty = 2;
  else if (/(?:pach|পাঁচ|৫)\s*(?:ta|ti|টা|টি)?/i.test(lowerMsg)) orderQty = 5;
  return orderQty;
}

export function extractOrderKeywords(lowerMsg) {
  return lowerMsg
    .replace(/ami|amader|apnader|ta|ti|টা|টি|piece|পিস|nite|cai|chai|নিতে|চাই|নিব|nibo|order|korte|অর্ডার|করতে|kinte|কিনতে|pathan|পাঠান|lagbe|লাগবে|deben|দেন|den|kinbo|কিনব|\d+/gi, ' ')
    .replace(/[^\w\s\u0980-\u09FF]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length >= 2);
}

export function isDirectOrderIntent(lowerMsg) {
  return ORDER_INTENT_RE.test(lowerMsg);
}

export function isDetailInquiry(lowerMsg) {
  return DETAIL_INQUIRY_RE.test(lowerMsg);
}

/** Detect catalog category / subcategory from free text or explicit client category_query */
export function detectCategoryMatch(lowerMsg, categoryQuery) {
  let matchedCategory = null;
  let searchTerm = null;

  if (categoryQuery && categoryQuery !== 'ALL') {
    return { matchedCategory: categoryQuery, searchTerm: categoryQuery };
  }

  if (/saree|sari|saari|saaree|sharee|shari|শাড়ি|শাড়ী/i.test(lowerMsg)) {
    matchedCategory = 'SAREE';
    searchTerm = 'saree';
  } else if (/three\s*piece|3\s*piece|thri|three|থ্রি|পিস|৩\s*পিস/i.test(lowerMsg)) {
    matchedCategory = 'STITCHED-COTTON-THREE-PIECE';
    searchTerm = 'three piece';
  } else if (/parshi|porshi|parsi|পারশি|পারশী/i.test(lowerMsg)) {
    matchedCategory = 'PARSHI';
    searchTerm = 'parshi';
  } else if (/western|2\s*piece|টু\s*পিস|টু-পিস|ওয়েস্টার্ন/i.test(lowerMsg)) {
    matchedCategory = 'WESTERN-2-PIECE';
    searchTerm = 'western';
  } else if (/panjabi|punjabi|পাঞ্জাবি|পাঞ্জাবী/i.test(lowerMsg)) {
    matchedCategory = 'PANJABI';
    searchTerm = 'panjabi';
  } else if (/borka|burqa|abaya|বোরকা|বোরখা|আবায়া/i.test(lowerMsg)) {
    matchedCategory = 'BORKA';
    searchTerm = 'borka';
  } else if (/kurti|kurtee|কুর্তি/i.test(lowerMsg)) {
    matchedCategory = 'KURTI';
    searchTerm = 'kurti';
  } else if (/chele|cheleder|purush|gents|men|ছেলেদের|পুরুষ|ছেলে/i.test(lowerMsg)) {
    matchedCategory = 'Men';
    searchTerm = 'Men';
  } else if (/baccader\s*chele|baccha\s*chele|kids\s*boys?|বাচ্চাদের\s*\(?ছেলে\)?/i.test(lowerMsg)) {
    matchedCategory = 'Kids (Boys)';
    searchTerm = 'Kids (Boys)';
  } else if (/baccader\s*meye|baccha\s*meye|kids\s*girls?|বাচ্চাদের\s*\(?মেয়ে\)?/i.test(lowerMsg)) {
    matchedCategory = 'Kids (Girls)';
    searchTerm = 'Kids (Girls)';
  } else if (/baccha|baccader|kids|shishu|বাচ্চাদের|শিশু/i.test(lowerMsg)) {
    matchedCategory = 'Kids';
    searchTerm = 'Kids';
  } else if (/meye|meyeder|mohila|women|ladies|মেয়েদের|মহিলা|মেয়ে/i.test(lowerMsg)) {
    matchedCategory = 'Women';
    searchTerm = 'Women';
  } else if (/biyer|bridal|wedding|karchupi|বিয়ের\s*সাজনি|বিয়ে|কারচুপি/i.test(lowerMsg)) {
    matchedCategory = 'Biyer Sajani';
    searchTerm = 'Biyer Sajani';
  } else if (/আরও|aro|more|next|baki|অন্যান্য/i.test(lowerMsg)) {
    if (categoryQuery && categoryQuery !== 'ALL') {
      matchedCategory = categoryQuery;
      searchTerm = categoryQuery;
    } else {
      matchedCategory = 'ALL';
    }
  }

  return { matchedCategory, searchTerm };
}

export function hasProductCatalogSearchIntent(lowerMsg, matchedCategory) {
  return (matchedCategory !== null || CATALOG_SEARCH_RE.test(lowerMsg)) && !isDetailInquiry(lowerMsg);
}

/** Prefer FAQ for clear customer-service questions before catalog/AI */
export function resolveFaqReply(userMessage, lang = 'bn') {
  const faqMatch = matchFAQ(userMessage);
  if (!faqMatch?.entry) return null;

  // Location-specific delivery override
  const lower = (userMessage || '').toLowerCase();
  if (faqMatch.key === 'delivery_time' || /delivery|ডেলিভারি|charge|চার্জ/.test(lower)) {
    if (/mirsarai|মীরসরাই|baraiyarhat|বারইয়ারহাট|বারইয়ারহাট/.test(lower)) {
      const a = DELIVERY_AREAS.mirsarai;
      return lang === 'en'
        ? `${a.name}: Free home delivery (৳${a.advance} confirmation fee in advance, adjusted from total). Usually ${a.days}.`
        : `মীরসরাই উপজেলায় সম্পূর্ণ ফ্রি হোম ডেলিভারি (৳${a.advance} কনফার্মেশন ফি অগ্রিম, মোট বিল থেকে বাদ)। সাধারণত ${a.days}।`;
    }
    if (/chittagong|chattogram|চট্টগ্রাম/.test(lower) && !/mirsarai|মীরসরাই/.test(lower)) {
      const a = DELIVERY_AREAS.chittagong;
      return lang === 'en'
        ? `Chattogram district delivery: ৳${a.charge} (${a.days}).`
        : `চট্টগ্রাম জেলায় ডেলিভারি চার্জ ৳${a.charge} (${a.days})।`;
    }
    if (/dhaka|ঢাকা|feni|ফেনী|cumilla|কুমিল্লা|sylhet|সিলেট/.test(lower)) {
      return lang === 'en'
        ? `Outside Chattogram: ৳150 delivery (2–5 days), cash on delivery available after advance confirmation.`
        : `চট্টগ্রামের বাইরে ডেলিভারি চার্জ ৳১৫০ (২–৫ দিন)। অগ্রিম কনফার্মেশনের পর ক্যাশ অন ডেলিভারি পাওয়া যায়।`;
    }
  }

  return lang === 'en' ? faqMatch.entry.answer_en : faqMatch.entry.answer_bn;
}

export function getCatalogReplyText(productsCount, offset, lang = 'bn') {
  if (lang === 'en') {
    if (productsCount > 0) {
      return offset > 0
        ? 'Here are more items from this collection:'
        : 'Here are products from our collection. You can order directly or view details:';
    }
    return offset > 0
      ? 'No more items in this collection right now. You can browse the full shop.'
      : 'This item is not listed online yet. Visit our showroom (2nd floor, Zamindar Plaza, Bariahat) or try another category.';
  }
  if (productsCount > 0) {
    return offset > 0
      ? 'আমাদের কালেকশন থেকে আরও কিছু আকর্ষণীয় পণ্য নিচে দেওয়া হলো:'
      : 'আমাদের কালেকশন থেকে প্রোডাক্টগুলো নিচে দেওয়া হলো। আপনি সরাসরি অর্ডার করতে পারেন বা বিস্তারিত দেখতে পারেন:';
  }
  return offset > 0
    ? 'এই কালেকশনের আর কোনো অতিরিক্ত পণ্য এই মুহূর্তে নেই। আপনি পুরো কালেকশনটি শপে গিয়ে দেখতে পারেন।'
    : 'পণ্যটি এখনও ওয়েবসাইটে যুক্ত করা হয়নি। আপনি আমাদের শোরুমে (২য় তলা, জমিদারের প্লাজা, বারইয়ারহাট) সরাসরি ভিজিট করে পণ্যটি নিতে পারবেন।';
}

export function getSmartFallbackReply(lowerMsg, lang = 'bn') {
  const norm = lowerMsg.replace(/[^\w\s\u0980-\u09FF]/g, ' ');
  const bn = lang !== 'en';

  if (/kom|discount|dam\s*kom|char|bargain|ফিক্সড|কম|ছাড়|ডিসকাউন্ট/i.test(norm)) {
    return bn
      ? 'বিগ বাজার একটি ফিক্সড প্রাইস ফ্যাশন শপ। আমাদের প্রতিটি পণ্যের কোয়ালিটি অনুযায়ী ন্যায্য ও নির্দিষ্ট মূল্য নির্ধারণ করা থাকে। তাই আলাদা কোনো দরদাম বা ছাড়ের সুযোগ নেই।'
      : 'Big Bazar is a fixed-price fashion shop — we do not bargain on listed prices.';
  }
  if (/regular\s*customer|puran\s*customer|puraton|sob\s*shomoy|রেগুলার|পুরাতন/i.test(norm)) {
    return bn
      ? 'বিগ বাজারে নিয়মিত কেনাকাটা করার জন্য আপনাকে আন্তরিক ধন্যবাদ! আমাদের সম্মানিত রেগুলার কাস্টমারদের জন্য আমরা সবসময় সর্বোচ্চ কোয়ালিটি এবং দ্রুততম ডেলিভারি নিশ্চিত করি।'
      : 'Thank you for shopping with us regularly — we always prioritize quality and fast delivery for loyal customers.';
  }
  if (/kemon|kemon\s*achen|valo|hi|hello|salam|সালাম|কেমন/i.test(norm)) {
    return bn
      ? 'আসসালামু আলাইকুম! আলহামদুলিল্লাহ, ভালো আছি। বিগ বাজারে আপনাকে স্বাগতম। আপনি আজ কী ধরনের পোশাক দেখতে চান?'
      : 'Assalamu Alaikum! Welcome to Big Bazar. What would you like to browse today?';
  }
  if (/thikana|kothay|location|dokandari|কোথায়|ঠিকানা|শোরুম/i.test(norm)) {
    return bn
      ? 'আমাদের শোরুমের ঠিকানা: ২য় তলা, জমিদারের প্লাজা, বারইয়ারহাট পৌরসভা, মীরসরাই, চট্টগ্রাম। প্রতিদিন সকাল ৯:৩০ টা থেকে রাত ৯:৩০ টা পর্যন্ত খোলা থাকে।'
      : 'Showroom: 2nd Floor, Zamindar Plaza, Bariahat, Mirsarai, Chattogram. Open daily 9:30 AM – 9:30 PM.';
  }
  if (/delivery|charge|deli|ডেলিভারি|খরচ/i.test(norm)) {
    return bn
      ? 'মীরসরাই উপজেলায় হোম ডেলিভারি সম্পূর্ণ ফ্রি! চট্টগ্রাম জেলায় ১০০ টাকা এবং সারা বাংলাদেশে ১৫০ টাকা ডেলিভারি চার্জ প্রযোজ্য।'
      : 'Mirsarai: free delivery. Chattogram district: ৳100. Rest of Bangladesh: ৳150.';
  }
  if (/quality|original|fabric|কোয়ালিটি|ফেব্রিক/i.test(norm)) {
    return bn
      ? 'বিগ বাজারে আমরা প্রিমিয়াম কোয়ালিটির ফেব্রিক ও নিখুঁত ফিনিশিং নিশ্চিত করি। আপনি শতভাগ আস্থার সাথে কেনাকাটা করতে পারেন।'
      : 'We use premium fabrics and careful finishing — shop with confidence.';
  }
  return bn
    ? 'আমি আপনার মেসেজটি বুঝতে পেরেছি। পোশাকের কালেকশন দেখতে ক্যাটাগরি বেছে নিন অথবা আমাদের হেল্পলাইনে (01857045449) সরাসরি যোগাযোগ করুন।'
    : 'Got it. Pick a category to browse, or call our helpline 01857045449.';
}

export function buildProductSearch(matchedCategory, userMessage, limit, offset) {
  let sql = "SELECT id, name, price, original_price, images, image_url, description, category, subcategory, stock_count, available_sizes, available_colors, is_exclusive FROM products WHERE status = 'published' AND (is_deleted = 0 OR is_deleted IS NULL) AND (is_sold_out = 0 OR is_sold_out IS NULL)";
  const params = [];

  if (matchedCategory && matchedCategory !== 'ALL') {
    if (matchedCategory === 'Men' || matchedCategory === 'Women' || matchedCategory === 'Kids (Boys)' || matchedCategory === 'Kids (Girls)') {
      sql += ' AND UPPER(category) = ?';
      params.push(matchedCategory.toUpperCase());
    } else if (matchedCategory === 'Kids') {
      sql += " AND UPPER(category) LIKE 'KIDS%'";
    } else if (matchedCategory === 'Biyer Sajani') {
      sql += " AND (UPPER(subcategory) LIKE '%JAMDANI%' OR UPPER(subcategory) LIKE '%KATAN%' OR UPPER(subcategory) LIKE '%BRIDAL%' OR UPPER(name) LIKE '%BRIDAL%' OR UPPER(name) LIKE '%WEDDING%')";
    } else {
      sql += ' AND (UPPER(subcategory) LIKE ? OR UPPER(name) LIKE ? OR UPPER(category) LIKE ?)';
      params.push(`%${matchedCategory.toUpperCase()}%`, `%${matchedCategory.toUpperCase()}%`, `%${matchedCategory.toUpperCase()}%`);
    }
  } else if (matchedCategory !== 'ALL' && userMessage.length > 2) {
    const cleanKeyword = userMessage.replace(/[^\w\s\u0980-\u09FF]/g, '').trim().split(/\s+/)[0];
    if (cleanKeyword) {
      sql += ' AND (name LIKE ? OR category LIKE ? OR subcategory LIKE ?)';
      params.push(`%${cleanKeyword}%`, `%${cleanKeyword}%`, `%${cleanKeyword}%`);
    }
  }

  const countSql = sql.replace(
    'SELECT id, name, price, original_price, images, image_url, description, category, subcategory, stock_count, available_sizes, available_colors, is_exclusive',
    'SELECT COUNT(*) as total'
  );
  const dataSql = `${sql} ORDER BY is_hot DESC, created_at DESC LIMIT ? OFFSET ?`;
  const dataParams = [...params, limit, offset];

  return { countSql, countParams: params, dataSql, dataParams };
}

export function defaultQuickReplies(lang = 'bn') {
  return lang === 'en'
    ? ['Saree collection', 'Three-piece', 'Delivery info', 'Showroom location']
    : ['শাড়ি কালেকশন', 'থ্রি-পিস কালেকশন', 'ডেলিভারি তথ্য', 'শোরুম লোকেশন'];
}

export { FAQ_KB, matchFAQ };
