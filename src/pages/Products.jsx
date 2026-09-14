import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, ShoppingBag, X, Check } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProductCard, ProductSkeleton } from '../components/ProductCard';
import { bigBazarApi } from '../api/client';
import { useLanguage } from '../contexts/LanguageContext';
import { getSubcategoriesForCategory, TOP_CATEGORIES } from '../data/categories';
import { useDebounce } from '../hooks/useDebounce';
import { sanitizeInput } from '../utils/security';

const PAGE_SIZE = 16;

const BASE_CATEGORIES = [
  { id: 'All',          en: 'All',            bn: 'সকল' },
  ...TOP_CATEGORIES.map(c => ({ id: c.id, en: c.en, bn: c.bn })),
];

export default function Products() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [weddingConfig, setWeddingConfig] = useState(null);
  const [subcategoriesData, setSubcategoriesData] = useState(null);

  // Source of truth from URL params
  const selectedCategory = searchParams.get('category') || 'All';
  const selectedSubcategory = searchParams.get('subcategory') || '';

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const searchRef = useRef(null);

  // Fetch admin settings
  useEffect(() => {
    bigBazarApi.from('site_settings').select('*').then(({ data }) => {
      if (!data) return;
      const isArray = Array.isArray(data);
      const getValue = (key) => isArray ? data.find(s => s.key === key)?.value : data[key];
      
      const wb = getValue('wedding_banner');
      if (wb?.enabled && wb?.category_filter) setWeddingConfig(wb);
      
      const subcats = getValue('subcategories');
      if (subcats && typeof subcats === 'object') setSubcategoriesData(subcats);
    });
  }, []);

  // Build category list
  const CATEGORIES = [
    ...BASE_CATEGORIES,
    ...(weddingConfig ? [{
      id: weddingConfig.category_filter,
      en: weddingConfig.title_en || 'Wedding',
      bn: weddingConfig.title_bn || 'ওয়েডিং',
    }] : []),
  ];

  const handleCategoryChange = (cat) => {
    if (cat === selectedCategory && !selectedSubcategory) return;
    setPage(0);
    setIsFiltering(true);
    if (cat === 'All') {
      setSearchParams({});
    } else {
      setSearchParams({ category: cat });
    }
  };

  const handleSubcategoryChange = (subId) => {
    const nextSub = selectedSubcategory === subId ? '' : subId;
    setPage(0);
    setIsFiltering(true);
    const params = {};
    if (selectedCategory && selectedCategory !== 'All') params.category = selectedCategory;
    if (nextSub) params.subcategory = nextSub;
    setSearchParams(params);
  };

  // Fetch products cleanly without flickering layout
  useEffect(() => {
    let isMounted = true;
    const fetchProducts = async () => {
      if (page === 0 && products.length === 0) {
        setLoading(true);
      } else {
        setIsFiltering(true);
      }

      const start = page * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      let query = bigBazarApi
        .from('products')
        .select('*', { count: 'exact' })
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .range(start, end);

      if (selectedCategory && selectedCategory !== 'All') {
        const isWeddingCat = weddingConfig && selectedCategory === weddingConfig.category_filter;
        if (isWeddingCat) {
          const kw = weddingConfig.category_filter.toLowerCase();
          query = query.or(`category.ilike.%${kw}%,is_exclusive.eq.true`);
        } else {
          const catMap = {
            'Men':          ['Men', 'ছেলেদের'],
            'Women':        ['Women', 'মেয়েদের'],
            'Kids (Boys)':  ['Kids (Boys)', 'বাচ্চাদের (ছেলে)'],
            'Kids (Girls)': ['Kids (Girls)', 'বাচ্চাদের (মেয়ে)'],
          };
          query = query.in('category', catMap[selectedCategory] || [selectedCategory]);
        }
      }

      if (selectedSubcategory) {
        query = query.eq('subcategory', selectedSubcategory);
      }

      const cleanSearch = sanitizeInput(debouncedSearchQuery);
      if (cleanSearch) {
        query = query.or(`name.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`);
      }

      const { data, count } = await query;

      if (isMounted) {
        if (data) {
          if (page === 0) setProducts(data);
          else setProducts(prev => [...prev, ...data]);
          setHasMore(count > (page + 1) * PAGE_SIZE);
          setTotalCount(count || 0);
        }
        setLoading(false);
        setIsFiltering(false);
      }
    };

    fetchProducts();
    return () => { isMounted = false; };
  }, [page, selectedCategory, selectedSubcategory, debouncedSearchQuery]);

  const [subCounts, setSubCounts] = useState({});

  // Fetch subcategory counts to filter out empty subcategories
  useEffect(() => {
    let query = bigBazarApi.from('subcategory-counts').select('*');
    if (selectedCategory && selectedCategory !== 'All') {
      query = query.eq('category', selectedCategory);
    }
    query.then(({ data }) => {
      if (data && Array.isArray(data)) {
        const countsMap = {};
        data.forEach(item => {
          if (item.subcategory) countsMap[item.subcategory] = item.count;
        });
        setSubCounts(countsMap);
      }
    });
  }, [selectedCategory]);

  const currentCat = CATEGORIES.find(c => c.id === selectedCategory);
  const catLabel = currentCat ? (language === 'bn' ? currentCat.bn : currentCat.en) : 'All';
  const allSubcategories = getSubcategoriesForCategory(selectedCategory, subcategoriesData);
  const availableSubcategories = allSubcategories;

  const resetAllFilters = () => {
    handleCategoryChange('All');
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Page Header */}
      <div className="border-b border-zinc-100 bg-white">
        <div className="w-full max-w-[1920px] mx-auto px-4 md:px-12 py-5 md:py-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <div className="w-44 lg:w-52 shrink-0 hidden md:block">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                {language === 'bn' ? 'ক্যাটাগরি' : 'Category'}
              </span>
            </div>
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-tight text-zinc-900 leading-none">
                  {catLabel}
                </h1>
                {totalCount > 0 && (
                  <span className="text-xs font-semibold text-zinc-600">
                    ({totalCount} {language === 'bn' ? 'টি পণ্য' : 'items'})
                  </span>
                )}
              </div>

              {/* Integrated Search Bar aligned with Product Grid */}
              <div className="relative group w-full sm:w-72 md:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-[#ce112d] transition-colors" size={16} />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={language === 'bn' ? `${catLabel}-এ খুঁজুন...` : `Search in ${catLabel}...`}
                  aria-label={language === 'bn' ? 'পণ্য খুঁজুন' : 'Search products'}
                  className="w-full bg-zinc-50 border border-zinc-200 focus:border-[#ce112d]/50 focus:bg-white rounded-xl py-2.5 pl-10 pr-9 text-sm outline-none transition-all placeholder:text-zinc-600"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-700">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[1920px] mx-auto px-4 md:px-12">
        <div className="flex gap-8 py-6 md:py-8">

          {/* Desktop Sidebar */}
          <aside className="hidden md:block w-44 lg:w-52 shrink-0">
            <div className="sticky top-24 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-600 px-3 pb-2">
                {language === 'bn' ? 'ক্যাটাগরি সমূহ' : 'All Categories'}
              </p>
              {CATEGORIES.map(cat => (
                <div key={cat.id} className="space-y-1">
                  <button
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                      selectedCategory === cat.id
                        ? 'bg-zinc-900 text-white shadow-sm'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                    }`}
                  >
                    {language === 'bn' ? cat.bn : cat.en}
                    {selectedCategory === cat.id && (
                      <span className="float-right w-1.5 h-1.5 rounded-full bg-[#ce112d] mt-1.5" />
                    )}
                  </button>
                  {selectedCategory === cat.id && availableSubcategories.length > 0 && (
                    <div className="pl-3 space-y-1 py-1 border-l-2 border-zinc-100 ml-3">
                      {availableSubcategories.map(sub => {
                        const isSubSelected = selectedSubcategory === sub.id;
                        return (
                          <button
                            key={sub.id}
                            onClick={() => handleSubcategoryChange(sub.id)}
                            className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                              isSubSelected
                                ? 'bg-rose-50 text-[#ce112d] font-bold'
                                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                            }`}
                          >
                            {sub.image_url && (
                              <img src={sub.image_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0 border border-zinc-200" />
                            )}
                            <span className="capitalize truncate">{language === 'bn' ? (sub.name_bn || sub.bn) : (sub.name_en || sub.en)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>

          {/* Product Grid Container */}
          <div className="flex-1 min-w-0">
            {/* Mobile Filter Bar & Subcategory Chips */}
            <div className="mb-4 space-y-2">
              <div className="md:hidden w-full flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar scrollbar-hide">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border ${
                      selectedCategory === cat.id
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {language === 'bn' ? cat.bn : cat.en}
                  </button>
                ))}
              </div>

              {/* Horizontal subcategory chips: only shown on mobile/tablet (sidebar handles desktop) */}
              {availableSubcategories.length > 0 && (
                <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar scrollbar-hide">
                  <span className="text-xs font-bold uppercase text-zinc-600 shrink-0 mr-1">
                    {language === 'bn' ? 'ধরন:' : 'Type:'}
                  </span>
                  <button
                    onClick={() => handleSubcategoryChange('')}
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      !selectedSubcategory
                        ? 'bg-[#ce112d] text-white border-[#ce112d]'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    {language === 'bn' ? 'সব' : 'All'}
                  </button>
                  {availableSubcategories.map(sub => {
                    const isSubSelected = selectedSubcategory === sub.id;
                    return (
                      <button
                        key={sub.id}
                        onClick={() => handleSubcategoryChange(sub.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                          isSubSelected
                            ? 'bg-[#ce112d] text-white border-[#ce112d] shadow-sm'
                            : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        {sub.image_url && (
                          <img src={sub.image_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 border border-zinc-200" />
                        )}
                        <span className="capitalize">{language === 'bn' ? (sub.name_bn || sub.bn) : (sub.name_en || sub.en)}</span>
                        {isSubSelected && <Check size={12} strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Clean In-Page Empty State (No Popup Modal) */}
            {!loading && !isFiltering && products.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
                <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-300">
                  <ShoppingBag size={28} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm font-black text-zinc-900 uppercase tracking-wide">
                    {language === 'bn' ? 'কোনো পণ্য পাওয়া যায়নি' : 'No products found'}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {language === 'bn' ? 'অন্য ক্যাটাগরি চেষ্টা করুন' : 'Try a different category or clear search'}
                  </p>
                </div>
                <button
                  onClick={resetAllFilters}
                  className="px-6 py-2.5 bg-zinc-900 hover:bg-[#ce112d] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95"
                >
                  {language === 'bn' ? 'সকল পণ্য' : 'View All'}
                </button>
              </div>
            )}

            {/* Product Grid with Smooth Transition */}
            <div className={`transition-opacity duration-300 ${isFiltering ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {loading && page === 0
                  ? Array.from({ length: 16 }).map((_, i) => <ProductSkeleton key={i} />)
                  : products.map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onClick={() => navigate(`/product/${product.id}`)}
                      />
                    ))
                }
              </div>
            </div>

            {loading && page > 0 && (
              <div className="flex items-center justify-center py-12 gap-3">
                <div className="w-5 h-5 border-2 border-[#ce112d] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Loading…</span>
              </div>
            )}

            {hasMore && !loading && (
              <div className="flex justify-center pt-10 pb-4">
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="group inline-flex items-center gap-2.5 px-8 py-3 bg-zinc-900 hover:bg-[#ce112d] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-300 active:scale-95 shadow-md"
                >
                  <span>{language === 'bn' ? 'আরো দেখুন' : 'Load More'}</span>
                  <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
