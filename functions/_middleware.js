/**
 * Cloudflare Pages root middleware.
 * Explicitly forwards /api/* to the Hono API so SPA static fallback never
 * swallows product/API JSON responses.
 *
 * Non-API HTML routes: pass through then apply SEO HTMLRewriter.
 */

function normalizeOrigin(raw) {
  const s = String(raw || '').trim().replace(/\/$/, '');
  if (!s) return '';
  try {
    return new URL(s).origin;
  } catch {
    return '';
  }
}

async function handleApi(context) {
  try {
    const mod = await import('./api/handler.js');
    if (typeof mod.onRequest === 'function') {
      return await mod.onRequest(context);
    }
    if (mod.default && typeof mod.default.fetch === 'function') {
      return mod.default.fetch(context.request, context.env, context);
    }
    return new Response(JSON.stringify({ error: 'API handler missing' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('API middleware forward error:', err);
    return new Response(
      JSON.stringify({
        error: 'API failed',
        message: err?.message || String(err),
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const publicOrigin = normalizeOrigin(env?.PUBLIC_SITE_ORIGIN);

  if (
    publicOrigin &&
    url.hostname.endsWith('.pages.dev') &&
    url.origin !== publicOrigin
  ) {
    const dest = new URL(path + url.search + url.hash, publicOrigin);
    return Response.redirect(dest.toString(), 301);
  }

  // Always handle API here so we never SPA-fallback HTML for /api/*
  if (path.startsWith('/api/')) {
    return handleApi(context);
  }

  // Dedicated function files
  if (path === '/sitemap.xml' || path === '/robots.txt') {
    return context.next();
  }

  // Static assets — no SEO rewrite
  if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|map|json|woff2?|ttf|eot)$/i.test(path)) {
    return context.next();
  }

  // HTML routes — SEO pre-render
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  const domain = publicOrigin || url.origin;
  const canonicalUrl = `${domain}${path}`;
  const defaultTitle =
    'Big Bazar | Baraiyarhat — Complete Family Fashion & Lifestyle Destination';
  const defaultDesc =
    'Located on the 2nd Floor of Jomidar Plaza in Baraiyarhat, Mirsharai, Chattogram, Big Bazar is the premier fixed-price family shopping destination. Home of signature bridal section Biyer Sajani (বিয়ের সাজনি), kids wear, modest fashion, gents wear, and home decor. Free Home Delivery within Mirsharai Upazila.';

  let pageTitle = defaultTitle;
  let pageDesc = defaultDesc;
  let ogImage = `${domain}/b.jpg`;
  let productJsonLd = null;

  if (path.startsWith('/product/')) {
    const productId = path.replace('/product/', '').trim();
    try {
      let prod = null;
      try {
        const apiRes = await fetch(
          `${domain}/api/products?id=${encodeURIComponent(productId)}`
        );
        if (apiRes.ok) {
          const apiJson = await apiRes.json();
          prod = apiJson?.data || null;
          if (Array.isArray(prod)) prod = prod[0] || null;
        }
      } catch (_) {}

      if (!prod) {
        const prodRes = await fetch(`${domain}/all_products.json`);
        if (prodRes.ok) {
          const products = await prodRes.json();
          prod = Array.isArray(products)
            ? products.find((p) => String(p.id) === String(productId))
            : null;
        }
      }

      if (prod) {
        pageTitle = `${prod.name} — Big Bazar Baraiyarhat`;
        const rawDesc = prod.description
          ? prod.description.replace(/\s+/g, ' ').trim()
          : '';
        pageDesc = rawDesc
          ? rawDesc.length > 160
            ? rawDesc.substring(0, 157) + '...'
            : rawDesc
          : `${prod.name} - Buy online at Big Bazar Baraiyarhat with Cash on Delivery and Free Mirsharai Delivery.`;

        const img =
          prod.image_url || prod.image || (prod.images && prod.images[0]);
        if (img) ogImage = img;

        const isOutOfStock =
          !!prod.is_sold_out ||
          (prod.stock_count !== null && prod.stock_count <= 0);

        productJsonLd = {
          '@type': 'Product',
          '@id': `${domain}${path}#product`,
          name: prod.name,
          description: pageDesc,
          image: ogImage,
          sku: String(prod.id),
          category: prod.subcategory
            ? `${prod.category} > ${prod.subcategory}`
            : prod.category,
          brand: { '@type': 'Brand', name: 'Big Bazar' },
          offers: {
            '@type': 'Offer',
            url: canonicalUrl,
            priceCurrency: 'BDT',
            price: parseFloat(prod.price || 0),
            availability: isOutOfStock
              ? 'https://schema.org/OutOfStock'
              : 'https://schema.org/InStock',
            seller: {
              '@type': 'Organization',
              name: 'Big Bazar Baraiyarhat',
            },
          },
        };
      }
    } catch (err) {
      console.warn('Edge pre-render product fetch warning:', err);
    }
    if (!productJsonLd) {
      pageTitle = 'Exclusive Collection | Big Bazar Baraiyarhat';
      pageDesc =
        'Shop authentic fashion collections at Big Bazar Baraiyarhat with fast Cash on Delivery across Bangladesh.';
    }
  } else if (path === '/products') {
    const categoryParam = url.searchParams.get('category');
    const subcategoryParam = url.searchParams.get('subcategory');
    if (subcategoryParam) {
      pageTitle = `${subcategoryParam} Collection — Big Bazar Baraiyarhat`;
      pageDesc = `Browse authentic ${subcategoryParam} collection${categoryParam ? ' for ' + categoryParam : ''} at Big Bazar Baraiyarhat. Best prices and Free Home Delivery in Mirsharai.`;
    } else if (categoryParam && categoryParam !== 'All') {
      pageTitle = `${categoryParam} Collection — Big Bazar Baraiyarhat`;
      pageDesc = `Explore signature ${categoryParam} fashion collections at Big Bazar Baraiyarhat. Fixed-price family shopping with Cash on Delivery across Bangladesh.`;
    } else {
      pageTitle = 'All Products Collection — Big Bazar Baraiyarhat';
      pageDesc =
        'Browse all family fashion, Modest Wear, Gents Wear, Kids Wear, and Biyer Sajani bridal items at Big Bazar Baraiyarhat.';
    }
  } else if (path === '/about-us') {
    pageTitle =
      'About Us — Big Bazar Baraiyarhat | 65,000+ Community Trusted Store';
    pageDesc =
      'Discover Big Bazar at Jomidar Plaza, Baraiyarhat. Serving 65,000+ community followers with complete family fashion solutions, Biyer Sajani wedding collections, and Free Home Delivery across Mirsharai.';
  } else if (path === '/store-locations') {
    pageTitle =
      'Store Outlet Location — Big Bazar Baraiyarhat | 2nd Floor Jomidar Plaza';
    pageDesc =
      'Visit Big Bazar on the 2nd Floor of Jomidar Plaza, Baraiyarhat Pouroshoba, Mirsharai Upazila, Chattogram. Open daily 9:00 AM - 9:00 PM.';
  } else if (path === '/faq') {
    pageTitle = 'Frequently Asked Questions (FAQ) — Big Bazar Baraiyarhat';
    pageDesc =
      'Find answers regarding order placement, Free Mirsharai delivery, nationwide Cash on Delivery, returns, and Biyer Sajani wedding collections at Big Bazar Baraiyarhat.';
  } else if (path === '/shipping') {
    pageTitle =
      'Shipping & Free Mirsharai Home Delivery — Big Bazar Baraiyarhat';
    pageDesc =
      'Free Home Delivery within Mirsharai Upazila. Fast nationwide Cash on Delivery across Bangladesh (60 BDT local, 120 BDT national).';
  } else if (path === '/returns') {
    pageTitle = 'Returns & Exchange Policy — Big Bazar Baraiyarhat';
    pageDesc =
      'Hassle-free return and exchange policy within 24 hours for defective items or sizing issues at Big Bazar Baraiyarhat.';
  }

  const jsonLdGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${domain}/#website`,
        name: 'Big Bazar',
        alternateName: [
          'Big Bazar Baraiyarhat',
          'বিগ বাজার বারইয়ারহাট',
          new URL(domain).hostname.toLowerCase(),
        ],
        url: `${domain}/`,
        publisher: { '@id': `${domain}/#organization` },
        inLanguage: ['bn', 'en'],
      },
      {
        '@type': ['ClothingStore', 'LocalBusiness', 'Organization'],
        '@id': `${domain}/#organization`,
        name: 'Big Bazar',
        alternateName: [
          'Big Bazar Baraiyarhat',
          'বিগ বাজার বারইয়ারহাট',
          'Biyer Sajani',
          'বিয়ের সাজনি',
        ],
        url: domain,
        logo: `${domain}/b.jpg`,
        image: ogImage,
        description: defaultDesc,
        telephone: '+8801857045449',
        email: 'infobigbazar01@gmail.com',
        priceRange: '৳৳',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '2nd Floor, Jomidar Plaza, Baraiyarhat Pouroshoba',
          addressLocality: 'Mirsharai',
          addressRegion: 'Chattogram',
          postalCode: '4327',
          addressCountry: 'BD',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: 22.8984,
          longitude: 91.5303,
        },
        areaServed: [
          { '@type': 'AdministrativeArea', name: 'Mirsharai Upazila' },
          { '@type': 'AdministrativeArea', name: 'Chattogram Division' },
          { '@type': 'Country', name: 'Bangladesh' },
        ],
        sameAs: [
          'https://www.facebook.com/100063541603515',
          'https://www.instagram.com/big_bazar_25',
          'https://www.tiktok.com/@big.bazar2',
        ],
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Family Fashion & Bridal Catalog',
          itemListElement: [
            {
              '@type': 'OfferCatalog',
              name: 'Biyer Sajani (Bridal & Groom Wear)',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Ladies Modest Fashion (Abayas, Borkas, Hijabs)',
            },
            { '@type': 'OfferCatalog', name: 'Kids Wear (0-15 Years)' },
            {
              '@type': 'OfferCatalog',
              name: 'Menswear (Panjabis, Suits, Polos)',
            },
            { '@type': 'OfferCatalog', name: 'Home Decor & Goj Kapor' },
          ],
        },
      },
      ...(productJsonLd ? [productJsonLd] : []),
      {
        '@type': 'FAQPage',
        '@id': `${domain}/#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Where is Big Bazar located in Baraiyarhat?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Big Bazar is located on the 2nd Floor of Jomidar Plaza, Baraiyarhat Pouroshoba, Mirsharai Upazila, Chattogram, Bangladesh.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is Biyer Sajani at Big Bazar?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: "Biyer Sajani (বিয়ের সাজনি) is Big Bazar's signature bridal and groom section, featuring Karchupi Jamdani, Dhakai Jamdani, Katan, Jorjet, Sararas, Gararas for brides, and Sherwanis, Panjabis, Blazers, and Suits for grooms.",
            },
          },
          {
            '@type': 'Question',
            name: 'Does Big Bazar offer Free Home Delivery in Mirsharai?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes! Residents of Mirsharai Upazila enjoy 100% Free Home Delivery on all online orders. Cash on Delivery is available nationwide across Bangladesh.',
            },
          },
        ],
      },
    ],
  };

  const seoBootHtml = `
    <div id="seo-boot">
      <h1>Big Bazar | Baraiyarhat</h1>
      <p>${pageDesc.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
      <p>Store: 2nd Floor, Jomidar Plaza, Baraiyarhat Pouroshoba, Mirsharai Upazila, Chattogram. Phone: 01857045449.</p>
    </div>
  `;

  const rewriter = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(pageTitle);
      },
    })
    .on('meta[name="description"]', {
      element(element) {
        element.setAttribute('content', pageDesc);
      },
    })
    .on('#root', {
      element(element) {
        element.setInnerContent(seoBootHtml, { html: true });
      },
    })
    .on('head', {
      element(element) {
        element.append(`<link rel="canonical" href="${canonicalUrl}" />`, {
          html: true,
        });
        element.append(
          `<meta property="og:title" content="${pageTitle.replace(/"/g, '&quot;')}" />`,
          { html: true }
        );
        element.append(
          `<meta property="og:description" content="${pageDesc.replace(/"/g, '&quot;')}" />`,
          { html: true }
        );
        element.append(`<meta property="og:image" content="${ogImage}" />`, {
          html: true,
        });
        element.append(`<meta property="og:url" content="${canonicalUrl}" />`, {
          html: true,
        });
        element.append(`<meta property="og:type" content="website" />`, {
          html: true,
        });
        element.append(
          `<meta property="og:site_name" content="Big Bazar Baraiyarhat" />`,
          { html: true }
        );
        element.append(
          `<meta name="twitter:card" content="summary_large_image" />`,
          { html: true }
        );
        element.append(
          `<meta name="twitter:title" content="${pageTitle.replace(/"/g, '&quot;')}" />`,
          { html: true }
        );
        element.append(
          `<meta name="twitter:description" content="${pageDesc.replace(/"/g, '&quot;')}" />`,
          { html: true }
        );
        element.append(`<meta name="twitter:image" content="${ogImage}" />`, {
          html: true,
        });
        element.append(
          `<script type="application/ld+json">${JSON.stringify(jsonLdGraph)}</script>`,
          { html: true }
        );
      },
    });

  return rewriter.transform(response);
}
