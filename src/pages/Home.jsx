import React, { useState, useEffect } from 'react';
import { Search, ArrowRight, ShoppingBag, Truck, CreditCard, CheckCircle, ChevronRight, X } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import HeroSlider from '../components/sliders/HeroSlider';
import { ProductCard, ProductSkeleton } from '../components/ProductCard';
import ProductModal from '../components/modals/ProductModal';
import TickerAnnouncement from '../components/TickerAnnouncement';
import { bigBazarApi, API_URL } from '../api/client';
import { calculatePrice } from '../utils/pricing';
import { getOptimizedUrl, mediaSizes } from '../utils/media';
import { useLanguage } from '../contexts/LanguageContext';
import { extractInstagramId } from '../utils/instagram';
import { getSubcategoriesForCategory, getAllSubcategories } from '../data/categories';
import { useDebounce } from '../hooks/useDebounce';
import { sanitizeInput } from '../utils/security';

const PAGE_SIZE = 12;

const formatTitleCase = (str) => {
  if (!str || typeof str !== 'string') return '';
  // If string contains mostly uppercase ASCII characters, convert to clean Title Case
  if (/^[A-Z0-9\s,&'-]+$/.test(str) && /[A-Z]/.test(str)) {
    return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  }
  return str;
};

const Home = ({ selectedCategory, setSelectedCategory, searchQuery, onSearchChange }) => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [subcategoriesData, setSubcategoriesData] = useState(null);
  const [siteSettings, setSiteSettings] = useState(() => {
    try {
      const cached = localStorage.getItem('bb_site_settings_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.main_slides?.length > 0) return parsed;
      }
    } catch (e) {}
    return {
      main_slides: [],
      announcement: '',
      category_visibility: { show_new: true, show_sale: true, show_exclusive: true }
    };
  });
  const [settingsLoading, setSettingsLoading] = useState(!siteSettings.main_slides?.length);

  const [subCounts, setSubCounts] = useState({});

  // Fetch subcategory counts
  useEffect(() => {
    bigBazarApi.from('subcategory-counts').select('*').then(({ data }) => {
      if (data && Array.isArray(data)) {
        const countsMap = {};
        data.forEach(item => {
          if (item.subcategory) countsMap[item.subcategory] = item.count;
        });
        setSubCounts(countsMap);
      }
    });
  }, []);

  // Compute active subcategories based on selected category, filtering out empty ones
  const rawSubcategories = selectedCategory && selectedCategory !== 'All'
    ? getSubcategoriesForCategory(selectedCategory, subcategoriesData)
    : getAllSubcategories(subcategoriesData, 12);

  const activeSubcategories = rawSubcategories;

  // Fetch settings & cache locally
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await bigBazarApi.from('site_settings').select('*');
        let newSettings = null;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          newSettings = {
            ...data,
            main_slides: Array.isArray(data.main_slides) ? data.main_slides : [],
          };
          if (data.subcategories && typeof data.subcategories === 'object') {
            setSubcategoriesData(data.subcategories);
          }
        } else if (data && Array.isArray(data)) {
          const settingsMap = {};
          data.forEach(item => { settingsMap[item.key] = item.value; });
          newSettings = settingsMap;
          if (settingsMap.subcategories && typeof settingsMap.subcategories === 'object') {
            setSubcategoriesData(settingsMap.subcategories);
          }
        }
        if (newSettings) {
          setSiteSettings(prev => ({ ...prev, ...newSettings }));
          try {
            localStorage.setItem('bb_site_settings_cache', JSON.stringify(newSettings));
          } catch (e) {}
        }
      } catch (err) {
        console.error('Settings fetch failed', err);
      } finally {
        setSettingsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  // Reset page + clear list when filters change (prevents append race)
  useEffect(() => {
    setPage(0);
    setProducts([]);
  }, [selectedCategory, debouncedSearchQuery]);

  // Fetch products with pagination & filtering
  useEffect(() => {
    let cancelled = false;
    const fetchProducts = async () => {
      setLoading(true);
      const start = page * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      let query = bigBazarApi
        .from('products')
        .select('*', { count: 'exact' })
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .range(start, end);

      if (selectedCategory && selectedCategory !== 'All') {
        if (selectedCategory === 'New') {
          query = query.eq('is_new', true);
        } else if (selectedCategory === 'Sale') {
          query = query.eq('is_sale', true);
        } else if (selectedCategory === 'Premium') {
          query = query.eq('is_exclusive', true);
        } else {
          const catMap = {
            'Men': ['Men', 'ছেলেদের'],
            'Women': ['Women', 'মেয়েদের'],
            'Kids (Boys)': ['Kids (Boys)', 'বাচ্চাদের (ছেলে)'],
            'Kids (Girls)': ['Kids (Girls)', 'বাচ্চাদের (মেয়ে)']
          };
          const searchCats = catMap[selectedCategory] || [selectedCategory];
          query = query.in('category', searchCats);
        }
      }

      const cleanSearch = sanitizeInput(debouncedSearchQuery);
      if (cleanSearch) {
        query = query.or(`name.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`);
      }

      const { data, count } = await query;

      if (cancelled) return;
      if (data) {
        if (page === 0) setProducts(data);
        else setProducts(prev => [...prev, ...data]);
        setHasMore(count > (page + 1) * PAGE_SIZE);
      }
      setLoading(false);
    };

    fetchProducts();
    return () => { cancelled = true; };
  }, [page, selectedCategory, debouncedSearchQuery]);

  return (
    <div className="min-h-screen bg-white pb-16">
      {/* Hero Section */}
      {!settingsLoading && siteSettings.main_slides?.length > 0 && (
        <section className="w-full relative">
          <div className="w-full overflow-hidden bg-neutral-950 relative">
            <HeroSlider 
              slides={siteSettings.main_slides} 
              aspectMode={siteSettings.slider_aspect || 'auto'}
            />
          </div>
          {siteSettings.ticker_announcement?.position === 'bottom_slider' && (
            <TickerAnnouncement ticker={siteSettings.ticker_announcement} />
          )}
        </section>
      )}

      {settingsLoading && (
        <section className="w-full">
          <div className="w-full aspect-[16/9] md:aspect-[1920/600] bg-neutral-100 animate-pulse flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-[#ce112d]/20 border-t-[#ce112d] rounded-full animate-spin" />
          </div>
        </section>
      )}


      {/* Wedding Collection Banner — Admin Controlled Canva Poster */}
      {siteSettings.wedding_banner?.enabled && siteSettings.wedding_banner?.image_url && (
        <section className="w-full max-w-[1920px] 2xl:max-w-[2560px] mx-auto px-4 md:px-12 mt-6 md:mt-8">
          <Link
            to={`/products?category=${encodeURIComponent(siteSettings.wedding_banner.category_filter || 'Wedding')}`}
            className="block relative w-full aspect-[16/6] sm:aspect-[16/5] md:aspect-[16/4] rounded-2xl md:rounded-3xl overflow-hidden group cursor-pointer shadow-xl hover:shadow-2xl transition-all duration-500"
          >
            <img
              src={siteSettings.wedding_banner.image_url}
              alt="Collection Banner"
              className="w-full h-full object-cover object-center group-hover:scale-102 transition-transform duration-700 ease-out"
              loading="lazy"
            />
          </Link>
        </section>
      )}

      <div className="w-full max-w-[1920px] 2xl:max-w-[2560px] mx-auto mt-8 md:mt-12 space-y-10">
        {/* Photo-Based Subcategory Rail — justify-start so first item is never clipped; scroll works */}
        {activeSubcategories.length > 0 && (
          <section className="relative">
            <div
              className="flex items-start justify-start gap-4 sm:gap-6 md:gap-8 overflow-x-auto overscroll-x-contain pb-4 pt-2 no-scrollbar scrollbar-hide px-4 md:px-12 snap-x snap-mandatory"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {activeSubcategories.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => {
                    const targetCat = sub._category || selectedCategory || 'All';
                    const cat = targetCat === 'All' ? sub._category : targetCat;
                    if (cat && cat !== 'All') {
                      navigate(`/products?category=${encodeURIComponent(cat)}&subcategory=${encodeURIComponent(sub.id)}`);
                    } else {
                      navigate(`/products?subcategory=${encodeURIComponent(sub.id)}`);
                    }
                  }}
                  className="flex flex-col items-center gap-2 transition-all active:scale-95 group shrink-0 snap-start"
                >
                  <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full overflow-hidden flex items-center justify-center transition-all duration-300 shadow-sm border-2 border-zinc-100 group-hover:border-[#ce112d]/40 group-hover:shadow-md group-hover:scale-105 shrink-0">
                    {sub.image_url ? (
                      <img
                        src={sub.image_url}
                        alt={sub.name_en || ''}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#ce112d]/10 via-rose-50 to-white flex items-center justify-center border border-[#ce112d]/15 shrink-0">
                        <span className="text-xl sm:text-2xl md:text-3xl font-black text-[#ce112d]">
                          {(sub.name_en || sub.name_bn || '?')[0]}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="block text-xs sm:text-sm md:text-base font-bold text-zinc-700 text-center leading-snug w-[5.5rem] sm:w-[7rem] md:w-[8rem] min-h-[2.5em] line-clamp-2">
                    {formatTitleCase(language === 'bn' ? (sub.name_bn || sub.name_en) : (sub.name_en || sub.name_bn))}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Search Bar (Elevated Affordance & Accessible Search Region) */}
        <div id="search-section" className="max-w-md px-4 md:px-12" role="search">
          <label htmlFor="home-product-search" className="sr-only">
            {language === 'bn' ? 'পণ্য অনুসন্ধান' : 'Search products'}
          </label>
          <div className="relative group">
            <Search 
              className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-[#ce112d] transition-colors" 
              size={18} 
              aria-hidden="true" 
            />
            <input
              id="home-product-search"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={language === 'bn' ? 'পণ্য খুঁজুন...' : 'Search products...'}
              aria-label={language === 'bn' ? 'পণ্য খুঁজুন' : 'Search products'}
              className="w-full bg-zinc-50 border border-zinc-200/90 focus:border-[#ce112d] focus:bg-white rounded-xl py-3.5 pl-12 pr-10 text-sm font-medium outline-none transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={language === 'bn' ? 'অনুসন্ধান মুছুন' : 'Clear search'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1 rounded-full hover:bg-zinc-100 transition-colors"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Product Grid */}
        <section className="space-y-8 pt-4 px-4 md:px-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight leading-none text-zinc-900">
                {searchQuery 
                  ? (language === 'bn' ? 'অনুসন্ধান ফলাফল' : 'Search Results') 
                  : (selectedCategory === 'All' ? (language === 'bn' ? 'নতুন কালেকশন' : 'New Arrival') : selectedCategory)
                }
              </h2>
              {searchQuery && (
                <p className="text-xs text-zinc-500 font-bold">
                  {language === 'bn' ? `"${searchQuery}" এর জন্য অনুসন্ধান করা হচ্ছে` : `Showing results for "${searchQuery}"`}
                </p>
              )}
            </div>
          </div>

          {loading && page === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {Array.from({ length: 12 }).map((_, i) => <ProductSkeleton key={i} />)}
            </div>
          ) : products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => navigate(`/product/${product.id}`)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-gradient-to-b from-[#ce112d]/[0.03] via-zinc-50/50 to-white border border-zinc-200/80 rounded-3xl p-8 md:p-14 flex flex-col items-center text-center gap-6 shadow-sm max-w-3xl mx-auto my-4">
              <div className="w-20 h-20 bg-gradient-to-b from-[#ce112d]/15 to-[#ce112d]/5 rounded-3xl flex items-center justify-center border border-[#ce112d]/20 text-[#ce112d] shadow-xl shadow-red-900/10">
                <ShoppingBag size={36} strokeWidth={2} />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl md:text-3xl font-black text-neutral-900 tracking-tight uppercase">
                  {language === 'bn' ? 'কোনো পণ্য পাওয়া যায়নি' : 'No Products Available'}
                </h2>
                <p className="text-xs md:text-sm text-neutral-600 max-w-lg mx-auto leading-relaxed font-medium">
                  {searchQuery
                    ? (language === 'bn' ? `"${searchQuery}" নামে কোনো পণ্য পাওয়া যায়নি। অন্য কোনো নাম লিখে চেষ্টা করুন।` : `Sorry, no items matched "${searchQuery}". Try exploring all collections or clearing search.`)
                    : (language === 'bn' ? 'দুঃখিত, কোনো পণ্য পাওয়া যায়নি। অনুগ্রহ করে সকল পণ্য ক্লিক করুন অথবা অন্য ক্যাটাগরি সিলেক্ট করুন।' : 'Sorry, no items matched. Try exploring all collections or clearing your search filter.')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (setSelectedCategory) setSelectedCategory('All');
                  if (onSearchChange) onSearchChange('');
                }}
                className="mt-2 px-8 py-3.5 bg-[#ce112d] hover:bg-[#b00e26] text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-xl shadow-red-900/30 active:scale-95 transition-all flex items-center gap-2"
              >
                <span>{language === 'bn' ? 'সকল পণ্য দেখুন' : 'Explore All Collections'}</span>
              </button>
            </div>
          )}

          {loading && page > 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 border-4 border-[#ce112d] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-bold text-[#ce112d] animate-pulse">Loading more...</p>
            </div>
          )}

          {/* Load More */}
          {hasMore && !loading && (
            <div className="flex flex-col items-center justify-center pt-12 pb-6 gap-3">
              <button
                onClick={() => setPage(prev => prev + 1)}
                className="group inline-flex items-center gap-3 px-8 py-3.5 bg-zinc-900 hover:bg-[#ce112d] text-white rounded-xl shadow-lg hover:shadow-red-900/25 active:scale-95 transition-all duration-300 border border-white/10 text-sm font-bold tracking-wide"
              >
                <span>{language === 'bn' ? 'আরো পণ্য দেখুন' : 'Explore More Designs'}</span>
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <span className="text-xs text-zinc-500 font-medium tracking-normal">
                {language === 'bn' ? 'প্রিমিয়াম কালেকশন • ট্রেন্ডিং ডিজাইন' : 'Selective Edits • Premium Catalog'}
              </span>
            </div>
          )}
        </section>
      </div>

      {/* Trust & Guarantee Strip */}
      <section className="w-full border-t border-b border-zinc-100 bg-zinc-50/70 mt-14 py-8">
        <div className="w-full max-w-[1920px] 2xl:max-w-[2560px] mx-auto px-4 md:px-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200/80">
            {[
              { 
                icon: <Truck size={20} strokeWidth={1.8} />, 
                title: language === 'bn' ? 'ফ্রি ডেলিভারি' : 'Free Delivery', 
                sub: language === 'bn' ? 'মীরসরাই এলাকায়' : 'Within Mirsarai' 
              },
              { 
                icon: <CreditCard size={20} strokeWidth={1.8} />, 
                title: language === 'bn' ? 'ক্যাশ অন ডেলিভারি' : 'Cash on Delivery', 
                sub: language === 'bn' ? 'হাতে পেয়ে পেমেন্ট' : 'Pay on receipt' 
              },
              { 
                icon: <CheckCircle size={20} strokeWidth={1.8} />, 
                title: language === 'bn' ? '১০০% গুণমান' : '100% Quality', 
                sub: language === 'bn' ? 'প্রিমিয়াম ফেব্রিক' : 'Premium finish' 
              },
            ].map((item, i) => (
              <div key={i} className={`flex items-center justify-center text-left gap-3.5 sm:gap-4 py-2 sm:py-0 px-2 sm:px-6 ${i > 0 ? 'pt-4 sm:pt-0' : ''}`}>
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white shadow-sm border border-zinc-200/60 flex items-center justify-center text-[#ce112d] shrink-0">
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 leading-tight">{item.title}</p>
                  <p className="text-xs text-zinc-500 font-medium leading-normal mt-0.5">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ProductModal
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
};

export default Home;
