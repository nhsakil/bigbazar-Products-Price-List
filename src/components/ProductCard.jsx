import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Instagram } from 'lucide-react';
import { calculatePrice } from '../utils/pricing';
import { getOptimizedUrl, mediaSizes } from '../utils/media';
import { useLanguage } from '../contexts/LanguageContext';

export const ProductCard = ({ product, onClick }) => {
  const { price, originalPrice, hasDiscount } = calculatePrice(product);
  const [imgFailed, setImgFailed] = React.useState(false);

  // Choose the best candidate for the display image (never use Instagram video URL as a photo)
  const sourceImage = product.image_url || product.images?.[0] || null;
  // Legacy circular /api/img/{uuid} (no up-) often 404s — try static migrate path as fallback
  const staticFallback =
    sourceImage &&
    /^\/api\/img\/[0-9a-f-]{36}$/i.test(sourceImage) &&
    product?.id
      ? `/img/products/${product.id}.jpg`
      : null;

  const { language } = useLanguage();

  React.useEffect(() => {
    setImgFailed(false);
  }, [product?.id, sourceImage]);

  // Calculate discount percentage
  const discountPercent = hasDiscount && originalPrice > 0 
    ? Math.round(((originalPrice - price) / originalPrice) * 100) 
    : 0;

  const showImage = sourceImage && !imgFailed;

  const displayName = language === 'bn' 
    ? (product.name_bn || product.name) 
    : (product.name_en || product.name);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${displayName} - ৳${price}`}
      onClick={() => onClick(product)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(product);
        }
      }}
      className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-neutral-100 cursor-pointer group flex flex-col h-full focus:outline-none focus:ring-2 focus:ring-[#ce112d]/40"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-neutral-50 shrink-0">
        {showImage ? (
          <div className="relative w-full h-full">
            <img
              src={getOptimizedUrl(sourceImage, mediaSizes.thumbnail)}
              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500 ease-out"
              alt={displayName}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const el = e.currentTarget;
                if (staticFallback && !el.dataset.triedStatic) {
                  el.dataset.triedStatic = '1';
                  el.src = staticFallback;
                  return;
                }
                if (el.src.includes('images.weserv.nl') && sourceImage && !el.dataset.triedDirect) {
                  el.dataset.triedDirect = '1';
                  el.src = sourceImage;
                  return;
                }
                setImgFailed(true);
              }}
            />
          </div>
        ) : (
          <div className="w-full h-full bg-neutral-100 flex flex-col items-center justify-center gap-2 px-3">
            <Instagram size={22} className="text-zinc-300" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 text-center">
              {language === 'bn' ? 'ছবি নেই' : 'No photo'}
            </span>
          </div>
        )}
        
        {/* Corner Ribbon Sale Badge */}
        {hasDiscount && (
          <div className="absolute top-0 left-0">
            <div className="bg-[#ce112d] text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-br-lg shadow-md">
              {discountPercent}% OFF
            </div>
          </div>
        )}
        
        {product.is_sold_out && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center p-6 text-center">
            <span className="text-xs font-bold uppercase text-neutral-900 border-2 border-neutral-900 px-4 py-2 rounded-xl">
              {language === 'bn' ? 'স্টক নেই' : 'Sold Out'}
            </span>
          </div>
        )}
      </div>
      
      <div className="p-3.5 md:p-5 flex flex-col flex-1 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] md:text-xs font-bold uppercase text-neutral-400 tracking-wider truncate">
            {product.category || 'Clothing'}
          </p>
          <h2 className="text-sm md:text-base font-bold text-neutral-900 line-clamp-2 leading-snug min-h-[40px]">
            {displayName}
          </h2>
        </div>
        
        <div className="mt-auto flex items-center justify-between gap-1.5 pt-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0 overflow-hidden">
            <span className="text-sm sm:text-base md:text-lg font-black text-[#ce112d] whitespace-nowrap">৳{price}</span>
            {hasDiscount && (
              <span className="text-xs text-neutral-400 line-through font-semibold whitespace-nowrap">৳{originalPrice}</span>
            )}
          </div>
          {/* Interaction Signifier — Accessible touch target & high clarity */}
          <div 
            aria-hidden="true"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-500 group-hover:bg-[#ce112d] group-hover:text-white transition-all shadow-sm shrink-0"
          >
            <ArrowRight size={16} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const ProductSkeleton = () => (
  <div className="bg-white rounded-2xl overflow-hidden border border-neutral-100 animate-pulse h-full">
    <div className="aspect-[4/5] bg-neutral-200" />
    <div className="p-3.5 md:p-5 space-y-3">
      <div className="h-2 w-16 bg-neutral-100 rounded-full" />
      <div className="h-4 w-full bg-neutral-200 rounded-lg" />
      <div className="h-4 w-2/3 bg-neutral-100 rounded-lg" />
      <div className="mt-8 flex justify-between items-end">
        <div className="h-6 w-20 bg-neutral-100 rounded-lg" />
        <div className="h-8 w-8 md:h-10 md:w-10 bg-neutral-200 rounded-xl" />
      </div>
    </div>
  </div>
);

export default ProductCard;
