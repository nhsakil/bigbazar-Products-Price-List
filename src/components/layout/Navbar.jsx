import { Globe, User, Bell, Menu, X, LayoutGrid } from 'lucide-react';
import { useCart } from '../../contexts/CartContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const Navbar = ({ selectedCategory, onSelectCategory, onTrackOrder, onOpenCart, onOpenAuth, onOpenCategories, isCategoryOpen }) => {
    const { cartCount } = useCart();
    const { language, toggleLanguage, t } = useLanguage();
    const { user, isLoggedIn } = useAuth();
    const navigate = useNavigate();

    const categories = [
        { id: 'Men', label: t('men') },
        { id: 'Women', label: t('women') },
        { id: 'Kids (Boys)', label: t('boys') },
        { id: 'Kids (Girls)', label: t('girls') },
    ];

    const handleCategoryClick = (catId) => {
        onSelectCategory(catId);
        if (catId === 'All') navigate('/');
        else navigate(`/products?category=${encodeURIComponent(catId)}`);
    };

    return (
        <nav className="relative z-[1002] transition-all duration-500 bg-white/95 backdrop-blur-md shadow-sm border-b border-zinc-100/80">
            <div className="w-full max-w-[1920px] 2xl:max-w-[2560px] mx-auto px-4 md:px-12">
                <div className="h-14 md:h-20 flex items-center justify-between gap-4 md:gap-8">
                    {/* Logo Section */}
                    <div className="shrink-0 flex items-center">
                        <button
                            onClick={() => { handleCategoryClick('All'); navigate('/'); }}
                            className="inline-block text-left relative"
                        >
                            <span className="text-xl md:text-3xl font-black italic tracking-tighter cursor-pointer select-none leading-none brand-logo block">
                                <span className="text-[#ce112d]">BIG</span>
                                <span className="text-zinc-900 ml-1">BAZAR</span>
                            </span>
                        </button>
                    </div>

                    {/* Desktop Category Links — Primary Shopping Navigation */}
                    <div className="hidden lg:flex items-center gap-1 md:gap-2">
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => handleCategoryClick(cat.id)}
                                className={`text-xs md:text-sm font-bold tracking-wide transition-all relative px-3.5 py-2 rounded-xl ${
                                    selectedCategory === cat.id 
                                        ? 'text-[#ce112d] bg-rose-50/70 font-black' 
                                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
                                }`}
                            >
                                {cat.label}
                                {selectedCategory === cat.id && (
                                    <motion.div layoutId="navline" className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#ce112d] rounded-full" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Hamburger — only below lg. Quick actions live in the drawer. */}
                    <div className="lg:hidden flex items-center ml-auto">
                        <button
                            onClick={onOpenCategories}
                            aria-label={isCategoryOpen ? "Close Menu" : "Open Menu"}
                            className="w-10 h-10 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-900 border border-zinc-200/80 active:scale-95 transition-all flex items-center justify-center"
                        >
                            {isCategoryOpen ? (
                                <X size={20} className="text-[#ce112d]" />
                            ) : (
                                <Menu size={20} className="text-[#ce112d]" />
                            )}
                        </button>
                    </div>

                    {/* Quick Access — desktop only (lg+). Cohesive button hierarchy. */}
                    <div className="hidden lg:flex items-center gap-2 md:gap-3">
                        {/* Track Order — Subordinate utility link */}
                        <button
                            onClick={onTrackOrder}
                            className="px-3 py-2 rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-all flex items-center gap-1.5 text-xs font-semibold"
                            title={t('track')}
                            aria-label={t('track')}
                        >
                            <Globe size={16} className="text-zinc-400" />
                            <span>{t('track')}</span>
                        </button>

                        {/* Language Switcher — Standardized Pill Toggle */}
                        <div 
                            role="group" 
                            aria-label={language === 'bn' ? 'ভাষা নির্বাচন' : 'Language switcher'} 
                            className="flex items-center bg-zinc-100 border border-zinc-200/80 rounded-full p-1 h-9"
                        >
                            <button
                                type="button"
                                onClick={() => language !== 'en' && toggleLanguage()}
                                aria-pressed={language === 'en'}
                                className={`px-3 h-full rounded-full text-xs font-bold transition-all ${
                                    language === 'en' 
                                        ? 'bg-white text-zinc-900 shadow-sm' 
                                        : 'text-zinc-500 hover:text-zinc-800'
                                }`}
                            >
                                EN
                            </button>
                            <button
                                type="button"
                                onClick={() => language !== 'bn' && toggleLanguage()}
                                aria-pressed={language === 'bn'}
                                className={`px-3 h-full rounded-full text-xs font-bold transition-all ${
                                    language === 'bn' 
                                        ? 'bg-[#ce112d] text-white shadow-sm' 
                                        : 'text-zinc-500 hover:text-zinc-800'
                                }`}
                            >
                                বাং
                            </button>
                        </div>

                        {/* Account */}
                        <button
                            onClick={() => navigate('/account')}
                            className="w-10 h-10 rounded-xl bg-zinc-50 hover:bg-zinc-100 flex items-center justify-center active:scale-95 transition-all border border-zinc-200/80 overflow-hidden text-zinc-700"
                            aria-label={isLoggedIn ? 'Account' : 'Sign in'}
                        >
                            {isLoggedIn && user?.avatar_url ? (
                                <img src={user.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                <User size={18} className="text-zinc-600" />
                            )}
                        </button>

                        {/* Cart */}
                        <button
                            onClick={onOpenCart}
                            className="relative h-10 px-4 rounded-xl flex items-center justify-center gap-2 bg-[#ce112d] hover:bg-[#b00e26] text-white shadow-md active:scale-95 transition-all font-bold text-xs"
                            aria-label={cartCount > 0 ? `Shopping cart with ${cartCount} items` : 'Shopping cart'}
                        >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="m2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
                            <span className="uppercase tracking-wide">
                                {language === 'bn' ? (cartCount > 0 ? `ব্যাগ (${cartCount})` : 'ব্যাগ') : (cartCount > 0 ? `Bag (${cartCount})` : 'Bag')}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
