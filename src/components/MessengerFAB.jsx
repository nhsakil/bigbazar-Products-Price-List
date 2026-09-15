import React from 'react';
import { MessageCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { trackMessengerClick } from '../utils/analytics';

// Big Bazar Facebook Page ID
const FB_PAGE_ID = '100063541603515';
const MESSENGER_URL = `https://m.me/${FB_PAGE_ID}?ref=website_fab`;

export default function MessengerFAB() {
    const { language } = useLanguage();

    const handleClick = () => {
        trackMessengerClick();
    };

    return (
        <a
            href={MESSENGER_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            aria-label={language === 'bn' ? 'মেসেঞ্জারে অর্ডার করুন' : 'Order on Messenger'}
            className="fixed bottom-[140px] sm:bottom-[76px] lg:bottom-8 right-3 md:right-6 z-[1005] bg-[#0084FF] text-white shadow-[0_6px_24px_rgba(0,132,255,0.45)] hover:scale-105 active:scale-95 transition-all duration-300 no-underline"
        >
          {/* Mobile View: Compact circular FAB so it never blocks search input or content */}
          <div className="sm:hidden w-12 h-12 rounded-full flex items-center justify-center relative">
            <MessageCircle size={22} className="shrink-0" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full animate-pulse" />
          </div>

          {/* Desktop & Tablet View: Full Pill Button */}
          <div className="hidden sm:flex items-center gap-2.5 px-5 py-3.5 rounded-full text-xs md:text-sm font-bold uppercase tracking-wider">
            <MessageCircle size={20} className="shrink-0" />
            <span>{language === 'bn' ? 'মেসেঞ্জারে অর্ডার করুন' : 'Order on Messenger'}</span>
          </div>
        </a>
    );
}
