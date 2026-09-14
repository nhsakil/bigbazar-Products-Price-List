import { useState, useEffect, useMemo } from 'react';
import { bigBazarApi } from '../api/client';
import { setToken, API_URL, getToken } from '../api/client';
import {
  Plus, Trash2, LogOut, Image as ImageIcon, Search,
  Settings, ShoppingBag, Edit, X, Play, Check,
  AlertCircle, Instagram, CheckCircle2, Clock, Upload, Save, Download, Package, Box,
  Sun, Moon, Star, RotateCcw, Archive, MessageSquare, Users, User, Phone, MapPin, Truck, ShieldCheck, Pipette, Menu, Copy, ExternalLink,
  Pencil, ChevronDown, ArrowRight, ArrowLeft, Video, Eye, EyeOff, Sparkles, BarChart3, Filter,
  Smartphone, Monitor, Tablet
} from 'lucide-react';
import { extractInstagramId } from '../utils/instagram';
import { getOptimizedUrl, mediaSizes } from '../utils/media';
import { formatColorName, getColorName, COLOR_MAP, PRESET_SWATCHES } from '../utils/colorNames';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import AlertModal from '../components/modals/AlertModal';
import VideoPlayer from '../components/VideoPlayer';
import AdminReports from '../components/admin/AdminReports';
import AdminConversations from '../components/admin/AdminConversations';
import AdminUsers from '../components/admin/AdminUsers';
import { compressImage, compressImages, COMPRESS_PRESETS, formatFileSize } from '../utils/imageCompressor';
import { TOP_CATEGORIES, SEED_SUBCATEGORIES, mergeWithDynamic, getSubcategoriesForCategory } from '../data/categories';

export default function Admin() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('orders');
  const [subcategoriesData, setSubcategoriesData] = useState(null);
  const [editingSubcat, setEditingSubcat] = useState(null);
  const [subcatForm, setSubcatForm] = useState({ id: '', name_en: '', name_bn: '', image_url: '', sort_order: 0 });
  const [subcatCategory, setSubcatCategory] = useState('Women');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [selectedSubcategoryFilter, setSelectedSubcategoryFilter] = useState('All');
  const [editingProduct, setEditingProduct] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '', type: 'error' });
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [confirmation, setConfirmation] = useState({ isOpen: false, title: '', message: '', onConfirm: null, confirmText: 'Delete' });
  const [siteTheme, setSiteTheme] = useState('dark');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [visitorCount, setVisitorCount] = useState(0);
  const [pendingCodes, setPendingCodes] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('idle'); // 'idle' | 'compressing' | 'uploading'
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [formAlert, setFormAlert] = useState(null); // { title, message, type: 'error' | 'success' }
  const [customSizeInput, setCustomSizeInput] = useState('');
  const [productPage, setProductPage] = useState(0);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [showRangeDeleteModal, setShowRangeDeleteModal] = useState(false);
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState('200');
  const [deletingRangeProgress, setDeletingRangeProgress] = useState(null);

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setAlertModal({
      isOpen: true,
      title: "Copied!",
      message: `${label} copied to clipboard.`,
      type: "success"
    });
    setTimeout(() => {
      setAlertModal(prev => ({ ...prev, isOpen: false }));
    }, 1200);
  };

  const copyFullOrderDetails = (order) => {
    if (!order) return;
    const charge = parseFloat(order.delivery_charge) || 0;
    const advance = order.is_advance_paid
      ? (order.is_exclusive_order ? 500 : (order.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge))
      : 0;
    const total = Number(order.total_amount) || 0;
    const due = order.payment_status === 'Fully Paid' ? 0 : Math.max(0, total - advance);

    const text = `BIG BAZAR ORDER DETAILS
━━━━━━━━━━━━━━━━━━━━
Order Ref: #${order.id.toString().slice(-6).toUpperCase()}
Date: ${new Date(order.created_at).toLocaleDateString()}
Customer: ${order.customer_name || 'N/A'}
Phone: ${order.customer_phone || 'N/A'}
Address: ${order.customer_address || 'N/A'}
Area: ${order.delivery_area || 'N/A'}
━━━━━━━━━━━━━━━━━━━━
Product(s): ${order.product_name || 'N/A'}
${order.size ? `Size: ${order.size}\n` : ''}${order.color ? `Color: ${order.color}\n` : ''}Total Price: ৳${total.toLocaleString()}
Advance Paid: ৳${advance.toLocaleString()}
Balance Due: ৳${due.toLocaleString()}
Payment Ref: ${order.last_four_digits || 'COD'}
${order.customer_note ? `Note: ${order.customer_note}` : ''}`.trim();

    copyToClipboard(text, "Order Details");
  };

  const [formStep, setFormStep] = useState(1);
  const [notifySignedInUsers, setNotifySignedInUsers] = useState(true);
  const [form, setForm] = useState({
    name: '', price: '', original_price: '', description: '',
    images: [], video_url: '', is_sale: false, is_hot: false,
    is_new: false, is_sold_out: false, is_exclusive: false, category: 'Women', subcategory: '',
    status: 'published', platform_id: '', serial_no: '',
    available_sizes: [], available_colors: [], stock_count: ''
  });

  const [siteSettings, setSiteSettings] = useState({
    hero_banner: { title: '', subtitle: '', image_url: '' },
    contact_info: { whatsapp: '', facebook: '', instagram: '' },
    main_slides: [],
    slider_aspect: 'auto',
    category_visibility: { show_new: true, show_sale: true, show_exclusive: true },
    wedding_banner: {
      enabled: false,
      image_url: '',
      title_bn: 'ওয়েডিং কালেকশন',
      title_en: 'Wedding Collection',
      subtitle_bn: 'এক্সক্লুসিভ কালেকশন',
      subtitle_en: 'Exclusive Collection',
      cta_bn: 'কালেকশন দেখুন',
      cta_en: 'Explore Collection',
      category_filter: 'Wedding',
    },
    announcement: {
      enabled: false,
      title_bn: 'গুরুত্বপূর্ণ বিজ্ঞপ্তি',
      title_en: 'Important Notice',
      message_bn: 'প্রিয় গ্রাহক, Big Bazar-এর সাথে থাকার জন্য ধন্যবাদ! বর্তমানে আমাদের ইনবক্সে মেসেজের চাপ অনেক বেশি থাকায় রিপ্লাই দিতে সাময়িক বিলম্ব হচ্ছে। আপনার শপিং অভিজ্ঞতা আরও সহজ ও দ্রুত করতে, অনুগ্রহ করে ওয়েবসাইট থেকেই সরাসরি অর্ডার করুন।',
      message_en: 'Dear customer, thanks for staying with Big Bazar! Currently, due to a high volume of messages, replies may be delayed. To make your shopping easier and faster, please order directly from the website.',
      footer_bn: 'Website থেকে অর্ডার করুন — দ্রুত ও সহজ!',
      footer_en: 'Order from Website — Fast & Easy!'
    }
  });

  useEffect(() => {
    bigBazarApi.auth.getSession().then(({ data: { session } }) => setSession(session));
    bigBazarApi.auth.onAuthStateChange((_event, session) => setSession(session));
    fetchProducts();
    fetchOrders();
    fetchReviews();
    fetchSiteSettings();
  }, []);

  const fetchProducts = async (pageToFetch = 0, append = false) => {
    setLoading(true);
    const { data } = await bigBazarApi
      .from('products')
      // DB-1 fix: use fixed 100-item page size (range 0..99, 100..199, etc.) for stable KV cache reuse
      .select('id,serial_no,name,price,original_price,category,subcategory,status,stock_count,is_sale,is_hot,is_new,is_sold_out,is_deleted,available_sizes,available_colors,is_exclusive,images,created_at,video_url,platform_id')
      .order('created_at', { ascending: false })
      .range(pageToFetch * 100, (pageToFetch + 1) * 100 - 1);

    const fetched = data || [];
    if (append) {
      setProducts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newItems = fetched.filter(p => !existingIds.has(p.id));
        return [...prev, ...newItems];
      });
    } else {
      setProducts(fetched);
    }
    setProductPage(pageToFetch);
    setHasMoreProducts(fetched.length >= 100);
    setLoading(false);
  };

  const handleLoadMoreProducts = () => {
    const nextPage = productPage + 1;
    fetchProducts(nextPage, true);
  };

  const handleLoadAllProducts = async () => {
    setLoading(true);
    try {
      let allLoaded = [...products];
      let currentPage = productPage + 1;
      let more = true;
      while (more) {
        const { data } = await bigBazarApi
          .from('products')
          .select('id,serial_no,name,price,original_price,category,subcategory,status,stock_count,is_sale,is_hot,is_new,is_sold_out,is_deleted,available_sizes,available_colors,is_exclusive,images,created_at,video_url,platform_id')
          .order('created_at', { ascending: false })
          .range(currentPage * 100, (currentPage + 1) * 100 - 1);

        if (!data || data.length === 0) {
          more = false;
          break;
        }
        const existingIds = new Set(allLoaded.map(p => p.id));
        const newItems = data.filter(p => !existingIds.has(p.id));
        allLoaded = [...allLoaded, ...newItems];
        if (data.length < 100) {
          more = false;
        } else {
          currentPage++;
        }
      }
      setProducts(allLoaded);
      setProductPage(currentPage);
      setHasMoreProducts(false);
    } catch (err) {
      console.error('Error loading all products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDeleteBySerialRange = async () => {
    const start = parseInt(rangeStart);
    const end = parseInt(rangeEnd);
    if (isNaN(start) || isNaN(end) || start > end) {
      setAlertModal({ isOpen: true, title: 'Invalid Range', message: 'Please enter valid serial numbers (e.g. From 1 To 200).', type: 'error' });
      return;
    }

    setLoading(true);
    // Fetch target products from DB in range using standard 100-item page requests
    let targetProducts = [];
    let page = 0;
    let keepFetching = true;
    while (keepFetching) {
      const { data } = await bigBazarApi
        .from('products')
        .select('id, serial_no, name')
        .order('serial_no', { ascending: true })
        .range(page * 100, (page + 1) * 100 - 1);

      if (!data || data.length === 0) {
        keepFetching = false;
      } else {
        targetProducts = [...targetProducts, ...data];
        if (data.length < 100 || targetProducts.length >= 5000) {
          keepFetching = false;
        } else {
          page++;
        }
      }
    }

    const matching = (targetProducts || []).filter(p => p.serial_no >= start && p.serial_no <= end);

    if (matching.length === 0) {
      setLoading(false);
      setAlertModal({ isOpen: true, title: 'No Products Found', message: `No products found with Serial numbers between #${start} and #${end}.`, type: 'error' });
      return;
    }

    setConfirmation({
      isOpen: true,
      title: `Delete ${matching.length} Products?`,
      message: `আপনি কি নিশ্চিত যে আপনি Serial #${start} থেকে #${end} পর্যন্ত ${matching.length}টি পণ্য স্থায়ীভাবে ডিলিট করতে চান?`,
      confirmText: `Delete ${matching.length} Items`,
      onConfirm: async () => {
        setShowRangeDeleteModal(false);
        setLoading(true);
        setDeletingRangeProgress({ current: 0, total: matching.length });

        for (let i = 0; i < matching.length; i++) {
          await bigBazarApi.from('products').delete().eq('id', matching[i].id);
          setDeletingRangeProgress({ current: i + 1, total: matching.length });
        }

        setDeletingRangeProgress(null);
        setAlertModal({ isOpen: true, title: 'Bulk Delete Complete!', message: `Successfully deleted ${matching.length} products (Serial #${start} - #${end}).`, type: 'success' });
        fetchProducts();
        setLoading(false);
      }
    });
    setLoading(false);
  };

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await bigBazarApi
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    setOrders(data || []);
    setLoading(false);
  };

  const fetchReviews = async () => {
    const { data } = await bigBazarApi
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setReviews(data || []);
  };

  const updateOrderStatus = async (id, status) => {
    setConfirmation({
      isOpen: true,
      title: 'Update Order Status',
      message: `আপনি কি পরিবর্তন করে "${status}" করতে চান?`,
      confirmText: 'Update Status',
      onConfirm: async () => {
        const { error } = await bigBazarApi.from('orders').update({ status }).eq('id', id);
        if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
        else {
          fetchOrders();
          if (selectedOrder?.id === id) {
            setSelectedOrder({ ...selectedOrder, status });
          }
        }
      }
    });
  };

  const updateOrderNote = async (id, currentNote) => {
    const newNote = prompt('অর্ডার নোট আপডেট করুন:', currentNote || '');
    if (newNote !== null) {
      const { error } = await bigBazarApi.from('orders').update({ customer_note: newNote }).eq('id', id);
      if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
      else {
        fetchOrders();
        if (selectedOrder?.id === id) {
          setSelectedOrder({ ...selectedOrder, customer_note: newNote });
        }
      }
    }
  };

  const togglePaymentStatus = async (order, targetStatus) => {
    // If targetStatus matches current, reset to Unpaid
    const nextStatus = order.payment_status === targetStatus ? 'Unpaid' : targetStatus;

    setConfirmation({
      isOpen: true,
      title: 'Update Payment Status',
      message: `পেমেন্ট স্ট্যাটাস "${nextStatus}" করতে চান?`,
      confirmText: 'Update Payment',
      onConfirm: async () => {
        const { error } = await bigBazarApi
          .from('orders')
          .update({
            payment_status: nextStatus,
            is_advance_paid: nextStatus !== 'Unpaid'
          })
          .eq('id', order.id);

        if (error) {
          // Fallback for older schemas without payment_status column
          const { error: fallbackError } = await bigBazarApi
            .from('orders')
            .update({ is_advance_paid: nextStatus !== 'Unpaid' })
            .eq('id', order.id);

          if (fallbackError) {
            setAlertModal({ isOpen: true, title: 'Error', message: fallbackError.message, type: 'error' });
          } else {
            fetchOrders();
            if (selectedOrder?.id === order.id) {
              setSelectedOrder({ ...selectedOrder, is_advance_paid: nextStatus !== 'Unpaid' });
            }
          }
        } else {
          fetchOrders();
          if (selectedOrder?.id === order.id) {
            setSelectedOrder({ ...selectedOrder, payment_status: nextStatus, is_advance_paid: nextStatus !== 'Unpaid' });
          }
        }
      }
    });
  };

  const toggleAdvancePayment = async (id, currentStatus) => {
    // Kept for backward compatibility if needed elsewhere, but redirecting to new logic
    const order = orders.find(o => o.id === id);
    if (order) togglePaymentStatus(order, 'Advance Paid');
  };

  // Soft delete — moves to 'Deleted' status instead of permanent delete
  const deleteOrder = async (id) => {
    setConfirmation({
      isOpen: true,
      title: 'Delete Order',
      message: 'অর্ডারটি ডিলিটেড সেকশনে সরানো হবে। পরে Undo করা যাবে।',
      confirmText: 'Trash',
      onConfirm: async () => {
        const { error } = await bigBazarApi.from('orders').update({ status: 'Deleted' }).eq('id', id);
        if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
        else {
          fetchOrders();
          if (selectedOrder?.id === id) {
            setSelectedOrder({ ...selectedOrder, status: 'Deleted' });
          }
        }
      }
    });
  };

  // Undo — restore deleted order back to Pending
  const restoreOrder = async (id) => {
    setConfirmation({
      isOpen: true,
      title: 'Restore Order',
      message: 'আপনি কি এই অর্ডারটি পুনরুদ্ধার করতে চান?',
      confirmText: 'Restore Order',
      onConfirm: async () => {
        const { error } = await bigBazarApi.from('orders').update({ status: 'Pending' }).eq('id', id);
        if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
        else {
          fetchOrders();
          setAlertModal({ isOpen: true, title: 'Restored!', message: 'অর্ডারটি সফলভাবে পুনরুদ্ধার করা হয়েছে।', type: 'success' });
        }
      }
    });
  };

  // Permanent delete
  const permanentDeleteOrder = async (id) => {
    setConfirmation({
      isOpen: true,
      title: 'Permanent Delete',
      message: 'এই অর্ডারটি চিরতরে মুছে ফেলা হবে। এটি আর ফেরানো যাবে না!',
      confirmText: 'Delete Forever',
      onConfirm: async () => {
        const { error } = await bigBazarApi.from('orders').delete().eq('id', id);
        if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
        else fetchOrders();
      }
    });
  };

  const emptyBin = async () => {
    setConfirmation({
      isOpen: true,
      title: 'Empty Bin',
      message: 'আপনি কি নিশ্চিত যে আপনি সবগুলি ডিলিটেড অর্ডার চিরতরে মুছে ফেলতে চান?',
      confirmText: 'Empty All',
      onConfirm: async () => {
        const { error } = await bigBazarApi.from('orders').delete().eq('status', 'Deleted');
        if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
        else fetchOrders();
      }
    });
  };

  const fetchSiteSettings = async () => {
    const { data } = await bigBazarApi.from('site_settings').select('*');
    const settings = {
      hero_banner: { title: '5% FLAT DISCOUNT', subtitle: 'FOR THE 10K FAMILY ON FACEBOOK PAGE', image_url: null },
      contact_info: { whatsapp: '', facebook: '', instagram: '' },
      main_slides: [],
      category_visibility: { show_new: true, show_sale: true, show_exclusive: true },
      announcement: {
        enabled: false,
        title_bn: 'গুরুত্বপূর্ণ বিজ্ঞপ্তি',
        title_en: 'Important Notice',
        message_bn: 'প্রিয় গ্রাহক, Big Bazar-এর সাথে থাকার জন্য ধন্যবাদ! বর্তমানে আমাদের ইনবক্সে মেসেজের চাপ অনেক বেশি থাকায় রিপ্লাই দিতে সাময়িক বিলম্ব হচ্ছে। আপনার শপিং অভিজ্ঞতা আরও সহজ ও দ্রুত করতে, অনুগ্রহ করে ওয়েবসাইট থেকেই সরাসরি অর্ডার করুন।',
        message_en: 'Dear customer, thanks for staying with Big Bazar! Currently, due to a high volume of messages, replies may be delayed. To make your shopping easier and faster, please order directly from the website.',
        footer_bn: 'Website থেকে অর্ডার করুন — দ্রুত ও সহজ!',
        footer_en: 'Order from Website — Fast & Easy!'
      },
      ticker_announcement: {
        enabled: false,
        text: '',
        position: 'top_navbar',
        bg_color: '#ce112d',
        speed: 25
      }
    };

    if (data) {
      // Backend returns data as either:
      // A) Flat object: { hero_banner: {...}, contact_info: {...}, ... }
      // B) Array of rows: [{ key: 'hero_banner', value: {...} }, ...]
      const isArray = Array.isArray(data);
      const getValue = (key) => {
        if (isArray) return data.find(s => s.key === key)?.value;
        return data[key]; // flat object from /api/settings
      };

      const banner = getValue('hero_banner');
      const contact = getValue('contact_info');
      const slides = getValue('main_slides');
      const sliderAspect = getValue('slider_aspect');
      const announcement = getValue('announcement');
      const ticker = getValue('ticker_announcement');
      if (banner) settings.hero_banner = banner;
      if (contact) settings.contact_info = contact;
      if (slides) settings.main_slides = Array.isArray(slides) ? slides : [];
      if (sliderAspect) settings.slider_aspect = sliderAspect;
      if (announcement) settings.announcement = announcement;
      if (ticker) settings.ticker_announcement = ticker;
      const themeData = getValue('site_theme');
      if (themeData?.mode) setSiteTheme(themeData.mode);
      const catVis = getValue('category_visibility');
      if (catVis) settings.category_visibility = catVis;
      const weddingBanner = getValue('wedding_banner');
      if (weddingBanner) settings.wedding_banner = { ...settings.wedding_banner, ...weddingBanner };

      // Load dynamic subcategories
      const subcats = getValue('subcategories');
      if (subcats && typeof subcats === 'object') {
        setSubcategoriesData(subcats);
      }

      const visitors = getValue('site_visitors');
      if (visitors !== undefined && visitors !== null) {
        setVisitorCount(parseInt(visitors) || 0);
      }
    }
    setSiteSettings(settings);
  };

  const fetchPendingCodes = async () => {
    const token = getToken();
    try {
      const res = await fetch(`${API_URL}/api/auth/pending-codes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        setPendingCodes([]);
        return;
      }
      const json = await res.json();
      setPendingCodes(Array.isArray(json?.codes) ? json.codes : []);
    } catch { setPendingCodes([]); }
  };

  const handleVideoBlur = async () => {
    if (!form.video_url) return;
    // Instagram URL is for the video player only — store platform_id for reference, never pull photos
    if (form.video_url.includes('instagram.com') || form.video_url.includes('instagr.am')) {
      const igId = extractInstagramId(form.video_url);
      if (igId) {
        setForm(prev => ({
          ...prev,
          platform_id: prev.platform_id || igId,
        }));
      }
    }
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();

    const isFakePoster = (url) => typeof url === 'string' && (url.startsWith('data:image/svg+xml') || url.includes('Big Bazar Video') || url.includes('Big Bazar Reel') || /instagram\.com|instagr\.am/i.test(url));
    let currentImages = [...(form.images || [])].filter(img => !isFakePoster(img));
    let currentImageUrl = form.image_url && !isFakePoster(form.image_url) ? form.image_url : (currentImages[0] || null);

    // Product cards need a real photo — Instagram link is video-only and must not replace images
    if (!currentImages.length && !currentImageUrl) {
      setAlertModal({
        isOpen: true,
        title: 'Product Photo Required',
        message: 'অনুগ্রহ করে পণ্যের ছবি আপলোড করুন। Instagram লিঙ্ক শুধু ভিডিও দেখানোর জন্য — ছবি আনা হয় না। (Upload a product photo. Instagram URL is for video only.)',
        type: 'error',
      });
      return;
    }

    if (!form.name?.trim()) {
      setAlertModal({ isOpen: true, title: 'Name Required', message: 'Please enter a product name.', type: 'error' });
      return;
    }

    if (!form.price && form.price !== 0) {
      setAlertModal({ isOpen: true, title: 'Price Required', message: 'Please enter the sale price.', type: 'error' });
      return;
    }

    // Validation: Every added color must have an image
    if (form.available_colors && form.available_colors.length > 0) {
      const missingColorImage = form.available_colors.find(c => !c.image);
      if (missingColorImage) {
        setAlertModal({ isOpen: true, title: 'Color Image Required', message: `অনুগ্রহ করে '${missingColorImage.name || 'রঙ'}' এর জন্য একটি ছবি যুক্ত করুন।`, type: 'error' });
        return;
      }
    }

    // Serial is automatic: next = max existing + 1 (no manual input)
    let finalSerialNo;
    if (editingProduct) {
      finalSerialNo = editingProduct.serial_no;
    } else {
      const { data: topSerial } = await bigBazarApi
        .from('products')
        .select('serial_no')
        .order('serial_no', { ascending: false })
        .range(0, 0);
      const maxFromDb = topSerial?.[0] ? parseInt(topSerial[0].serial_no, 10) || 0 : 0;
      const maxFromLoaded = products?.length
        ? Math.max(...products.map(p => parseInt(p.serial_no, 10) || 0), 0)
        : 0;
      finalSerialNo = Math.max(maxFromDb, maxFromLoaded) + 1;
    }

    const { _newColorHex, _newColorName, _colorSuggestions, serial_no: _ignoredSerial, ...formData } = form;
    const finalMainImage = currentImageUrl || (currentImages.length > 0 ? currentImages[0] : null);
    if (finalMainImage && (!currentImages.length || currentImages[0] !== finalMainImage)) {
      currentImages = [finalMainImage, ...currentImages.filter(img => img !== finalMainImage)];
    }

    const productData = {
      ...formData,
      images: currentImages,
      image_url: finalMainImage,
      price: parseFloat(form.price) || 0,
      original_price: form.original_price ? parseFloat(form.original_price) : null,
      stock_count: form.stock_count !== '' && form.stock_count !== null && form.stock_count !== undefined ? parseInt(form.stock_count) : null,
      is_exclusive: form.is_exclusive || false,
      platform_id: form.platform_id || null,
      video_url: form.video_url || '',
      description: form.description || '',
    };

    // Preserve existing serial on edit — never coerce null/undefined to 1
    if (editingProduct) {
      const existingSerial = editingProduct.serial_no;
      if (existingSerial != null && String(existingSerial).trim() !== '' && !Number.isNaN(Number(existingSerial))) {
        productData.serial_no = Number(existingSerial);
      }
      // else omit serial_no so PUT does not overwrite DB value
    } else {
      productData.serial_no = parseInt(finalSerialNo, 10) || 1;
    }

    if (editingProduct) {
      // ── OPTIMISTIC INSTANT UPDATE (<50ms UI response) ──
      const updatedProduct = {
        ...editingProduct,
        ...productData,
        id: editingProduct.id,
        serial_no: productData.serial_no ?? editingProduct.serial_no,
      };
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? updatedProduct : p));
      cancelEdit();
      setActiveTab('published');
      setAlertModal({
        isOpen: true,
        title: "Updated!",
        message: "Product updated successfully!",
        type: "success"
      });

      // Background DB sync
      bigBazarApi.from('products').update(productData).eq('id', editingProduct.id).then(({ error }) => {
        if (error) {
          console.error("Background update error:", error);
          setAlertModal({
            isOpen: true,
            title: "Sync Error",
            message: "Failed to sync update to database: " + error.message,
            type: "error"
          });
        }
        fetchProducts();
      });
    } else {
      // ── OPTIMISTIC INSTANT INSERT (<50ms UI response) ──
      const newId = crypto.randomUUID();
      const newProduct = {
        ...productData,
        id: newId,
        created_at: new Date().toISOString()
      };
      setProducts(prev => [newProduct, ...prev]);
      cancelEdit();
      setActiveTab('published');
      setAlertModal({
        isOpen: true,
        title: "Added!",
        message: "New product added successfully!",
        type: "success"
      });

      // Background DB sync
      bigBazarApi.from('products').insert([{ ...productData, id: newId }]).then(async ({ error }) => {
        if (error) {
          console.error("Background insert error:", error);
          setAlertModal({
            isOpen: true,
            title: "Save Failed",
            message: error.message || "Failed to save product to database.",
            type: "error"
          });
        } else if (notifySignedInUsers && (productData.status || 'published') === 'published') {
          try {
            const token = getToken();
            const res = await fetch(`${API_URL}/api/admin/notify-product`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ product_id: newId, product_name: productData.name }),
            });
            const text = await res.text();
            let data = {};
            try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
            if (res.ok) {
              const pushInfo = data.push && !data.push.skipped
                ? ` Browser push: ${data.push.delivered || 0} delivered.`
                : '';
              setAlertModal({
                isOpen: true,
                title: 'Added & Notified',
                message: `Product saved. In-app alert for ${data.audience ?? 0} user(s).${pushInfo}`,
                type: 'success',
              });
            } else if (res.status === 404) {
              setAlertModal({
                isOpen: true,
                title: 'Product Saved',
                message: 'Product saved, but notify API is not on production yet. Redeploy to enable alerts.',
                type: 'success',
              });
            }
          } catch (_) { /* product saved; notify is best-effort */ }
        }
        fetchProducts();
      });
    }
  };

  const handleBannerUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await bigBazarApi.from('site_settings').upsert({ key: 'hero_banner', value: siteSettings.hero_banner }, { onConflict: 'key' });
    if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
    else setAlertModal({ isOpen: true, title: 'Success', message: "Hero Banner Updated!", type: 'success' });
  };

  /**
   * Upload an already compressed/processed File to the backend.
   * Returns the public URL string on success, or null on failure.
   */
  const uploadSingleFile = async (fileToUpload) => {
    setUploadStatus('uploading');

    // Extreme safety size check: block uploads over 5MB to prevent base64 timeouts
    const MAX_ALLOWED_SIZE = 5 * 1024 * 1024; // 5 MB
    if (fileToUpload.size > MAX_ALLOWED_SIZE) {
      console.error(`Rejected upload: File size is ${formatFileSize(fileToUpload.size)} which exceeds the 3MB safety limit.`);
      return null;
    }

    const fileExt = fileToUpload.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `assets/${fileName}`;

    try {
      const { data: uploadData, error: uploadError } = await bigBazarApi.storage.from('assets').upload(filePath, fileToUpload, {
        cacheControl: '31536000',
        upsert: false
      });

      if (uploadError) {
        console.error('Upload API Error:', uploadError);
        return null;
      }

      if (uploadData && uploadData.fullPath) return uploadData.fullPath;
      const { data } = bigBazarApi.storage.from('assets').getPublicUrl(uploadData?.path || filePath);
      return data.publicUrl;
    } catch (err) {
      console.error('Upload Error:', err);
      return null;
    }
  };

  const handleFileUpload = async (e, target) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    setLoading(true);
    setUploadProgress({ current: 0, total: rawFiles.length });

    if (target === 'banner') {
      setUploadStatus('compressing');
      const totalBefore = rawFiles[0].size;
      let compressed;
      try {
        compressed = await compressImage(rawFiles[0], COMPRESS_PRESETS.banner);
      } catch (err) {
        setAlertModal({
          isOpen: true,
          title: 'Image Compression Skipped',
          message: err.message || "Failed to parse the file image payload. Please ensure it is a valid format (e.g. JPG, PNG).",
          type: 'error'
        });
        setLoading(false);
        setUploadStatus('idle');
        e.target.value = '';
        return;
      }

      const totalAfter = compressed.size;
      if (totalAfter > 5 * 1024 * 1024) {
        setAlertModal({
          isOpen: true,
          title: 'Image Too Large',
          message: `The image is ${formatFileSize(totalAfter)} after compression, which exceeds the 5MB limit. Please resize it locally first.`,
          type: 'error'
        });
        setLoading(false);
        setUploadStatus('idle');
        e.target.value = '';
        return;
      }

      const url = await uploadSingleFile(compressed);
      if (url) {
        setSiteSettings(prev => ({ ...prev, hero_banner: { ...prev.hero_banner, image_url: url } }));
        setAlertModal({
          isOpen: true,
          title: 'Banner Uploaded',
          message: `Size: ${formatFileSize(totalBefore)} → ${formatFileSize(totalAfter)} (saved ${Math.round((1 - totalAfter / totalBefore) * 100)}%)`,
          type: 'success'
        });
      } else {
        setAlertModal({ isOpen: true, title: 'Upload Failed', message: "The database or server-side store rejected this banner upload.", type: 'error' });
      }

    } else if (target === 'slider') {
      const uploadedUrls = [];
      let totalBefore = 0, totalAfter = 0;
      let failedReasons = [];

      for (let i = 0; i < rawFiles.length; i++) {
        setUploadProgress({ current: i + 1, total: rawFiles.length });
        totalBefore += rawFiles[i].size;

        setUploadStatus('compressing');
        let compressed;
        try {
          compressed = await compressImage(rawFiles[i], COMPRESS_PRESETS.slider);
        } catch (err) {
          failedReasons.push(`${rawFiles[i].name}: ${err.message}`);
          continue;
        }

        totalAfter += compressed.size;

        // Size check for specific slide to prevent crash
        if (compressed.size > 5 * 1024 * 1024) {
          failedReasons.push(`${rawFiles[i].name}: File size remains at ${formatFileSize(compressed.size)} which exceeds the 5MB limit.`);
          continue;
        }

        const url = await uploadSingleFile(compressed);
        if (url) {
          let aspect_ratio = null, width = null, height = null;
          try {
            const imgBitmap = await createImageBitmap(compressed);
            width = imgBitmap.width;
            height = imgBitmap.height;
            aspect_ratio = Number((width / height).toFixed(4));
            imgBitmap.close();
          } catch (_) {}
          uploadedUrls.push({ id: Date.now() + i, image: url, aspect_ratio, width, height });
        } else {
          failedReasons.push(`${rawFiles[i].name}: Main upload rejected by server.`);
        }
      }

      if (uploadedUrls.length > 0) {
        setSiteSettings(prev => ({ ...prev, main_slides: [...(prev.main_slides || []), ...uploadedUrls] }));
        const savings = totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;
        setAlertModal({
          isOpen: true,
          title: `${uploadedUrls.length} Slide${uploadedUrls.length > 1 ? 's' : ''} Uploaded`,
          message: `Compressed total: ${formatFileSize(totalBefore)} → ${formatFileSize(totalAfter)} (saved ${savings}%)${failedReasons.length > 0 ? `. ${failedReasons.length} issue(s): ${failedReasons.join(' | ')}` : ''}`,
          type: 'success'
        });
      } else {
        setAlertModal({
          isOpen: true,
          title: 'Upload Failed',
          message: failedReasons.length > 0
            ? failedReasons.join('\n')
            : 'No files were uploaded. Make sure you selected correct images.',
          type: 'error'
        });
      }

    } else {
      // Product gallery / variants
      const uploadedUrls = [];
      let totalBefore = 0, totalAfter = 0;
      let failedReasons = [];

      for (let i = 0; i < rawFiles.length; i++) {
        setUploadProgress({ current: i + 1, total: rawFiles.length });
        totalBefore += rawFiles[i].size;

        setUploadStatus('compressing');
        const preset = i === 0 && target === 'product' ? COMPRESS_PRESETS.product : COMPRESS_PRESETS.gallery;
        let compressed;
        try {
          compressed = await compressImage(rawFiles[i], preset);
        } catch (err) {
          failedReasons.push(`${rawFiles[i].name}: ${err.message}`);
          continue;
        }

        totalAfter += compressed.size;

        if (compressed.size > 2 * 1024 * 1024) {
          failedReasons.push(`${rawFiles[i].name}: Over 2MB limit (${formatFileSize(compressed.size)})`);
          continue;
        }

        const url = await uploadSingleFile(compressed);
        if (url) {
          uploadedUrls.push(url);
        } else {
          failedReasons.push(`${rawFiles[i].name}: Transfer failed.`);
        }
      }

      if (uploadedUrls.length > 0) {
        if (target === 'product') {
          setForm(prev => {
            const cleanOther = (prev.images || []).filter(img => !img.includes('Big Bazar Video') && !img.includes('placeholder'));
            return {
              ...prev,
              image_url: prev.image_url || uploadedUrls[0],
              images: [...uploadedUrls, ...cleanOther.filter(img => !uploadedUrls.includes(img))]
            };
          });
          setPreviewImage(uploadedUrls[0]);
        } else {
          setForm(prev => ({ ...prev, images: [...(prev.images || []), ...uploadedUrls] }));
          setPreviewImage(uploadedUrls[uploadedUrls.length - 1]);
        }
      } else {
        setAlertModal({
          isOpen: true,
          title: 'Upload Failed',
          message: failedReasons.length > 0 ? failedReasons.join('\n') : 'Could not upload pictures.',
          type: 'error'
        });
      }
    }

    setUploadProgress({ current: 0, total: 0 });
    setUploadStatus('idle');
    setLoading(false);
    e.target.value = '';
  };

  const handleMobileSlideUpload = async (e, slideIndex) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setUploadStatus('compressing');
    try {
      const compressed = await compressImage(file, COMPRESS_PRESETS.slider_mobile);
      let mobile_aspect_ratio = null, mobile_width = null, mobile_height = null;
      try {
        const imgBitmap = await createImageBitmap(compressed);
        mobile_width = imgBitmap.width;
        mobile_height = imgBitmap.height;
        mobile_aspect_ratio = Number((mobile_width / mobile_height).toFixed(4));
        imgBitmap.close();
      } catch (_) {}

      const url = await uploadSingleFile(compressed);
      if (url) {
        const updated = [...siteSettings.main_slides];
        updated[slideIndex] = {
          ...updated[slideIndex],
          mobile_image: url,
          mobile_aspect_ratio,
          mobile_width,
          mobile_height
        };
        setSiteSettings(prev => ({ ...prev, main_slides: updated }));
        setAlertModal({
          isOpen: true,
          title: 'Mobile Banner Attached',
          message: `Dedicated mobile banner attached to Slide ${slideIndex + 1}.`,
          type: 'success'
        });
      }
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Upload Failed',
        message: err.message || 'Failed to upload mobile banner.',
        type: 'error'
      });
    } finally {
      setLoading(false);
      setUploadStatus('idle');
      e.target.value = '';
    }
  };

  const deleteProduct = async (id) => {
    setConfirmation({
      isOpen: true,
      title: 'Delete Product',
      message: 'Are you sure you want to permanently delete this product from the inventory?',
      confirmText: 'Delete',
      onConfirm: async () => {
        const { error } = await bigBazarApi.from('products').delete().eq('id', id);
        if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
        else fetchProducts();
      }
    });
  };

  const handleExportCSV = () => {
    if (orders.length === 0) {
      setAlertModal({ isOpen: true, title: 'Export Failed', message: 'No orders found to export.', type: 'error' });
      return;
    }

    const headers = [
      "Date", "Product", "Price", "Customer", "Phone", "Address",
      "Area", "Charge", "Total", "Size", "Color", "Last 4 Digits", "Status", "Note"
    ];

    const rows = orders.map(o => [
      new Date(o.created_at).toLocaleString(),
      o.product_name,
      o.product_price,
      o.customer_name,
      o.customer_phone,
      `"${(o.customer_address || '').replace(/"/g, '""')}"`,
      o.delivery_area,
      o.delivery_charge,
      o.total_amount,
      o.size || '',
      o.color || '',
      o.last_four_digits,
      o.status,
      `"${(o.customer_note || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `BigBazar_Orders_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const cancelEdit = () => {
    setEditingProduct(null);
    setPreviewImage(null);
    setPreviewVideo(null);
    setForm({
      name: '', price: '', original_price: '', description: '',
      images: [], video_url: '', is_sale: false, is_hot: false,
      is_new: false, is_sold_out: false, is_exclusive: false, category: 'Women', subcategory: '',
      status: 'published', platform_id: '', serial_no: '',
      available_sizes: [], available_colors: [], stock_count: ''
    });
    setFormStep(1);
  };

  const startEdit = (p) => {
    setEditingProduct(p);
    const isFakePoster = (url) => typeof url === 'string' && (url.startsWith('data:image/svg+xml') || url.includes('Big Bazar Video') || url.includes('Big Bazar Reel') || /instagram\.com|instagr\.am/i.test(url));
    const rawImages = Array.isArray(p.images) ? p.images.filter(img => !isFakePoster(img)) : [];
    const mainImg = p.image_url && !isFakePoster(p.image_url) ? p.image_url : (rawImages[0] || null);

    setForm({
      ...p,
      image_url: mainImg,
      images: rawImages.length > 0 ? rawImages : (mainImg ? [mainImg] : [])
    });
    setPreviewImage(mainImg);
    setFormStep(1);
    setActiveTab('add');
  };

  if (!session) return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md space-y-8 bg-zinc-900 p-10 rounded-[32px] border border-white/5 shadow-2xl">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-white uppercase">Admin <span className="text-[#ce112d]">Login</span></h2>
          <p className="text-sm text-zinc-500 font-medium">
            Enter your email & password to access the dashboard
          </p>
        </div>



        <form onSubmit={async (e) => {
          e.preventDefault();
          if (!email || !password) {
            setAlertModal({ isOpen: true, title: 'Incomplete Login', message: 'Please enter both email address and password.', type: 'error' });
            return;
          }
          setLoading(true);
          try {
            const { data, error } = await bigBazarApi.auth.signInWithPassword({ email, password });
            if (error) {
              setAlertModal({
                isOpen: true,
                title: 'Authentication Error',
                message: error.message || 'Invalid email or password. Please verify your admin credentials.',
                type: 'error'
              });
            } else if (data?.session) {
              setSession(data.session);
            }
          } catch (err) {
            setAlertModal({
              isOpen: true,
              title: 'Login Error',
              message: err.message || 'Unable to connect to login service. Please check your connection.',
              type: 'error'
            });
          } finally {
            setLoading(false);
          }
        }} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1">Email Address</label>
            <input
              type="email"
              placeholder="Enter your email"
              className="w-full bg-black border border-zinc-800 h-12 px-4 rounded-2xl text-sm font-medium focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 outline-none transition-all text-white"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider ml-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className="w-full bg-black border border-zinc-800 h-12 pl-4 pr-12 rounded-2xl text-sm font-medium focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 outline-none transition-all text-white"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-zinc-400 hover:text-white transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button disabled={loading} className="w-full bg-[#ce112d] h-14 rounded-2xl font-bold uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-red-900/20 text-white text-sm mt-4 disabled:opacity-50">
            {loading ? 'Verifying...' : 'Continue →'}
          </button>
        </form>
      </div>

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );

  return (
    <div className="admin-a11y min-h-screen bg-[#0a0a0c] text-[#e4e4e7] flex flex-col lg:flex-row font-sans selection:bg-[#ce112d]/30">
      {/* Mobile Top Bar */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-zinc-950 border-b border-white/5 sticky top-0 z-[60] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <ShoppingBag className="text-[#ce112d] w-5 h-5" />
          <h1 className="text-lg font-bold uppercase tracking-tight text-white">Big<span className="text-[#ce112d]">Bazar</span></h1>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-zinc-900 rounded-xl transition-all"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Fixed Position */}
      <aside className={`fixed lg:sticky top-0 left-0 w-64 h-[100dvh] lg:h-screen border-r border-[#1d1d21] px-6 pt-24 pb-6 lg:py-8 flex flex-col justify-between shrink-0 bg-[#0a0a0c] z-50 transition-transform duration-300 lg:translate-x-0 overflow-y-auto no-scrollbar ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="space-y-10">
          <div className="hidden lg:flex items-center gap-3 px-2">
            <ShoppingBag className="text-[#ce112d]" />
            <h1 className="text-xl font-bold uppercase tracking-tight text-white">Big<span className="text-[#ce112d]">Bazar</span></h1>
          </div>
          <nav className="space-y-1">
            {[
              { id: 'pending-items', icon: <Package size={18} />, label: 'Pending Items', count: orders.filter(o => o && o.status === 'Pending').length },
              { id: 'orders', icon: <ShoppingBag size={18} />, label: 'All Orders', count: orders.filter(o => o && o.status !== 'Deleted').length },
              { id: 'reports', icon: <BarChart3 size={18} />, label: 'Reports & Analytics' },
              { id: 'conversations', icon: <MessageSquare size={18} />, label: 'AI Conversations' },
              { id: 'users', icon: <Users size={18} />, label: 'Signed-in Users' },
              { id: 'deleted', icon: <Archive size={18} />, label: 'Deleted', count: orders.filter(o => o && o.status === 'Deleted').length },
              { id: 'reviews', icon: <Star size={18} />, label: 'Reviews', count: reviews.length },
              { id: 'pending', icon: <Clock size={18} />, label: 'Drafts', count: products.filter(p => p && p.status === 'pending' && !p.is_sold_out).length },
              { id: 'published', icon: <CheckCircle2 size={18} />, label: 'Live Products', count: products.filter(p => p && p.status === 'published' && !p.is_sold_out).length },
              { id: 'soldout', icon: <AlertCircle size={18} />, label: 'Sold Out', count: products.filter(p => p && p.is_sold_out).length },
              { id: 'add', icon: <Plus size={18} />, label: 'Add Product', special: true },
              { id: 'subcategories', icon: <Box size={18} />, label: 'Subcategories' },
              { id: 'settings', icon: <Settings size={18} />, label: 'System Settings' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsMobileMenuOpen(false);
                  if (tab.id === 'settings' || tab.id === 'subcategories') {
                    fetchSiteSettings();
                    if (tab.id === 'settings') fetchPendingCodes();
                  }
                }}
                className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl text-[11px] font-bold tracking-wider transition-all duration-300 ${tab.special && activeTab !== tab.id ? 'border-2 border-dashed border-[#ce112d]/40 text-[#ce112d] hover:bg-[#ce112d]/10 hover:border-[#ce112d]' : activeTab === tab.id ? 'bg-gradient-to-r from-[#ce112d] to-[#ff1c3a] text-white shadow-xl shadow-red-900/30 ring-1 ring-white/10' : 'hover:bg-white/[0.03] text-zinc-400 hover:text-zinc-200'}`}
              >
                <div className={`${activeTab === tab.id ? 'text-white' : 'text-zinc-500 group-hover:text-white'}`}>{tab.icon}</div>
                <span className="font-semibold text-xs tracking-normal">{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`ml-auto text-[10px] min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5 font-bold ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-zinc-900 text-zinc-400'}`}>{tab.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto border-t border-white/5 pt-6 space-y-2">
          <button
            onClick={() => {
              fetchProducts();
              fetchOrders();
              fetchReviews();
            }}
            disabled={loading}
            className="w-full flex items-center gap-3 p-4 text-zinc-400 hover:text-white transition-all rounded-2xl hover:bg-white/5 text-xs font-semibold"
          >
            <RotateCcw size={16} className={loading ? "animate-spin" : ""} /> {loading ? "Refreshing..." : "Refresh Data"}
          </button>

          <button
            onClick={() => {
              bigBazarApi.auth.signOut();
              setIsMobileMenuOpen(false);
            }}
            className="w-full flex items-center gap-3 p-4 text-zinc-400 hover:text-red-400 transition-all rounded-2xl hover:bg-white/5 text-xs font-semibold"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-12 overflow-y-auto no-scrollbar bg-[#0a0a0c]">
        {activeTab === 'reports' ? (
          <AdminReports orders={orders} products={products} reviews={reviews} />
        ) : activeTab === 'conversations' ? (
          <AdminConversations />
        ) : activeTab === 'users' ? (
          <AdminUsers />
        ) : activeTab === 'subcategories' ? (
          /* ═══ SUBCATEGORY MANAGER ═══ */
          <div className="max-w-4xl space-y-8 pb-20">
            <div>
              <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white">Subcategory <span className="text-[#ce112d]">Manager</span></h2>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.3em] mt-1">Manage subcategories with photos for each category</p>
            </div>

            {/* Category Selector */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TOP_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSubcatCategory(cat.id)}
                  className={`py-3 px-4 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all border-2 active:scale-95 ${
                    subcatCategory === cat.id
                      ? 'bg-[#ce112d] border-[#ce112d] text-white shadow-lg shadow-red-900/30'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  {cat.en}
                </button>
              ))}
            </div>

            {/* Current Subcategories List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase text-zinc-300 tracking-wider">
                  {subcatCategory} Subcategories ({getSubcategoriesForCategory(subcatCategory, subcategoriesData).length})
                </h3>
              </div>

              {getSubcategoriesForCategory(subcatCategory, subcategoriesData).map((sub, idx) => (
                <div key={sub.id} className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/10 rounded-2xl hover:border-white/15 transition-all">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 border border-white/10 shrink-0 flex items-center justify-center">
                    {sub.image_url ? (
                      <img src={sub.image_url} alt={sub.name_en} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-black text-zinc-500">{(sub.name_en || '?')[0]}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{sub.name_en}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{sub.name_bn}</p>
                  </div>
                  <span className="text-[10px] font-bold text-zinc-600 uppercase">#{sub.sort_order || idx}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubcat(sub.id);
                      setSubcatForm({ id: sub.id, name_en: sub.name_en || '', name_bn: sub.name_bn || '', image_url: sub.image_url || '', sort_order: sub.sort_order || idx });
                    }}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const merged = mergeWithDynamic(subcategoriesData);
                      const updated = { ...merged };
                      updated[subcatCategory] = (updated[subcatCategory] || []).filter(s => s.id !== sub.id);
                      await bigBazarApi.from('site_settings').upsert({ key: 'subcategories', value: updated });
                      setSubcategoriesData(updated);
                      setAlertModal({ isOpen: true, title: 'Deleted', message: 'Subcategory deleted successfully.', type: 'success' });
                    }}
                    className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {getSubcategoriesForCategory(subcatCategory, subcategoriesData).length === 0 && (
                <div className="text-center py-10 text-zinc-600">
                  <Box size={32} className="mx-auto mb-3 text-zinc-700" />
                  <p className="text-xs font-bold uppercase tracking-wider">No subcategories yet for {subcatCategory}</p>
                </div>
              )}
            </div>

            {/* Add/Edit Subcategory Form */}
            <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-5">
              <h3 className="text-sm font-black uppercase text-[#ce112d] tracking-wider">
                {editingSubcat ? 'Edit Subcategory' : 'Add New Subcategory'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-1.5">English Name</label>
                  <input
                    type="text"
                    value={subcatForm.name_en}
                    onChange={e => setSubcatForm(p => ({ ...p, name_en: e.target.value }))}
                    placeholder="e.g. Sari"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#ce112d]/50 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-1.5">Bengali Name</label>
                  <input
                    type="text"
                    value={subcatForm.name_bn}
                    onChange={e => setSubcatForm(p => ({ ...p, name_bn: e.target.value }))}
                    placeholder="e.g. শাড়ি"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#ce112d]/50 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-1.5">Photo URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={subcatForm.image_url}
                      onChange={e => setSubcatForm(p => ({ ...p, image_url: e.target.value }))}
                      placeholder="https://... or upload"
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#ce112d]/50 transition-all"
                    />
                    <label className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex items-center gap-2">
                      <Upload size={16} />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            setLoading(true);
                            const compressed = await compressImage(file, COMPRESS_PRESETS.thumbnail);
                            const { data, error } = await bigBazarApi.storage.from('products').upload(`subcategory-${Date.now()}.webp`, compressed);
                            if (error) {
                              setAlertModal({ isOpen: true, title: 'Upload Failed', message: error.message || 'Image upload failed', type: 'error' });
                              return;
                            }
                            if (data?.fullPath) setSubcatForm(p => ({ ...p, image_url: data.fullPath }));
                            else if (data?.path) {
                              const { data: urlData } = bigBazarApi.storage.from('products').getPublicUrl(data.path);
                              setSubcatForm(p => ({ ...p, image_url: urlData.publicUrl }));
                            }
                            setAlertModal({ isOpen: true, title: 'Photo Uploaded', message: 'Subcategory photo uploaded successfully!', type: 'success' });
                          } catch (err) {
                            console.error('Upload error:', err);
                            setAlertModal({ isOpen: true, title: 'Upload Error', message: err.message || 'Could not process image', type: 'error' });
                          } finally {
                            setLoading(false);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>
                  {subcatForm.image_url && (
                    <div className="mt-2 w-10 h-10 rounded-full overflow-hidden border border-white/20">
                      <img src={subcatForm.image_url} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-1.5">Sort Order</label>
                  <input
                    type="number"
                    value={subcatForm.sort_order}
                    onChange={e => setSubcatForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#ce112d]/50 transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!subcatForm.name_en.trim()) return;
                    const merged = mergeWithDynamic(subcategoriesData);
                    const updated = { ...merged };
                    const catSubs = [...(updated[subcatCategory] || [])];

                    const subObj = {
                      id: editingSubcat || subcatForm.name_en.trim().replace(/[\s/]+/g, '-'),
                      name_en: subcatForm.name_en.trim(),
                      name_bn: subcatForm.name_bn.trim(),
                      image_url: subcatForm.image_url.trim(),
                      sort_order: subcatForm.sort_order,
                    };

                    if (editingSubcat) {
                      const idx = catSubs.findIndex(s => s.id === editingSubcat);
                      if (idx >= 0) catSubs[idx] = subObj;
                      else catSubs.push(subObj);
                    } else {
                      if (catSubs.some(s => s.id === subObj.id)) {
                        setAlertModal({ isOpen: true, title: 'Duplicate', message: `A subcategory with ID "${subObj.id}" already exists.`, type: 'error' });
                        return;
                      }
                      catSubs.push(subObj);
                    }

                    catSubs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                    updated[subcatCategory] = catSubs;

                    await bigBazarApi.from('site_settings').upsert({ key: 'subcategories', value: updated });
                    setSubcategoriesData(updated);
                    setEditingSubcat(null);
                    setSubcatForm({ id: '', name_en: '', name_bn: '', image_url: '', sort_order: catSubs.length });
                    setAlertModal({ isOpen: true, title: 'Saved!', message: 'Subcategory saved successfully.', type: 'success' });
                  }}
                  className="px-8 py-3.5 bg-[#ce112d] hover:bg-[#b00e26] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-lg shadow-red-900/30 flex items-center gap-2"
                >
                  <Save size={16} />
                  {editingSubcat ? 'Save & Update Subcategory' : 'Save & Add Subcategory'}
                </button>
                {editingSubcat && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSubcat(null);
                      setSubcatForm({ id: '', name_en: '', name_bn: '', image_url: '', sort_order: 0 });
                    }}
                    className="px-6 py-3.5 bg-white/5 border border-white/10 text-zinc-400 text-xs font-black uppercase tracking-wider rounded-xl transition-all hover:bg-white/10"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : activeTab === 'settings' ? (
          <div className="max-w-4xl space-y-12 pb-20">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-4xl font-black italic uppercase tracking-tighter text-white">System <span className="text-[#ce112d]">Settings</span></h2>
                <p className="text-zinc-500 text-xs mt-2 font-bold uppercase tracking-widest">Global configuration &amp; site aesthetics</p>
              </div>
              <div className="flex gap-3">
                <button onClick={fetchSiteSettings} className="p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all text-zinc-400">
                  <RotateCcw size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-8 pt-12 border-t border-[#1d1d21]">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold italic uppercase tracking-tight text-white">Home Slider <span className="text-[#ce112d]">Engine</span></h3>
                  <p className="text-zinc-500 text-[10px] mt-2 font-black uppercase tracking-[0.2em]">Upload Canva-designed banners for Desktop &amp; Mobile — zero cut-off guaranteed</p>
                </div>
                <div className="px-4 py-2 bg-zinc-900 border border-white/5 rounded-full text-[10px] font-black text-white/40 uppercase">
                  {siteSettings.main_slides?.length || 0} Slides Active
                </div>
              </div>

              {/* Recommended Dimensions Guide */}
              <div className="bg-[#151518] border border-white/10 rounded-2xl p-4 text-xs space-y-3">
                <div className="flex items-center gap-2 text-white font-bold text-xs">
                  <Sparkles size={15} className="text-[#ce112d]" />
                  <span>Canva / Banner Dimension Standards (ক্যানভা ব্যানার সাইজ গাইড)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                  <div className="bg-black/50 border border-white/5 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-zinc-300 font-bold uppercase text-[10px]">
                      <Monitor size={14} className="text-[#ce112d]" />
                      <span>Desktop / Laptop</span>
                    </div>
                    <p className="text-white font-mono font-bold text-xs">1920 × 1080 px <span className="text-zinc-500 font-normal">(16:9 Full)</span></p>
                    <p className="text-white font-mono font-bold text-xs">1920 × 600 px <span className="text-zinc-500 font-normal">(Slim Banner)</span></p>
                    <p className="text-zinc-400 text-[10px] leading-tight">Best for wide PC &amp; laptop screens</p>
                  </div>
                  <div className="bg-black/50 border border-white/5 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-zinc-300 font-bold uppercase text-[10px]">
                      <Tablet size={14} className="text-[#ce112d]" />
                      <span>Tablet View</span>
                    </div>
                    <p className="text-white font-mono font-bold text-xs">1024 × 500 px <span className="text-zinc-500 font-normal">(~2:1 ratio)</span></p>
                    <p className="text-zinc-400 text-[10px] leading-tight">Perfect for iPad &amp; mid-size tablets</p>
                  </div>
                  <div className="bg-black/50 border border-white/5 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-zinc-300 font-bold uppercase text-[10px]">
                      <Smartphone size={14} className="text-[#ce112d]" />
                      <span>Mobile View</span>
                    </div>
                    <p className="text-white font-mono font-bold text-xs">768 × 1024 px <span className="text-zinc-500 font-normal">(Vertical / 3:4)</span></p>
                    <p className="text-white font-mono font-bold text-xs">600 × 600 px / 420 × 400 px</p>
                    <p className="text-zinc-400 text-[10px] leading-tight">Attach mobile banner to slide for pixel-perfect display</p>
                  </div>
                </div>
              </div>

              {/* Slider Ratio Mode Setting */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#121215] border border-white/10 rounded-2xl">
                <div>
                  <span className="text-xs font-bold text-white uppercase tracking-wider block">Slider Display Ratio Mode</span>
                  <span className="text-[11px] text-zinc-400">Controls how banner aspect ratio behaves across screens</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { id: 'auto', label: 'Auto / Smart Adaptive', desc: 'Preserves exact banner proportions without crop' },
                    { id: 'slim', label: '1920 × 600 (Slim)', desc: 'Slim banner mode' },
                    { id: 'fullscreen', label: '1920 × 1080 (16:9)', desc: '16:9 Fullscreen' },
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSiteSettings({ ...siteSettings, slider_aspect: m.id })}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        (siteSettings.slider_aspect || 'auto') === m.id
                          ? 'bg-[#ce112d] text-white shadow-lg shadow-red-900/30'
                          : 'bg-black/40 text-zinc-400 hover:text-white border border-white/5'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {siteSettings.main_slides?.map((slide, i) => (
                  <div key={slide.id || i} className="bg-[#121215] border border-[#1d1d21] rounded-[24px] overflow-hidden shadow-2xl group relative">
                    {/* Desktop Banner Display */}
                    <div className="relative aspect-[16/9] bg-black">
                      <img src={slide.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-transparent opacity-60" />
                      <button
                        type="button"
                        onClick={() => setSiteSettings({ ...siteSettings, main_slides: siteSettings.main_slides.filter((_, idx) => idx !== i) })}
                        className="absolute top-4 right-4 p-3 bg-black/60 text-white rounded-2xl hover:bg-[#ce112d] transition-all shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                        title="Delete Entire Slide"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="absolute top-4 left-4 flex items-center gap-2">
                        <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] font-black text-white uppercase border border-white/10 italic">
                          SLIDE {i + 1}
                        </span>
                        <span className="px-2 py-1 bg-[#ce112d]/80 backdrop-blur-md rounded-lg text-[9px] font-bold text-white uppercase flex items-center gap-1">
                          <Monitor size={11} /> Desktop
                        </span>
                      </div>
                      {slide.width && slide.height && (
                        <div className="absolute bottom-4 right-4 px-2 py-0.5 bg-black/70 backdrop-blur-md rounded text-[9px] font-mono text-zinc-400">
                          {slide.width} × {slide.height}
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-3">
                      {/* Mobile Banner Upload/Preview Section */}
                      <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-zinc-300 font-bold uppercase text-[10px]">
                            <Smartphone size={13} className="text-[#ce112d]" />
                            <span>Mobile Banner (768×1024 / 600×600 / 420×400)</span>
                          </div>
                          {slide.mobile_image && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...siteSettings.main_slides];
                                delete updated[i].mobile_image;
                                delete updated[i].mobile_aspect_ratio;
                                delete updated[i].mobile_width;
                                delete updated[i].mobile_height;
                                setSiteSettings({ ...siteSettings, main_slides: updated });
                              }}
                              className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase"
                            >
                              Remove Mobile
                            </button>
                          )}
                        </div>

                        {slide.mobile_image ? (
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-lg overflow-hidden border border-white/10 bg-black shrink-0 relative">
                              <img src={slide.mobile_image} className="w-full h-full object-cover" alt="Mobile Banner" />
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              <span className="text-emerald-400 font-bold block">✓ Mobile Version Active</span>
                              {slide.mobile_width && slide.mobile_height ? (
                                <span className="font-mono text-zinc-500">{slide.mobile_width} × {slide.mobile_height} px</span>
                              ) : (
                                <span>Shown automatically on phone screens</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed border-white/15 hover:border-[#ce112d]/40 bg-black/30 hover:bg-[#ce112d]/5 cursor-pointer transition-all">
                            <Smartphone size={13} className="text-[#ce112d]" />
                            <span className="text-[10px] font-bold text-zinc-400 hover:text-white uppercase">+ Upload Mobile Banner</span>
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              disabled={loading}
                              onChange={e => handleMobileSlideUpload(e, i)}
                            />
                          </label>
                        )}
                      </div>

                      <div>
                        <label className="text-[9px] font-black uppercase text-zinc-500 tracking-wider mb-1.5 block">
                          Destination Link <span className="text-zinc-700 normal-case font-normal">(where clicking the banner goes)</span>
                        </label>
                        <input
                          value={slide.button_link || slide.product_id || ''}
                          placeholder="https://... or /products?category=... or product ID"
                          onChange={e => {
                            const updated = [...siteSettings.main_slides];
                            updated[i] = { ...slide, button_link: e.target.value, product_id: e.target.value };
                            setSiteSettings({ ...siteSettings, main_slides: updated });
                          }}
                          className="w-full bg-black/60 border border-white/10 h-10 px-3 rounded-xl text-xs text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-[#ce112d]/50 transition-all font-mono"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-white/5">
                        <span className="text-[9px] font-black uppercase text-zinc-600">Image Fit</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...siteSettings.main_slides];
                            updated[i] = { ...slide, image_fit: slide.image_fit === 'contain' ? 'cover' : 'contain' };
                            setSiteSettings({ ...siteSettings, main_slides: updated });
                          }}
                          className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${slide.image_fit === 'contain'
                            ? 'bg-zinc-800 border-white/20 text-white'
                            : 'bg-[#ce112d]/20 border-[#ce112d]/40 text-[#ce112d]'
                          }`}
                        >
                          {slide.image_fit === 'contain' ? 'Contain' : 'Cover (Fill)'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <label className={`flex flex-col items-center justify-center gap-4 aspect-[16/9] rounded-[24px] border-2 border-dashed transition-all text-zinc-600 group ${loading && uploadStatus !== 'idle'
                    ? 'border-[#ce112d]/50 bg-[#ce112d]/5 cursor-not-allowed'
                    : 'border-[#1d1d21] cursor-pointer bg-[#121215]/30 hover:bg-[#121215]/50 hover:border-[#ce112d]/30 hover:text-white'
                  }`}>
                  <div className="w-16 h-16 rounded-full bg-[#121215] flex items-center justify-center border border-white/5 shadow-2xl group-hover:scale-110 transition-transform">
                    {loading && uploadStatus !== 'idle'
                      ? <div className="w-7 h-7 border-[3px] border-[#ce112d]/30 border-t-[#ce112d] rounded-full animate-spin" />
                      : <Plus size={24} className="text-[#ce112d]" />}
                  </div>
                  <div className="text-center">
                    {loading && uploadStatus !== 'idle' ? (
                      <>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ce112d] animate-pulse">
                          {uploadStatus === 'compressing' ? 'Compressing...' : `Uploading ${uploadProgress.current}/${uploadProgress.total}`}
                        </span>
                        <p className="text-[9px] text-zinc-700 mt-1 uppercase font-bold">Please wait, do not close</p>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Upload Desktop Slides</span>
                        <p className="text-[9px] text-zinc-500 mt-1 font-bold">1920×1080 or 1920×600</p>
                      </>
                    )}
                  </div>
                  <input type="file" className="hidden" accept="image/*" multiple disabled={loading} onChange={e => handleFileUpload(e, 'slider')} />
                </label>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    await bigBazarApi.from('site_settings').upsert({ key: 'slider_aspect', value: siteSettings.slider_aspect || 'auto' }, { onConflict: 'key' });
                    const { error } = await bigBazarApi.from('site_settings').upsert({ key: 'main_slides', value: siteSettings.main_slides }, { onConflict: 'key' });
                    if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
                    else setAlertModal({ isOpen: true, title: 'Live!', message: "Slider Engine & Display Settings Updated Successfully.", type: 'success' });
                    setLoading(false);
                  }}
                  className="flex items-center gap-3 bg-[#ce112d] px-12 h-16 rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl shadow-red-900/40 active:scale-95 transition-all disabled:opacity-50 text-white relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {loading ? <RotateCcw size={18} className="animate-spin" /> : <Save size={18} />}
                  <span>{loading ? 'Processing...' : 'Deploy Slider'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-8 pt-12 border-t border-white/5">
              <div>
                <h3 className="text-xl font-bold uppercase tracking-tight text-white">Announcement <span className="text-[#ce112d]">Banner</span></h3>
                <p className="text-zinc-500 text-[11px] mt-2 uppercase font-bold tracking-widest">Manage the notification banner on home page (বিজ্ঞপ্তির ব্যানার পরিবর্তন করুন)</p>
              </div>

              <div className="bg-zinc-900/50 p-6 rounded-3xl border border-white/5 space-y-8">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${siteSettings.announcement?.enabled ? 'bg-[#ce112d] text-white shadow-lg shadow-red-500/20' : 'bg-zinc-800 text-zinc-600'}`}>
                      <MessageSquare size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Show Announcement</p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Toggle visibility on home page</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSiteSettings({
                      ...siteSettings,
                      announcement: { ...siteSettings.announcement, enabled: !siteSettings.announcement?.enabled }
                    })}
                    className={`w-14 h-8 rounded-full p-1 transition-all duration-300 ${siteSettings.announcement?.enabled ? 'bg-[#ce112d]' : 'bg-zinc-800'}`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full shadow-lg transition-transform duration-300 ${siteSettings.announcement?.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Bangla Content */}
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-zinc-600 tracking-[0.2em] px-1 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#ce112d]" /> Bangla Content (বাংলা ভাষা)
                  </label>
                  <input
                    value={siteSettings.announcement?.title_bn || ''}
                    placeholder="বিজ্ঞপ্তির শিরোনাম (যেমন: গুরুত্বপূর্ণ বিজ্ঞপ্তি)"
                    onChange={e => setSiteSettings({
                      ...siteSettings,
                      announcement: { ...siteSettings.announcement, title_bn: e.target.value }
                    })}
                    className="w-full bg-black/40 border border-white/5 h-12 px-4 rounded-xl text-sm font-bold text-white placeholder:text-zinc-700 outline-none focus:border-[#ce112d]/50 transition-all"
                  />
                  <textarea
                    value={siteSettings.announcement?.message_bn || ''}
                    placeholder="বিজ্ঞপ্তির বিস্তারিত বার্তা"
                    rows={4}
                    onChange={e => setSiteSettings({
                      ...siteSettings,
                      announcement: { ...siteSettings.announcement, message_bn: e.target.value }
                    })}
                    className="w-full bg-black/40 border border-white/5 p-4 rounded-xl text-sm font-medium text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-[#ce112d]/50 transition-all resize-none"
                  />
                  <input
                    value={siteSettings.announcement?.footer_bn || ''}
                    placeholder="নিচের ছোট বার্তা (যেমন: Website থেকে অর্ডার করুন)"
                    onChange={e => setSiteSettings({
                      ...siteSettings,
                      announcement: { ...siteSettings.announcement, footer_bn: e.target.value }
                    })}
                    className="w-full bg-black/40 border border-white/5 h-12 px-4 rounded-xl text-sm font-bold text-zinc-400 placeholder:text-zinc-700 outline-none focus:border-white/10 transition-all"
                  />
                </div>

                {/* English Content */}
                <div className="space-y-4 pt-4 border-t border-white/5">
                  <label className="text-[10px] font-black uppercase text-zinc-600 tracking-[0.2em] px-1 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> English Content
                  </label>
                  <input
                    value={siteSettings.announcement?.title_en || ''}
                    placeholder="Announcement Title (e.g., Important Notice)"
                    onChange={e => setSiteSettings({
                      ...siteSettings,
                      announcement: { ...siteSettings.announcement, title_en: e.target.value }
                    })}
                    className="w-full bg-black/40 border border-white/5 h-12 px-4 rounded-xl text-sm font-bold text-white placeholder:text-zinc-700 outline-none focus:border-[#ce112d]/50 transition-all"
                  />
                  <textarea
                    value={siteSettings.announcement?.message_en || ''}
                    placeholder="Announcement detailed message"
                    rows={4}
                    onChange={e => setSiteSettings({
                      ...siteSettings,
                      announcement: { ...siteSettings.announcement, message_en: e.target.value }
                    })}
                    className="w-full bg-black/40 border border-white/5 p-4 rounded-xl text-sm font-medium text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-[#ce112d]/50 transition-all resize-none"
                  />
                  <input
                    value={siteSettings.announcement?.footer_en || ''}
                    placeholder="Footer small message (e.g., Order from Website)"
                    onChange={e => setSiteSettings({
                      ...siteSettings,
                      announcement: { ...siteSettings.announcement, footer_en: e.target.value }
                    })}
                    className="w-full bg-black/40 border border-white/5 h-12 px-4 rounded-xl text-sm font-bold text-zinc-400 placeholder:text-zinc-700 outline-none focus:border-white/10 transition-all"
                  />
                </div>
              </div>

              <div className="flex pt-4">
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    const { error } = await bigBazarApi.from('site_settings').upsert({ key: 'announcement', value: siteSettings.announcement }, { onConflict: 'key' });
                    if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
                    else setAlertModal({ isOpen: true, title: 'Success', message: "Announcement Updated Successfully!", type: 'success' });
                    setLoading(false);
                  }}
                  className="flex items-center gap-2 bg-[#ce112d] px-10 h-14 rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-red-900/30 active:scale-95 transition-all disabled:opacity-50 text-white"
                >
                  {loading ? <RotateCcw size={18} className="animate-spin" /> : <Save size={18} />}
                  <span>{loading ? 'Saving...' : 'Save Announcement'}</span>
                </button>
              </div>
            </div>

            {/* Moving Text Announcement Ticker Section */}
            <div className="space-y-8 pt-12 border-t border-white/5">
              <div>
                <h3 className="text-xl font-bold uppercase tracking-tight text-white">
                  Scrolling Announcement <span className="text-[#ce112d]">Ticker</span>
                </h3>
                <p className="text-zinc-500 text-[11px] mt-2 uppercase font-bold tracking-widest">
                  Create a minimal moving text strip (e.g. Free Delivery for Mirsharai, 10% OFF, etc.)
                </p>
              </div>

              <div className="bg-zinc-900/50 p-6 rounded-3xl border border-white/5 space-y-8">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${siteSettings.ticker_announcement?.enabled ? 'bg-[#ce112d] text-white shadow-lg shadow-red-500/20' : 'bg-zinc-800 text-zinc-600'}`}>
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white uppercase tracking-wider">Enable Moving Ticker</p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Show left-to-right animated text strip</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSiteSettings({
                      ...siteSettings,
                      ticker_announcement: { 
                        ...siteSettings.ticker_announcement, 
                        enabled: !siteSettings.ticker_announcement?.enabled 
                      }
                    })}
                    className={`w-14 h-8 rounded-full p-1 transition-all duration-300 ${siteSettings.ticker_announcement?.enabled ? 'bg-[#ce112d]' : 'bg-zinc-800'}`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full shadow-lg transition-transform duration-300 ${siteSettings.ticker_announcement?.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Text Content Input */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] px-1 block">
                    Announcement Text (বিজ্ঞপ্তির লেখা)
                  </label>
                  <input
                    value={siteSettings.ticker_announcement?.text || ''}
                    placeholder="Enter your announcement (e.g. Free Delivery for Mirsharai on orders over 1000 BDT! | 10% OFF on Eid Collection)"
                    onChange={e => setSiteSettings({
                      ...siteSettings,
                      ticker_announcement: { ...siteSettings.ticker_announcement, text: e.target.value }
                    })}
                    className="w-full bg-black/40 border border-white/5 h-14 px-4 rounded-xl text-sm font-bold text-white placeholder:text-zinc-700 outline-none focus:border-[#ce112d]/50 transition-all"
                  />
                  <p className="text-[10px] text-zinc-500 italic px-1">
                    * Leave empty or disable toggle to hide the ticker from the website.
                  </p>
                </div>

                {/* Display Position Selector */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] px-1 block">
                    Display Position (প্রদর্শনের স্থান)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { id: 'top_navbar', label: 'Top of Page (On Navbar)', desc: 'Sticks above the site header across all pages' },
                      { id: 'bottom_slider', label: 'Bottom of Hero Slider', desc: 'Displays right below main slider on home page' }
                    ].map(pos => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => setSiteSettings({
                          ...siteSettings,
                          ticker_announcement: { ...siteSettings.ticker_announcement, position: pos.id }
                        })}
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          (siteSettings.ticker_announcement?.position || 'top_navbar') === pos.id 
                            ? 'bg-[#ce112d]/10 border-[#ce112d] text-white' 
                            : 'bg-black/40 border-white/5 text-zinc-400 hover:border-white/10'
                        }`}
                      >
                        <p className="text-xs font-bold uppercase tracking-wider">{pos.label}</p>
                        <p className="text-[10px] opacity-60 mt-1">{pos.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color & Speed Customization */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                  {/* Background Color */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] block">
                      Background Theme Color
                    </label>
                    <div className="flex items-center gap-3">
                      {[
                        { color: '#ce112d', label: 'Red' },
                        { color: '#18181b', label: 'Dark' },
                        { color: '#059669', label: 'Green' },
                        { color: '#d97706', label: 'Gold' },
                        { color: '#4f46e5', label: 'Indigo' }
                      ].map(c => (
                        <button
                          key={c.color}
                          type="button"
                          onClick={() => setSiteSettings({
                            ...siteSettings,
                            ticker_announcement: { ...siteSettings.ticker_announcement, bg_color: c.color }
                          })}
                          className={`w-9 h-9 rounded-xl transition-transform ${
                            (siteSettings.ticker_announcement?.bg_color || '#ce112d') === c.color 
                              ? 'scale-110 ring-2 ring-white shadow-lg' 
                              : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c.color }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Speed */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-zinc-400 tracking-[0.2em] block">
                      Scroll Speed
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {[
                        { speed: 45, label: 'Normal (45s)' },
                        { speed: 65, label: 'Slow (65s)' },
                        { speed: 90, label: 'Very Slow (90s)' },
                        { speed: 120, label: 'Ultra Slow (120s)' }
                      ].map(s => (
                        <button
                          key={s.speed}
                          type="button"
                          onClick={() => setSiteSettings({
                            ...siteSettings,
                            ticker_announcement: { ...siteSettings.ticker_announcement, speed: s.speed }
                          })}
                          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                            (siteSettings.ticker_announcement?.speed || 65) === s.speed 
                              ? 'bg-white text-black border-white' 
                              : 'bg-black/40 text-zinc-400 border-white/5 hover:border-white/10'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex pt-4">
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    const { error } = await bigBazarApi.from('site_settings').upsert({ 
                      key: 'ticker_announcement', 
                      value: siteSettings.ticker_announcement 
                    }, { onConflict: 'key' });
                    if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
                    else setAlertModal({ isOpen: true, title: 'Success', message: "Ticker Announcement Saved Successfully!", type: 'success' });
                    setLoading(false);
                  }}
                  className="flex items-center gap-2 bg-[#ce112d] px-10 h-14 rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-red-900/30 active:scale-95 transition-all disabled:opacity-50 text-white"
                >
                  {loading ? <RotateCcw size={18} className="animate-spin" /> : <Save size={18} />}
                  <span>{loading ? 'Saving...' : 'Save Ticker Announcement'}</span>
                </button>
              </div>
            </div>

            {/* Wedding Banner Section */}
            <div className="space-y-6 pt-12 border-t border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold italic uppercase tracking-tight text-white">Wedding <span className="text-[#ce112d]">Banner</span></h3>
                  <p className="text-zinc-500 text-[10px] mt-1 font-black uppercase tracking-[0.2em]">Homepage promotional banner — image, text & category filter</p>
                </div>
                {/* Enable / Disable Toggle */}
                <button
                  type="button"
                  onClick={() => setSiteSettings(prev => ({
                    ...prev,
                    wedding_banner: { ...prev.wedding_banner, enabled: !prev.wedding_banner?.enabled }
                  }))}
                  className="flex items-center gap-3"
                >
                  <div className={`w-14 h-8 rounded-full p-1 transition-all duration-300 ${siteSettings.wedding_banner?.enabled ? 'bg-[#ce112d]' : 'bg-zinc-800'}`}>
                    <div className={`w-6 h-6 bg-white rounded-full shadow-lg transition-transform duration-300 ${siteSettings.wedding_banner?.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-widest text-zinc-400">
                    {siteSettings.wedding_banner?.enabled ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              <div className="bg-zinc-900 border border-white/5 rounded-2xl md:rounded-3xl p-5 md:p-8 space-y-6">

                {/* Poster Image */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest block">Poster Image</label>
                  {siteSettings.wedding_banner?.image_url ? (
                    <div className="relative w-full aspect-[16/5] rounded-xl overflow-hidden group">
                      <img src={siteSettings.wedding_banner.image_url} alt="Wedding Banner" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-3">
                        <label className="px-4 py-2 bg-white text-zinc-900 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-zinc-100 transition-all">
                          Replace
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0]; if (!file) return;
                            setLoading(true);
                            try {
                              const compressed = await compressImage(file, COMPRESS_PRESETS.banner);
                              const url = await uploadSingleFile(compressed);
                              if (url) {
                                setSiteSettings(prev => ({ ...prev, wedding_banner: { ...prev.wedding_banner, image_url: url } }));
                                setAlertModal({ isOpen: true, title: 'Banner Uploaded', message: 'Wedding banner uploaded successfully!', type: 'success' });
                              } else {
                                setAlertModal({ isOpen: true, title: 'Upload Failed', message: 'Could not upload banner. Please try again.', type: 'error' });
                              }
                            } catch (err) {
                              setAlertModal({ isOpen: true, title: 'Upload Error', message: err.message || 'Failed to process image.', type: 'error' });
                            } finally {
                              setLoading(false);
                              e.target.value = '';
                            }
                          }} />
                        </label>
                        <button type="button" onClick={() => setSiteSettings(prev => ({ ...prev, wedding_banner: { ...prev.wedding_banner, image_url: '' } }))}
                          className="px-4 py-2 bg-[#ce112d] text-white rounded-xl text-[10px] font-black uppercase tracking-widest">
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full aspect-[16/5] rounded-xl border-2 border-dashed border-zinc-700 hover:border-[#ce112d]/60 cursor-pointer transition-all group bg-zinc-950/50">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center text-[#ce112d] group-hover:scale-110 transition-transform mb-3">
                        <Plus size={22} strokeWidth={2.5} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Upload Poster Image</span>
                      <span className="text-[9px] text-zinc-700 mt-1">Recommended: 1920×600px, landscape</span>
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        setLoading(true);
                        try {
                          const compressed = await compressImage(file, COMPRESS_PRESETS.banner);
                          const url = await uploadSingleFile(compressed);
                          if (url) {
                            setSiteSettings(prev => ({ ...prev, wedding_banner: { ...prev.wedding_banner, image_url: url } }));
                            setAlertModal({ isOpen: true, title: 'Banner Uploaded', message: 'Wedding banner uploaded successfully!', type: 'success' });
                          } else {
                            setAlertModal({ isOpen: true, title: 'Upload Failed', message: 'Could not upload banner. Please try again.', type: 'error' });
                          }
                        } catch (err) {
                          setAlertModal({ isOpen: true, title: 'Upload Error', message: err.message || 'Failed to process image.', type: 'error' });
                        } finally {
                          setLoading(false);
                          e.target.value = '';
                        }
                      }} />
                    </label>
                  )}
                </div>



                {/* Category Filter */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-zinc-500 tracking-widest block">Category Filter Keyword</label>
                  <p className="text-[9px] text-zinc-600">Products page will filter by this category name when banner is clicked</p>
                  <input
                    type="text"
                    value={siteSettings.wedding_banner?.category_filter || ''}
                    onChange={e => setSiteSettings(prev => ({ ...prev, wedding_banner: { ...prev.wedding_banner, category_filter: e.target.value } }))}
                    className="w-full bg-black/50 border border-zinc-800 focus:border-[#ce112d]/40 text-white text-sm font-bold px-4 h-11 rounded-xl outline-none transition-all"
                    placeholder="e.g. Wedding"
                  />
                </div>

                {/* Save Button */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    const { error } = await bigBazarApi.from('site_settings').upsert({ key: 'wedding_banner', value: siteSettings.wedding_banner }, { onConflict: 'key' });
                    if (error) setAlertModal({ isOpen: true, title: 'Error', message: error.message, type: 'error' });
                    else setAlertModal({ isOpen: true, title: 'Saved!', message: 'Wedding banner settings updated.', type: 'success' });
                    setLoading(false);
                  }}
                  className="flex items-center gap-2 bg-[#ce112d] px-10 h-14 rounded-2xl font-bold uppercase tracking-widest shadow-xl shadow-red-900/30 active:scale-95 transition-all disabled:opacity-50 text-white"
                >
                  {loading ? <RotateCcw size={18} className="animate-spin" /> : <Save size={18} />}
                  <span>{loading ? 'Saving...' : 'Save Wedding Banner'}</span>
                </button>
              </div>
            </div>

            {/* Security — Pending Admin Login Codes */}
            <div className="space-y-6 pt-12 border-t border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold italic uppercase tracking-tight text-white">Security <span className="text-[#ce112d]">Codes</span></h3>
                  <p className="text-zinc-500 text-xs mt-1 font-medium">Active 2FA codes for pending admin logins (expire in 5 min)</p>
                </div>
                <button
                  onClick={fetchPendingCodes}
                  className="flex items-center gap-2 px-4 h-10 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold uppercase tracking-widest hover:bg-zinc-700 transition-all"
                >
                  <RotateCcw size={14} /> Refresh
                </button>
              </div>

              {pendingCodes.length === 0 ? (
                <div className="bg-zinc-900 border border-white/5 rounded-2xl p-8 text-center">
                  <ShieldCheck size={32} className="text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-600 text-sm font-bold">No pending login attempts</p>
                  <p className="text-zinc-700 text-xs mt-1">Codes appear here when someone tries to log in</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingCodes.map(entry => (
                    <div key={entry.login_id} className="bg-zinc-900 border border-[#ce112d]/20 rounded-2xl p-5 flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{entry.email}</p>
                        <p className="text-xs text-zinc-600">Expires in {entry.expires_in}s</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-4xl font-black tracking-[0.25em] text-[#ce112d] font-mono">{entry.code}</div>
                        <button
                          onClick={() => { navigator.clipboard.writeText(entry.code); }}
                          className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition-all"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : activeTab === 'add' ? (
          <form onSubmit={handleProductSubmit} className="max-w-5xl space-y-6 md:space-y-12 pb-24 mx-auto">
            {/* Form Header */}
            <div className="bg-zinc-900/80 p-6 md:p-8 rounded-2xl border border-white/5 backdrop-blur-xl sticky top-0 lg:top-0 z-30 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl md:text-3xl font-black uppercase tracking-tight text-white line-clamp-1">
                    {editingProduct ? 'Update' : 'Add'} <span className="text-[#ce112d]">Product</span>
                  </h2>
                  <p className="text-xs font-semibold text-zinc-400 mt-1">
                    Photo required · Instagram URL = video only
                  </p>
                </div>
                <button type="button" onClick={cancelEdit} className="p-3 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all" title="Cancel">
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Contextual In-Page Alert */}
            {formAlert && (
              <div className={`p-5 rounded-2xl border flex items-center justify-between gap-4 transition-all shadow-2xl ${formAlert.type === 'error'
                  ? 'bg-[#ce112d]/15 border-[#ce112d]/40 text-red-200'
                  : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${formAlert.type === 'error' ? 'bg-[#ce112d] text-white' : 'bg-emerald-500 text-black'
                    }`}>
                    {formAlert.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider">{formAlert.title}</h4>
                    <p className="text-xs font-medium text-zinc-300 mt-1">{formAlert.message}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setFormAlert(null)} className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-all">
                  <X size={18} />
                </button>
              </div>
            )}

            {/* IDENTITY & PRICING */}
            <div className="space-y-10">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                {/* Left Column: Basic Info */}
                <div className="lg:col-span-12 space-y-8">
                  <div className="bg-zinc-900 border border-white/5 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6 md:space-y-8">
                    <div className="space-y-6">
                      <div className="group">
                        <div className="flex items-center justify-between mb-3 px-1">
                          <label className="text-[10px] font-black uppercase text-zinc-500 block tracking-[0.2em] group-focus-within:text-[#ce112d] transition-colors">Product Name</label>
                          {form.subcategory && (
                            <button
                              type="button"
                              onClick={() => {
                                const subName = form.subcategory.split('/')[0].trim();
                                if (!form.name.toLowerCase().includes(subName.toLowerCase())) {
                                  setForm(prev => ({ ...prev, name: `${subName} ${prev.name}`.trim() }));
                                }
                              }}
                              className="text-[10px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded-lg border border-rose-500/30 transition-all flex items-center gap-1.5"
                            >
                              <span>Prefix subcategory "{form.subcategory.split('/')[0]}"</span>
                            </button>
                          )}
                        </div>
                        <input
                          value={form.name}
                          placeholder="e.g. Premium Mirror Work Panjabi 2024"
                          className="w-full bg-black/40 border-2 border-zinc-800 p-4 md:p-5 h-12 md:h-16 rounded-2xl md:rounded-3xl text-sm md:text-base font-black focus:border-[#ce112d] outline-none transition-all placeholder:text-zinc-800 text-white shadow-inner uppercase italic"
                          onChange={e => setForm({ ...form, name: e.target.value })}
                        />
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 pt-4">
                        <div className="group">
                          <label className="text-[10px] font-black uppercase text-zinc-500 mb-2 md:mb-3 block tracking-[0.15em] md:tracking-[0.2em] px-1">Original Price</label>
                          <div className="relative">
                            <span className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 text-zinc-400 font-black text-base md:text-xl italic">৳</span>
                            <input
                              type="number"
                              value={form.original_price || ''}
                              placeholder="1850"
                              className="w-full bg-black/40 border-2 border-zinc-800 pl-7 md:pl-12 pr-2 md:pr-4 h-12 md:h-16 rounded-xl md:rounded-3xl text-base md:text-xl font-black focus:border-white/20 outline-none transition-all placeholder:text-zinc-800 text-zinc-400 italic"
                              onChange={e => setForm({ ...form, original_price: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="group">
                          <label className="text-[10px] font-black uppercase text-red-400 mb-2 md:mb-3 block tracking-[0.15em] md:tracking-[0.2em] px-1">Sale Price *</label>
                          <div className="relative">
                            <span className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 text-red-400 font-black text-base md:text-xl italic animate-pulse">৳</span>
                            <input
                              type="number"
                              required
                              value={form.price || ''}
                              placeholder="1450"
                              className="w-full bg-black/40 border-2 border-[#ce112d]/30 pl-7 md:pl-12 pr-2 md:pr-4 h-12 md:h-16 rounded-xl md:rounded-3xl text-lg md:text-2xl font-black focus:border-[#ce112d] outline-none transition-all placeholder:text-zinc-800 text-[#ce112d] italic shadow-[0_0_30px_rgba(206,17,45,0.1)]"
                              onChange={e => setForm({ ...form, price: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="group col-span-2 md:col-span-1">
                          <label className="text-[10px] font-black uppercase text-emerald-400 mb-2 md:mb-3 block tracking-[0.15em] md:tracking-[0.2em] px-1">Stock (স্টক)</label>
                          <div className="relative">
                            <input
                              type="number"
                              value={form.stock_count !== undefined && form.stock_count !== null ? form.stock_count : ''}
                              placeholder="e.g. 50"
                              className="w-full bg-black/40 border-2 border-emerald-500/30 px-3 md:px-6 h-12 md:h-16 rounded-xl md:rounded-3xl text-base md:text-xl font-black focus:border-emerald-400 outline-none transition-all placeholder:text-zinc-800 text-emerald-400 italic"
                              onChange={e => setForm({ ...form, stock_count: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 space-y-6">
                        {/* Top-Level Category Dropdown */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold uppercase text-zinc-400 block tracking-wider px-1">Top-Level Category (প্রধান ক্যাটাগরি)</label>
                            {form.category && (
                              <button
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, category: '', subcategory: '' }))}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                Clear Category
                              </button>
                            )}
                          </div>

                          {/* Category Dropdown */}
                          <div className="relative group">
                            <select
                              value={form.category || ''}
                              onChange={e => setForm(prev => ({ ...prev, category: e.target.value, subcategory: '' }))}
                              aria-label="Top-level product category"
                              className={`w-full bg-black/40 border-2 px-4 md:px-5 h-12 md:h-14 rounded-2xl text-xs md:text-sm font-black outline-none transition-all appearance-none cursor-pointer pr-10 text-white ${
                                form.category ? 'border-[#ce112d]/50 bg-[#ce112d]/5 focus:border-[#ce112d]' : 'border-zinc-800 hover:border-zinc-700 focus:border-[#ce112d]'
                              }`}
                            >
                              <option value="" className="bg-zinc-900 text-amber-400 font-bold">Uncategorized (ক্যাটাগরি নেই)</option>
                              {TOP_CATEGORIES.map(cat => (
                                <option key={cat.id} value={cat.id} className="bg-zinc-900 text-white">
                                  {cat.en} ({cat.bn})
                                </option>
                              ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-focus-within:text-[#ce112d] transition-colors" />
                          </div>
                        </div>

                        {/* Subcategory Dropdown */}
                        {form.category && (
                          <div className="pt-2 space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold uppercase text-rose-400 block tracking-wider px-1">Subcategory / Garment Type (সাব-ক্যাটাগরি / পোশাকের ধরন)</label>
                              {form.subcategory && (
                                <button
                                  type="button"
                                  onClick={() => setForm(prev => ({ ...prev, subcategory: '' }))}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-700 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  Clear Subcategory
                                </button>
                              )}
                            </div>

                            {/* Subcategory Dropdown */}
                            <div className="relative group">
                              <select
                                value={form.subcategory || ''}
                                onChange={e => setForm(prev => ({ ...prev, subcategory: e.target.value }))}
                                aria-label="Product subcategory"
                                className={`w-full bg-black/40 border-2 px-4 md:px-5 h-12 md:h-14 rounded-2xl text-xs md:text-sm font-black outline-none transition-all appearance-none cursor-pointer pr-10 text-white ${
                                  form.subcategory ? 'border-rose-500/50 bg-rose-500/5 focus:border-rose-500' : 'border-zinc-800 hover:border-zinc-700 focus:border-rose-500'
                                }`}
                              >
                                <option value="" className="bg-zinc-900 text-amber-400 font-bold">No Subcategory (সাব-ক্যাটাগরি নেই)</option>
                                {getSubcategoriesForCategory(form.category, subcategoriesData).map(sub => (
                                  <option key={sub.id} value={sub.id} className="bg-zinc-900 text-white">
                                    {sub.name_en || sub.en} ({sub.name_bn || sub.bn})
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-focus-within:text-rose-500 transition-colors" />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-6 group">
                        <label className="text-[10px] font-black uppercase text-zinc-500 mb-3 block tracking-[0.2em] px-1 group-focus-within:text-white transition-colors">Description</label>
                        <textarea
                          rows="6"
                          value={form.description}
                          placeholder="Crafted from premium fabrics. Elegant hand-stitch details. Perfect for festive celebrations..."
                          className="w-full bg-black/40 border-2 border-zinc-800 p-4 md:p-8 rounded-2xl md:rounded-[40px] text-sm md:text-base font-medium focus:border-white/20 outline-none transition-all placeholder:text-zinc-800 text-zinc-300 resize-none leading-relaxed italic"
                          onChange={e => setForm({ ...form, description: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* MEDIA & ASSETS */}
            <div className="space-y-6">
              <div className="bg-zinc-900 border border-white/5 rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-xl space-y-6 md:space-y-8">
                <div className="flex items-start gap-3 border-b border-white/5 pb-4">
                  <div className="w-1.5 h-8 bg-[#ce112d] rounded-full shrink-0" />
                  <div>
                    <h3 className="text-base md:text-lg font-black uppercase tracking-tight text-white">Photos & Video</h3>
                    <p className="text-[10px] font-bold text-zinc-500 mt-1">
                      Upload product photos for the catalog. Instagram link is optional — used only to play the reel/post as video.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="group">
                      <label className="text-xs font-bold uppercase text-zinc-400 mb-2 block tracking-wider px-1">
                        Instagram video URL <span className="text-xs text-zinc-400 normal-case tracking-normal font-normal">(optional · video only)</span>
                      </label>
                      <div className="relative">
                        <input
                          value={form.video_url}
                          onBlur={handleVideoBlur}
                          placeholder="https://www.instagram.com/reels/..."
                          className="w-full bg-black/40 border border-zinc-800 p-4 h-12 rounded-xl text-sm font-medium focus:border-[#ce112d]/50 outline-none transition-all placeholder:text-zinc-700 text-white pr-12"
                          onChange={e => setForm({ ...form, video_url: e.target.value })}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-zinc-500">
                          <Video size={16} />
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-2 px-1 leading-relaxed">
                        Does not download photos from Instagram. Paste a reel/post link to show the video on the product page.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase text-[#ce112d] mb-1 block tracking-[0.15em] px-1">
                        Main photo <span className="text-zinc-500">*</span>
                      </label>
                      <label className="flex items-center gap-4 w-full bg-black/40 border border-dashed border-zinc-700 p-4 rounded-xl cursor-pointer hover:bg-white/5 hover:border-[#ce112d]/50 transition-all group">
                        <div className="w-12 h-12 rounded-xl bg-[#ce112d] flex items-center justify-center text-white shadow-lg shadow-red-900/30 group-hover:scale-105 transition-transform shrink-0">
                          <Upload size={20} strokeWidth={2.5} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-white group-hover:text-[#ce112d] transition-colors">Upload product photo</span>
                          <span className="text-[10px] font-medium text-zinc-500 mt-0.5">Required · best 1080×1350</span>
                        </div>
                        <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'product')} />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-zinc-500 block tracking-[0.15em] px-1">Photo preview</label>
                    <div className="aspect-[4/5] w-full bg-[#0a0a0c] rounded-2xl border border-[#1d1d21] overflow-hidden relative ring-4 ring-black/20">
                      {(previewImage || form.image_url) ? (
                        <>
                          <img src={previewImage || form.image_url} className="w-full h-full object-cover object-top" alt="Preview" />
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewImage(null);
                              setForm(prev => ({
                                ...prev,
                                image_url: null,
                                images: (prev.images || []).filter((_, idx) => idx !== 0)
                              }));
                            }}
                            className="absolute top-3 right-3 p-2.5 bg-red-600/90 hover:bg-red-600 text-white rounded-xl shadow-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-zinc-700 bg-black/40 px-6 text-center">
                          <ImageIcon size={28} className="opacity-40" />
                          <p className="text-xs font-semibold text-zinc-400 tracking-normal">Upload a photo to preview</p>
                        </div>
                      )}
                    </div>

                    {form.video_url && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <label className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.15em]">Video preview</label>
                          <button
                            type="button"
                            onClick={() => setForm(prev => ({ ...prev, video_url: '', platform_id: prev.platform_id }))}
                            className="text-[10px] font-bold text-red-400 hover:underline"
                          >
                            Clear video
                          </button>
                        </div>
                        <div className="aspect-[4/5] w-full max-h-64 bg-black rounded-2xl border border-[#1d1d21] overflow-hidden relative">
                          <VideoPlayer src={form.video_url} priority={true} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5">
                  <div className="flex items-center justify-between mb-4 px-1">
                    <label className="text-[10px] font-black uppercase text-zinc-500 tracking-[0.15em]">More photos</label>
                    {loading && uploadStatus !== 'idle' && (
                      <div className="flex items-center gap-2 text-[10px] font-black text-[#ce112d] uppercase tracking-widest animate-pulse">
                        <div className="w-3 h-3 border-2 border-[#ce112d]/30 border-t-[#ce112d] rounded-full animate-spin" />
                        {uploadStatus === 'compressing'
                          ? 'Compressing...'
                          : `Uploading ${uploadProgress.current}/${uploadProgress.total}`}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                    {form.images?.map((img, i) => (
                      <div key={i} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-[#1d1d21] group bg-black">
                        <img
                          src={img}
                          onError={(e) => { e.target.src = 'https://placehold.co/400x500/0a0a0c/ce112d?text=Error'; }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          alt="Gallery"
                        />
                        <div className="absolute inset-x-1.5 bottom-1.5 bg-red-600 h-8 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer" onClick={() => {
                          const removedImg = form.images[i];
                          const updatedImages = form.images.filter((_, idx) => idx !== i);
                          const updatedColors = (form.available_colors || []).map(c =>
                            c.image === removedImg ? { ...c, image: null } : c
                          );
                          setForm({ ...form, images: updatedImages, available_colors: updatedColors });
                        }}>
                          <Trash2 size={14} className="text-white" />
                        </div>
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 rounded text-[8px] font-black text-white/60 uppercase">#{i + 1}</div>
                      </div>
                    ))}
                    <label className="aspect-[3/4] rounded-xl border border-dashed border-[#1d1d21] flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white/5 hover:border-[#ce112d]/40 transition-all group">
                      <Plus size={18} strokeWidth={2.5} className="text-[#ce112d]" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600">Add</span>
                      <input type="file" className="hidden" accept="image/*" multiple onChange={e => handleFileUpload(e, 'product')} />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* LOGISTICS & VARIANTS */}
            <div className="space-y-10">
              <div className="bg-zinc-900 border border-white/5 rounded-2xl p-6 md:p-8 shadow-2xl space-y-8">
                <div className="space-y-8">
                  <div className="border-b border-white/5 pb-6">
                    <h3 className="text-lg md:text-2xl font-black uppercase tracking-tight text-white italic">Sizes & Colors</h3>
                    <p className="text-xs font-semibold text-zinc-400 mt-1">Select available sizes, then add colors</p>
                  </div>

                  <div className="space-y-8">
                    {/* Manual Sizes Section */}
                    <div className="space-y-6 bg-black/20 p-4 md:p-8 rounded-2xl md:rounded-[32px] border border-white/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-[11px] font-black uppercase text-white tracking-[0.2em] block">Available Sizes (সাইজ সমূহ)</label>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">Type custom size manually or tap quick preset chips</p>
                        </div>
                      </div>

                      {/* Manual Size Input Box */}
                      <div className="flex gap-3">
                        <input
                          value={customSizeInput}
                          placeholder="Type custom size (e.g. S, M, L, XL, 38, 40, Free Size)..."
                          onChange={e => setCustomSizeInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault();
                              const val = customSizeInput.trim().toUpperCase();
                              if (val && !(form.available_sizes || []).some(s => (typeof s === 'object' ? s.name : s) === val)) {
                                setForm({ ...form, available_sizes: [...(form.available_sizes || []), { name: val, is_available: true }] });
                                setCustomSizeInput('');
                              }
                            }
                          }}
                          className="flex-1 bg-black/60 border-2 border-zinc-800 h-12 px-4 rounded-xl text-sm font-bold text-white placeholder:text-zinc-700 outline-none focus:border-[#ce112d]/50 transition-all uppercase"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = customSizeInput.trim().toUpperCase();
                            if (val && !(form.available_sizes || []).some(s => (typeof s === 'object' ? s.name : s) === val)) {
                              setForm({ ...form, available_sizes: [...(form.available_sizes || []), { name: val, is_available: true }] });
                              setCustomSizeInput('');
                            }
                          }}
                          className="px-6 h-12 bg-[#ce112d] hover:bg-[#e61535] text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shrink-0"
                        >
                          + Add Size
                        </button>
                      </div>

                      {/* Quick Presets */}
                      <div className="space-y-2">
                        <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">Quick Presets:</span>
                        <div className="flex flex-wrap gap-2">
                          {['S', 'M', 'L', 'XL', 'XXL', '36', '38', '40', '42', 'Free Size'].map(s => {
                            const isAdded = (form.available_sizes || []).some(sz => (typeof sz === 'object' ? sz.name : sz) === s);
                            return (
                              <button
                                key={s}
                                type="button"
                                onClick={() => {
                                  if (isAdded) {
                                    setForm({ ...form, available_sizes: (form.available_sizes || []).filter(sz => (typeof sz === 'object' ? sz.name : sz) !== s) });
                                  } else {
                                    setForm({ ...form, available_sizes: [...(form.available_sizes || []), { name: s, is_available: true }] });
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${isAdded
                                    ? 'bg-[#ce112d] border-[#ce112d] text-white'
                                    : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:border-white/20'
                                  }`}
                              >
                                {isAdded ? <span className="inline-flex items-center gap-1"><Check size={11} /> {s}</span> : <span className="inline-flex items-center gap-1"><Plus size={11} /> {s}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Active Added Size Tags */}
                      {(form.available_sizes || []).length > 0 && (
                        <div className="mt-4 p-4 bg-black/40 rounded-2xl border border-white/5 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#ce112d]" />
                            <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Active Sizes ({(form.available_sizes || []).length}):</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {form.available_sizes.map((size, idx) => {
                              const name = typeof size === 'object' ? size.name : size;
                              const isAvailable = typeof size === 'object' ? (size.is_available ?? true) : true;
                              return (
                                <div
                                  key={idx}
                                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-3 transition-all border ${isAvailable ? 'bg-[#ce112d]/20 text-white border-[#ce112d]/40' : 'bg-zinc-900 text-zinc-600 border-white/5 line-through'
                                    }`}
                                >
                                  <span>{name}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (form.available_sizes || []).filter((_, i) => i !== idx);
                                      setForm({ ...form, available_sizes: updated });
                                    }}
                                    className="p-1 hover:text-red-400 text-zinc-400 transition-colors"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Colors & Color Picker — Redesigned */}
                    <div className="space-y-6 pt-4">
                      <div>
                        <label className="text-[11px] font-black uppercase text-white tracking-[0.2em] block">Color Variants <span className="text-zinc-500 font-bold">(কালার অপশন)</span></label>
                        <p className="text-[10px] text-zinc-600 font-medium mt-0.5">Select a swatch or enter name below, then click Add Color</p>
                      </div>

                      {/* Color Selection Panel */}
                      <div className="p-4 md:p-6 bg-zinc-950/80 border border-white/[0.06] rounded-2xl md:rounded-3xl space-y-5">
                        {/* Gradient Hue Strip — interactive */}
                        <div className="space-y-2">
                          <span className="text-[9px] font-bold uppercase text-zinc-600 tracking-widest">Pick from Gradient</span>
                          <div
                            className="relative h-10 md:h-12 rounded-xl overflow-hidden cursor-crosshair shadow-inner border border-white/10"
                            style={{ background: 'linear-gradient(to right, #ff0000, #ff8800, #ffff00, #00ff00, #00ffff, #0088ff, #0000ff, #8800ff, #ff00ff, #ff0088, #ff0000)' }}
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                              // Map position to hue
                              const hue = Math.round(x * 360);
                              const hex = `hsl(${hue}, 85%, 50%)`;
                              // Convert HSL to hex
                              const tempEl = document.createElement('div');
                              tempEl.style.color = hex;
                              document.body.appendChild(tempEl);
                              const rgb = window.getComputedStyle(tempEl).color;
                              document.body.removeChild(tempEl);
                              const match = rgb.match(/\d+/g);
                              if (match) {
                                const hexColor = '#' + match.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
                                const matched = getColorName(hexColor);
                                setForm({ ...form, _newColorHex: hexColor, _newColorName: matched.en });
                              }
                            }}
                          >
                            {/* Lightness overlay gradient */}
                            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, transparent 50%, rgba(0,0,0,0.4) 100%)' }} />
                            {/* Position indicator */}
                            {form._newColorHex && form._newColorHex !== '#888888' && (
                              <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 rounded-full border-2 border-white shadow-lg pointer-events-none" style={{ backgroundColor: form._newColorHex, left: '50%' }} />
                            )}
                          </div>
                        </div>

                        {/* Categorized Swatches */}
                        {[
                          { label: 'Basics', filter: (s) => ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow'].includes(s.en) },
                          { label: 'Warm', filter: (s) => ['Maroon', 'Burgundy', 'Pink', 'Dusty Rose', 'Orange', 'Gold', 'Mustard', 'Coral'].includes(s.en) },
                          { label: 'Cool', filter: (s) => ['Navy', 'Royal Blue', 'Sky Blue', 'Teal', 'Purple', 'Lavender', 'Emerald'].includes(s.en) },
                          { label: 'Neutrals', filter: (s) => ['Grey', 'Silver', 'Charcoal', 'Brown', 'Beige', 'Cream'].includes(s.en) },
                        ].map(group => {
                          const swatches = PRESET_SWATCHES.filter(group.filter);
                          if (swatches.length === 0) return null;
                          return (
                            <div key={group.label} className="space-y-2.5 p-3 rounded-xl bg-black/20 border border-white/5">
                              <span className="inline-block text-xs font-bold uppercase text-zinc-300 tracking-wider px-2 py-0.5 rounded-md bg-zinc-800/80">{group.label}</span>
                              <div className="flex flex-wrap gap-2 md:gap-2.5">
                                {swatches.map((swatch, sIdx) => {
                                  const isSelected = form._newColorHex === swatch.hex;
                                  return (
                                    <button
                                      key={sIdx}
                                      type="button"
                                      onClick={() => {
                                        setForm({ ...form, _newColorHex: swatch.hex, _newColorName: swatch.en });
                                      }}
                                      className={`flex flex-col items-center gap-1.5 transition-all active:scale-90 group/swatch ${isSelected ? 'scale-105' : ''}`}
                                    >
                                      <div
                                        className={`w-10 h-10 md:w-11 md:h-11 rounded-xl shadow-lg transition-all ${
                                          isSelected
                                            ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-950 scale-110'
                                            : 'border-2 border-white/10 hover:border-white/40 group-hover/swatch:scale-110'
                                        }`}
                                        style={{ backgroundColor: swatch.hex }}
                                      >
                                        {isSelected && (
                                          <div className="w-full h-full flex items-center justify-center bg-black/20 rounded-xl">
                                            <Check size={16} className={swatch.hex === '#FFFFFF' ? 'text-black' : 'text-white'} strokeWidth={3} />
                                          </div>
                                        )}
                                      </div>
                                      <span className={`text-[10px] font-medium tracking-wide leading-none ${isSelected ? 'text-white' : 'text-zinc-400'}`}>
                                        {swatch.en.length > 8 ? swatch.en.slice(0, 7) + '…' : swatch.en}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        {/* Custom Input + Preview */}
                        <div className="pt-2 border-t border-white/5 space-y-3">
                          <span className="text-xs font-bold uppercase text-zinc-400 tracking-wider">Custom / Selected Color</span>
                          <div className="flex gap-3 items-stretch">
                            {/* Color Preview + Native Picker */}
                            <label className="relative w-14 h-14 shrink-0 cursor-pointer rounded-2xl border-2 border-white/15 shadow-xl overflow-hidden transition-all hover:scale-105 hover:border-white/30" style={{ backgroundColor: form._newColorHex || '#888888' }}>
                              <input
                                type="color"
                                aria-label="Pick a custom color"
                                value={form._newColorHex || '#888888'}
                                onChange={e => {
                                  const matched = getColorName(e.target.value);
                                  setForm({ ...form, _newColorHex: e.target.value, _newColorName: matched.en });
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                              <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2">
                                <Pipette size={10} className="text-white/60" />
                              </div>
                            </label>
                            {/* Name + Hex Inputs */}
                            <div className="flex-1 flex flex-col gap-2">
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-zinc-600">Name</span>
                                <input
                                  value={form._newColorName || ''}
                                  placeholder="Color name..."
                                  onChange={e => setForm({ ...form, _newColorName: e.target.value })}
                                  className="w-full bg-black/60 border border-zinc-800 h-10 pl-14 pr-3 rounded-xl text-sm font-bold shadow-inner focus:border-[#ce112d]/50 outline-none transition-all text-white"
                                />
                              </div>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase text-zinc-600">HEX</span>
                                <input
                                  value={form._newColorHex || ''}
                                  placeholder="#000000"
                                  onChange={e => {
                                    const val = e.target.value;
                                    setForm({ ...form, _newColorHex: val });
                                    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                                      const matched = getColorName(val);
                                      setForm(prev => ({ ...prev, _newColorHex: val, _newColorName: matched.en }));
                                    }
                                  }}
                                  className="w-full bg-black/60 border border-zinc-800 h-10 pl-14 pr-3 rounded-xl text-xs font-mono font-bold text-zinc-400 outline-none uppercase focus:border-[#ce112d]/50 transition-all"
                                />
                              </div>
                            </div>
                          </div>
                          {/* Live Preview Card */}
                          {form._newColorName && (
                            <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                              <div className="w-8 h-8 rounded-lg shadow-lg border border-white/10" style={{ backgroundColor: form._newColorHex || '#888888' }} />
                              <div>
                                <p className="text-xs font-bold text-white">{form._newColorName}</p>
                                <p className="text-[9px] font-mono text-zinc-500 uppercase">{form._newColorHex || '#888888'}</p>
                              </div>
                              <span className="ml-auto text-[8px] font-black uppercase text-zinc-600 tracking-wider">Preview</span>
                            </div>
                          )}
                          {/* Add Color Button — inline at bottom, matches Add Size pattern */}
                          <button
                            type="button"
                            onClick={() => {
                              const val = (form._newColorName || '').trim();
                              if (!val) { setAlertModal({ isOpen: true, title: 'Missing Name', message: 'Please enter or tap a color name first', type: 'error' }); return; }
                              const hex = form._newColorHex || '#888888';
                              setForm({ ...form, available_colors: [...(form.available_colors || []), { name: val, image: null, is_available: true, hex, sizes: [] }], _newColorHex: '#888888', _newColorName: '', _colorSuggestions: false });
                            }}
                            className="w-full h-11 bg-[#ce112d] hover:bg-[#e61535] text-white rounded-xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all shadow-lg"
                          >
                            + Add Color
                          </button>
                        </div>
                      </div>

                      <div className="space-y-8">
                        {form.available_colors?.map((rawColor, idx) => {
                          const color = typeof rawColor === 'object' ? rawColor : { name: rawColor, is_available: true, image: null, hex: null, sizes: [] };
                          const isAvailable = color.is_available ?? true;
                          return (
                            <div key={idx} className="bg-zinc-950 border border-white/5 rounded-2xl md:rounded-[40px] p-4 md:p-8 space-y-6 md:space-y-8 relative overflow-hidden group/card shadow-2xl">
                              <div className="absolute top-0 left-0 w-2 h-full bg-[#ce112d]/5 group-hover/card:bg-[#ce112d] transition-all"></div>

                              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 rounded-2xl border-2 border-white/10 shadow-2xl" style={{ backgroundColor: color.hex || '#888' }}></div>
                                  <div>
                                    <h4 className="text-xl font-black text-white uppercase italic tracking-tight">{color.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${isAvailable ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                        {isAvailable ? 'Status: Active' : 'Status: Sold Out'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <button type="button" onClick={() => {
                                    const updated = [...form.available_colors];
                                    updated[idx] = { ...color, is_available: !isAvailable };
                                    setForm({ ...form, available_colors: updated });
                                  }} className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isAvailable ? 'bg-zinc-800 text-zinc-500' : 'bg-green-600 text-white shadow-lg'}`}>
                                    {isAvailable ? 'Mark Sold Out' : 'Restore'}
                                  </button>
                                  <button type="button" onClick={() => setForm({ ...form, available_colors: form.available_colors.filter((_, i) => i !== idx) })} className="p-3 bg-red-600/10 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-xl">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                                <div className="lg:col-span-12 space-y-4">
                                  <label className="text-[11px] font-bold uppercase text-zinc-500 px-1 italic tracking-wide">Stock & SKU per Size</label>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {form.available_sizes?.map((sz, sIdx) => {
                                      const sName = typeof sz === 'object' ? sz.name : sz;
                                      const sObj = color.sizes?.find(s => (typeof s === 'object' ? s.name : s) === sName);
                                      const isLinked = !!sObj;
                                      return (
                                        <div key={sIdx} className={`p-3 md:p-5 rounded-2xl md:rounded-[28px] border-2 transition-all ${isLinked ? 'bg-black/40 border-[#ce112d]/30 shadow-2xl' : 'bg-black/10 border-white/5 opacity-60'}`}>
                                          <div className="flex items-center justify-between mb-4">
                                            <span className="text-sm font-black text-white italic">{sName}</span>
                                            <input type="checkbox" checked={isLinked} onChange={() => {
                                              const updated = [...form.available_colors];
                                              const curSizes = color.sizes || [];
                                              const newSizes = isLinked ? curSizes.filter(s => (typeof s === 'object' ? s.name : s) !== sName) : [...curSizes, { name: sName, stock: 0, sku: '' }];
                                              updated[idx] = { ...color, sizes: newSizes };
                                              setForm({ ...form, available_colors: updated });
                                            }} className="w-5 h-5 accent-[#ce112d]" />
                                          </div>
                                          {isLinked && (
                                            <div className="space-y-4">
                                              <div>
                                                <p className="text-[8px] font-black text-zinc-600 uppercase mb-1.5 ml-1">Stock</p>
                                                <input type="number" value={sObj.stock || 0} onChange={e => {
                                                  const updated = [...form.available_colors];
                                                  const newSizes = color.sizes.map(s => (typeof s === 'object' ? s.name : s) === sName ? { ...s, stock: parseInt(e.target.value) || 0 } : s);
                                                  updated[idx] = { ...color, sizes: newSizes };
                                                  setForm({ ...form, available_colors: updated });
                                                }} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl h-9 px-3 text-[11px] font-black text-white outline-none focus:border-[#ce112d]" />
                                              </div>
                                              <div>
                                                <p className="text-[8px] font-black text-zinc-600 uppercase mb-1.5 ml-1">SKU</p>
                                                <input type="text" placeholder="SKU Code" value={sObj.sku || ''} onChange={e => {
                                                  const updated = [...form.available_colors];
                                                  const newSizes = color.sizes.map(s => (typeof s === 'object' ? s.name : s) === sName ? { ...s, sku: e.target.value } : s);
                                                  updated[idx] = { ...color, sizes: newSizes };
                                                  setForm({ ...form, available_colors: updated });
                                                }} className="w-full bg-zinc-900 border border-zinc-800 rounded-xl h-9 px-3 text-[9px] font-mono font-black text-[#ce112d] outline-none focus:border-[#ce112d] uppercase" />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>

                                <div className="pt-6 border-t border-white/5 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold uppercase text-zinc-400 px-1 block italic tracking-wide">
                                      Photo for {color.name || 'this Color'}
                                    </label>
                                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all border border-white/10">
                                      <Upload size={12} />
                                      <span>Upload New</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          setLoading(true);
                                          try {
                                            const compressed = await compressImage(file, COMPRESS_PRESETS.product);
                                            const url = await uploadSingleFile(compressed);
                                            if (url) {
                                              const updated = [...form.available_colors];
                                              updated[idx] = { ...color, image: url };
                                              setForm(prev => ({
                                                ...prev,
                                                images: [url, ...(prev.images || []).filter(img => img !== url)],
                                                available_colors: updated
                                              }));
                                            }
                                          } catch (err) {
                                            console.error('Color image upload error:', err);
                                          } finally {
                                            setLoading(false);
                                            e.target.value = '';
                                          }
                                        }}
                                      />
                                    </label>
                                  </div>

                                  {form.images?.length > 0 && (
                                    <div className="flex flex-wrap gap-2.5">
                                      {form.images.map((img, i) => (
                                        <div
                                          key={i}
                                          onClick={() => {
                                            const updated = [...form.available_colors];
                                            updated[idx] = { ...color, image: color.image === img ? null : img };
                                            setForm({ ...form, available_colors: updated });
                                          }}
                                          className={`relative w-14 h-14 rounded-[18px] overflow-hidden border-2 cursor-pointer transition-all ${
                                            color.image === img
                                              ? 'border-[#ce112d] scale-110 shadow-2xl ring-4 ring-red-900/20'
                                              : 'border-zinc-800 opacity-40 hover:opacity-100'
                                          }`}
                                        >
                                          <img src={img} className="w-full h-full object-cover" alt="Variant" />
                                          {color.image === img && (
                                            <div className="absolute inset-0 bg-[#ce112d]/40 flex items-center justify-center">
                                              <Check size={16} strokeWidth={4} className="text-white" />
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <label className="flex items-center gap-4 md:gap-6 p-6 md:p-10 bg-black/40 rounded-2xl md:rounded-[40px] border border-white/5 cursor-pointer hover:bg-white/5 transition-all group shadow-2xl">
                    <input type="checkbox" checked={form.is_sold_out} onChange={e => setForm({ ...form, is_sold_out: e.target.checked })} className="w-8 h-8 rounded-xl accent-[#ce112d] shrink-0" />
                    <div>
                      <span className="text-base font-black text-white uppercase tracking-wider group-hover:text-red-500 transition-colors italic">Sold Out</span>
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Hide product from the store</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-4 md:gap-6 p-6 md:p-10 bg-[#ce112d]/5 rounded-2xl md:rounded-[40px] border border-[#ce112d]/20 cursor-pointer hover:bg-[#ce112d]/10 transition-all group shadow-2xl">
                    <input type="checkbox" checked={form.is_exclusive} onChange={e => setForm({ ...form, is_exclusive: e.target.checked })} className="w-8 h-8 rounded-xl accent-[#ce112d] shrink-0" />
                    <div>
                      <span className="text-base font-black text-red-400 uppercase tracking-wider italic">Exclusive Product</span>
                      <p className="text-xs font-semibold text-red-300/70 mt-1">Requires 500 TK advance</p>
                    </div>
                  </label>
                </div>

                {!editingProduct && (
                  <label className="flex items-center gap-4 md:gap-6 p-6 md:p-8 bg-emerald-500/5 rounded-2xl md:rounded-[32px] border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/10 transition-all group shadow-2xl">
                    <input
                      type="checkbox"
                      checked={notifySignedInUsers}
                      onChange={(e) => setNotifySignedInUsers(e.target.checked)}
                      className="w-8 h-8 rounded-xl accent-emerald-500 shrink-0"
                    />
                    <div>
                      <span className="text-base font-black text-emerald-400 uppercase tracking-wider italic">Notify Signed-in Users</span>
                      <p className="text-xs font-semibold text-emerald-400/60 mt-1">
                        Send an in-app alert on their Account page when this product is published
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {/* Submit & Discard — Standardized Height, Proportional Width & Conventional Action Color */}
              <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-8 border-t border-white/5">
                <button 
                  type="button" 
                  onClick={cancelEdit} 
                  className="w-full sm:w-44 h-12 md:h-14 border border-zinc-800 rounded-xl uppercase text-xs font-bold tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all active:scale-[0.98]"
                >
                  Discard
                </button>
                <button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full sm:w-60 bg-emerald-600 hover:bg-emerald-500 h-12 md:h-14 rounded-xl font-bold uppercase tracking-wider text-xs md:text-sm text-white shadow-xl shadow-emerald-950/50 hover:brightness-105 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  {loading ? <RotateCcw size={18} className="animate-spin" /> : <Save size={18} />}
                  <span>{loading ? 'Saving...' : (editingProduct ? 'Update Product' : 'Save Product')}</span>
                </button>
              </div>

              {/* Mobile Sticky Save Action Bar */}
              <div className="fixed bottom-0 left-0 right-0 p-3 bg-zinc-950/95 border-t border-white/10 backdrop-blur-xl z-50 lg:hidden flex items-center gap-3 shadow-2xl">
                <button type="button" onClick={cancelEdit} className="px-5 h-12 border border-zinc-800 rounded-xl text-xs font-bold uppercase tracking-wider text-zinc-400 hover:bg-zinc-800">
                  Discard
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 h-12 rounded-xl font-bold uppercase text-xs text-white tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 disabled:opacity-50">
                  {loading ? <RotateCcw size={16} className="animate-spin" /> : <Save size={16} />}
                  <span>{loading ? 'Saving...' : (editingProduct ? 'Update Product' : 'Save Product')}</span>
                </button>
              </div>
            </div>
          </form>
        ) : activeTab === 'pending-items' ? (
          <div className="space-y-12 pb-24">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold uppercase tracking-tight text-white">Pending <span className="text-yellow-500">Deliveries</span></h2>
                <p className="text-zinc-500 text-[10px] mt-3 uppercase font-bold tracking-wide bg-zinc-900 py-2 px-5 rounded-full border border-white/5 inline-block">
                  {orders.filter(o => o.status === 'Pending' && o.status !== 'Deleted').length} Items to Pack
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {orders.filter(o => o.status === 'Pending' && o.status !== 'Deleted').length === 0 ? (
                <div className="col-span-full py-32 text-center space-y-4 bg-zinc-900 shadow-xl border border-white/5 border-dashed rounded-[40px]">
                  <div className="w-20 h-20 bg-zinc-950 rounded-[32px] flex items-center justify-center mx-auto border border-white/5">
                    <Package className="text-zinc-800" size={32} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-zinc-400 text-base font-bold uppercase tracking-widest">No pending items</p>
                    <p className="text-zinc-600 text-sm">All orders are currently processed</p>
                  </div>
                </div>
              ) : (
                orders.filter(o => o.status === 'Pending' && o.status !== 'Deleted').map(order => (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrder(order)}
                    className="bg-zinc-900 border border-white/5 rounded-[40px] p-6 space-y-6 relative overflow-hidden group hover:border-yellow-500/30 transition-all shadow-2xl cursor-pointer"
                  >
                    {/* Date Tag */}
                    <div className="flex justify-between items-center bg-black/40 px-4 py-2 rounded-2xl border border-white/5">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{new Date(order.created_at).toLocaleDateString()}</span>
                      <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">REF: #{order.id.toString().slice(-6).toUpperCase()}</span>
                    </div>

                    {/* Item Details */}
                    <div className="flex gap-5">
                      <div className="w-20 h-28 bg-black rounded-2xl overflow-hidden shrink-0 border border-white/5 shadow-xl">
                        {(() => {
                          const product = products.find(p => p.id == order.product_id);
                          const thumb = getOptimizedUrl(product?.image_url || product?.images?.[0], mediaSizes.thumbnail);
                          return thumb ? <img src={thumb} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-zinc-800"><ShoppingBag size={32} /></div>
                        })()}
                      </div>
                      <div className="flex-1 space-y-3">
                        <h4 className="text-base font-black text-white italic leading-tight line-clamp-2">{order.product_name}</h4>
                        <div className="flex flex-wrap gap-2">
                          {order.size && <span className="bg-zinc-800 text-zinc-500 px-3 py-1 rounded-lg text-[9px] font-black border border-white/5 uppercase">SZ: {order.size}</span>}
                          {order.color && <span className="bg-zinc-800 text-zinc-500 px-3 py-1 rounded-lg text-[9px] font-black border border-white/5 uppercase">COL: {order.color}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Customer Action */}
                    <div className="bg-black/40 p-5 rounded-3xl border border-white/5 space-y-2">
                      <p className="text-[11px] font-black text-[#ce112d] italic">{order.customer_name}</p>
                      <p className="text-[13px] font-bold text-zinc-400">{order.customer_phone}</p>
                      <p className="text-[10px] font-bold text-zinc-600 line-clamp-1">{order.customer_address}</p>
                    </div>

                    {/* Quick Move Action */}
                    <div className="grid grid-cols-3 gap-2 pt-2">
                      <a href={`tel:${order.customer_phone}`} className="h-11 flex items-center justify-center bg-blue-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wide border border-blue-400/20 shadow-lg shadow-blue-500/10 active:scale-[0.98] transition-all">Call</a>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyFullOrderDetails(order); }}
                        className="h-11 flex items-center justify-center bg-zinc-800 text-white hover:bg-[#ce112d] rounded-xl text-[10px] font-bold uppercase tracking-wide border border-white/10 active:scale-[0.98] transition-all gap-1"
                        title="Copy Order Details"
                      >
                        <Copy size={12} /> Copy
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.id, 'Shipped'); }}
                        className="h-11 flex items-center justify-center bg-yellow-500 text-black rounded-xl text-[10px] font-bold uppercase tracking-wide shadow-lg shadow-yellow-500/10 active:scale-[0.98] transition-all"
                      >
                        Shipped
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeTab === 'orders' ? (
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold uppercase tracking-tight text-white">Order <span className="text-[#ce112d]">Details</span></h2>
                <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-zinc-400 tracking-wider bg-zinc-900 py-1.5 px-4 rounded-full border border-white/5">
                    <ShoppingBag size={14} className="text-[#ce112d]" />
                    {orders.filter(o => o && o.status !== 'Deleted').length} Orders
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider bg-green-500/10 text-green-500 py-1.5 px-4 rounded-full border border-green-500/20">
                    Total Revenue: ৳{orders.filter(o => o && o.status !== 'Deleted').reduce((acc, o) => {
                      const amount = parseFloat(o.total_amount) || 0;
                      return acc + amount;
                    }, 0).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-500 py-1.5 px-4 rounded-full border border-purple-500/20">
                    <ShieldCheck size={14} />
                    Advance: ৳{orders.filter(o => o && o.is_advance_paid).reduce((acc, o) => {
                      const charge = parseFloat(o.delivery_charge) || 0;
                      const adv = o.is_exclusive_order ? 500 : (o.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge);
                      return acc + adv;
                    }, 0).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center justify-center gap-2 px-6 h-12 bg-[#121215] border border-[#1d1d21] rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-[#ce112d] hover:border-[#ce112d] hover:text-white transition-all group text-zinc-400 shadow-lg"
                >
                  <Download size={18} className="text-[#ce112d] group-hover:text-white transition-colors" />
                  CSV
                </button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
              <div className="bg-[#121215] border border-[#1d1d21] p-4 md:p-6 rounded-2xl md:rounded-[32px] space-y-3 md:space-y-4 shadow-xl relative overflow-hidden group min-h-[100px]">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-emerald-400" />
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.01] -mr-16 -mt-16 rounded-full group-hover:bg-white/[0.02] transition-all" />
                <p className="text-[10px] md:text-xs font-semibold text-zinc-500 uppercase tracking-wide">Revenue</p>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-xl md:text-3xl font-bold text-white tracking-tighter truncate">৳{orders.filter(o => o && o.status !== 'Deleted').reduce((acc, o) => {
                    const amount = parseFloat(o.total_amount) || 0;
                    return acc + amount;
                  }, 0).toLocaleString()}</p>
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-green-500/10 rounded-xl md:rounded-2xl flex items-center justify-center border border-green-500/20 relative z-10 shrink-0">
                    <ShoppingBag size={16} className="md:w-5 md:h-5 text-green-500" />
                  </div>
                </div>
              </div>
              <div className="bg-[#121215] border border-[#1d1d21] p-4 md:p-6 rounded-2xl md:rounded-[32px] space-y-3 md:space-y-4 shadow-xl relative overflow-hidden group min-h-[100px]">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-violet-400" />
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/[0.03] -mr-16 -mt-16 rounded-full group-hover:bg-purple-500/[0.05] transition-all" />
                <p className="text-[10px] md:text-xs font-semibold text-purple-500 uppercase tracking-wide">Advance</p>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-xl md:text-3xl font-bold text-white tracking-tighter truncate">৳{orders.filter(o => o && o.is_advance_paid).reduce((acc, o) => {
                    const charge = parseFloat(o.delivery_charge) || 0;
                    const adv = o.is_exclusive_order ? 500 : (o.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge);
                    return acc + adv;
                  }, 0).toLocaleString()}</p>
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-purple-500/10 rounded-xl md:rounded-2xl flex items-center justify-center border border-purple-500/20 relative z-10 shrink-0">
                    <ShieldCheck size={16} className="md:w-5 md:h-5 text-purple-500" />
                  </div>
                </div>
              </div>
              <div className="bg-[#121215] border border-[#1d1d21] p-4 md:p-6 rounded-2xl md:rounded-[32px] space-y-3 md:space-y-4 shadow-xl relative overflow-hidden group min-h-[100px]">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#ce112d] to-rose-400" />
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#ce112d]/[0.03] -mr-16 -mt-16 rounded-full group-hover:bg-[#ce112d]/[0.05] transition-all" />
                <p className="text-[10px] md:text-xs font-semibold text-[#ce112d] uppercase tracking-wide">Total Due</p>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-xl md:text-3xl font-bold text-white tracking-tighter truncate">৳{orders.filter(o => o && o.status !== 'Deleted' && o.payment_status !== 'Fully Paid').reduce((acc, o) => {
                    const totalAmount = parseFloat(o.total_amount) || 0;
                    const charge = parseFloat(o.delivery_charge) || 0;
                    const advanceAmount = o.is_advance_paid ? (o.is_exclusive_order ? 500 : (o.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge)) : 0;
                    return acc + (totalAmount - advanceAmount);
                  }, 0).toLocaleString()}</p>
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-[#ce112d]/10 rounded-xl md:rounded-2xl flex items-center justify-center border border-[#ce112d]/20 relative z-10 shrink-0">
                    <span className="text-[#ce112d] font-bold text-xs md:text-sm">৳</span>
                  </div>
                </div>
              </div>
              <div className="bg-[#121215] border border-[#1d1d21] p-4 md:p-6 rounded-2xl md:rounded-[32px] space-y-3 md:space-y-4 shadow-xl relative overflow-hidden group min-h-[100px]">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 to-amber-400" />
                <p className="text-[10px] md:text-xs font-semibold text-yellow-500 uppercase tracking-wide">Pending</p>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-xl md:text-3xl font-bold text-white">{orders.filter(o => o && o.status === 'Pending').length}</p>
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-yellow-500/10 rounded-xl md:rounded-2xl flex items-center justify-center border border-yellow-500/20 shrink-0">
                    <Clock size={16} className="md:w-5 md:h-5 text-yellow-500" />
                  </div>
                </div>
              </div>
              <div className="bg-[#121215] border border-[#1d1d21] p-4 md:p-6 rounded-2xl md:rounded-[32px] space-y-3 md:space-y-4 shadow-xl relative overflow-hidden group min-h-[100px] col-span-2 md:col-span-1">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-green-400" />
                <p className="text-[10px] md:text-xs font-semibold text-emerald-500 uppercase tracking-wide">Completed</p>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-xl md:text-3xl font-bold text-white">{orders.filter(o => o && o.status === 'Delivered').length}</p>
                  <div className="w-8 h-8 md:w-10 md:h-10 bg-green-500/10 rounded-xl md:rounded-2xl flex items-center justify-center border border-green-500/20 shrink-0">
                    <CheckCircle2 size={16} className="md:w-5 md:h-5 text-green-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile / Shared Order Details Modal (Unified Experience) */}
            {selectedOrder && (activeTab === 'pending-items' || (activeTab === 'orders' && !window.matchMedia('(min-width: 1024px)').matches)) && (
              <div className="fixed inset-0 z-[1200] bg-black/95 flex items-center justify-center p-0 md:p-6 backdrop-blur-xl" onClick={() => setSelectedOrder(null)}>
                <div
                  className="relative w-full h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-2xl bg-[#0a0a0c] rounded-t-[40px] md:rounded-[48px] overflow-hidden shadow-2xl border-t border-white/20 md:border border-[#1d1d21] flex flex-col"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="h-1.5 bg-gradient-to-r from-transparent via-[#ce112d] to-transparent shrink-0 opacity-80" />

                  {/* Modal Header */}
                  <div className="p-8 pb-6 flex items-center justify-between bg-black/20 border-b border-[#1d1d21] backdrop-blur-md">
                    <div className="flex items-center gap-4">
                      <div className="w-1.5 h-8 bg-gradient-to-b from-[#ce112d] to-[#ff1c3a] rounded-full shadow-[0_0_20px_rgba(206,17,45,0.4)]" />
                      <div>
                        <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">Order <span className="text-[#ce112d]">Command</span></h3>
                        <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em] mt-1">
                          Ref: #{selectedOrder.id.toString().slice(-6).toUpperCase()} • {new Date(selectedOrder.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyFullOrderDetails(selectedOrder)}
                        className="flex items-center gap-1.5 px-4 h-11 bg-[#ce112d]/10 hover:bg-[#ce112d] text-[#ce112d] hover:text-white rounded-2xl border border-[#ce112d]/20 active:scale-95 transition-all text-[11px] font-black uppercase tracking-wider shadow-lg shadow-red-900/20"
                        title="Copy Full Order Details"
                      >
                        <Copy size={16} /> Copy Order
                      </button>
                      <button onClick={() => { deleteOrder(selectedOrder.id); setSelectedOrder(null); }} className="w-11 h-11 flex items-center justify-center bg-red-500/5 text-red-500/50 rounded-2xl border border-red-500/10 active:scale-95 transition-all hover:bg-red-500 hover:text-white">
                        <Trash2 size={18} />
                      </button>
                      <button onClick={() => setSelectedOrder(null)} className="md:hidden w-11 h-11 flex items-center justify-center bg-white/5 text-white rounded-2xl border border-white/10 active:scale-95 transition-all">
                        <X size={22} />
                      </button>
                    </div>
                  </div>

                  {/* Modal Scrollable Content */}
                  <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 no-scrollbar custom-scrollbar">
                    {/* Section 1: Customer & Delivery */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-[#121215]/50 rounded-[32px] p-6 border border-[#1d1d21] space-y-6">
                        <div className="flex items-center gap-3">
                          <User size={14} className="text-[#ce112d]" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#ce112d]">Customer Detail</p>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] mb-1.5">Full Name</p>
                            <p className="text-base font-black text-white italic tracking-tight">{selectedOrder.customer_name}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em] mb-1.5">Phone Information</p>
                            <div className="flex items-center justify-between bg-black/40 px-4 py-3 rounded-2xl border border-white/5 shadow-inner">
                              <span className="text-base font-black text-white tracking-widest italic">{selectedOrder.customer_phone}</span>
                              <div className="flex gap-2">
                                <a href={`tel:${selectedOrder.customer_phone}`} className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 border border-blue-500/20"><Phone size={12} /></a>
                                <a href={`https://wa.me/${selectedOrder.customer_phone.replace(/[^0-9]/g, '')}`} target="_blank" className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 border border-green-500/20"><MessageSquare size={12} /></a>
                              </div>
                            </div>
                          </div>
                          {selectedOrder.last_four_digits && selectedOrder.last_four_digits !== 'COD' && (
                            <div>
                              <p className="text-[9px] text-[#ce112d] font-bold uppercase tracking-[0.2em] mb-1.5">
                                {selectedOrder.last_four_digits.includes(': ')
                                  ? `${selectedOrder.last_four_digits.split(': ')[0]} Detail`
                                  : 'Sender bKash Number / ID'}
                              </p>
                              <div className="flex items-center justify-between bg-[#ce112d]/5 px-4 py-3 rounded-2xl border border-[#ce112d]/10 shadow-inner">
                                <span className="text-base font-black text-[#ce112d] tracking-widest italic">
                                  {selectedOrder.last_four_digits.includes(': ')
                                    ? selectedOrder.last_four_digits.split(': ')[1]
                                    : selectedOrder.last_four_digits}
                                </span>
                                <button
                                  onClick={() => {
                                    const val = selectedOrder.last_four_digits.includes(': ')
                                      ? selectedOrder.last_four_digits.split(': ')[1]
                                      : selectedOrder.last_four_digits;
                                    copyToClipboard(val, "Sender Detail");
                                  }}
                                  className="w-8 h-8 rounded-full bg-[#ce112d]/10 flex items-center justify-center text-[#ce112d] border border-[#ce112d]/20 active:scale-95 transition-all"
                                >
                                  <Copy size={12} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="bg-[#121215]/50 rounded-[32px] p-6 border border-[#1d1d21] space-y-6">
                        <div className="flex items-center gap-3">
                          <MapPin size={14} className="text-zinc-500" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Logistics Detail</p>
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[9px] text-zinc-600 font-black uppercase tracking-[0.2em] mb-1">Area</p>
                              <span className="text-[9px] font-black bg-zinc-900 border border-white/5 px-3 py-1.5 rounded-lg text-zinc-400 uppercase">{selectedOrder.delivery_area}</span>
                            </div>
                            <button onClick={() => copyToClipboard(selectedOrder.customer_address, "Address")} className="flex items-center gap-1.5 text-[8px] font-black uppercase text-[#ce112d] bg-[#ce112d]/10 px-4 py-2 rounded-full border border-[#ce112d]/10 hover:bg-[#ce112d] hover:text-white transition-all">
                              <Copy size={12} /> Copy
                            </button>
                          </div>
                          <div>
                            <p className="text-[9px] text-zinc-600 font-black uppercase tracking-[0.2em] mb-1.5">Shipping Address</p>
                            <p className="text-[13px] font-medium text-zinc-400 leading-relaxed italic">{selectedOrder.customer_address}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Items & Financials */}
                    <div className="bg-[#121215]/50 rounded-[40px] border border-[#1d1d21] overflow-hidden shadow-2xl">
                      <div className="p-6 border-b border-[#1d1d21] flex items-center justify-between bg-white/[0.01]">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Order Items & Summary</p>
                        <span className="text-[10px] font-black bg-[#ce112d] text-white px-4 py-1.5 rounded-full uppercase italic shadow-lg shadow-red-900/20 ring-1 ring-white/10">Items: {selectedOrder.product_name?.split('+').length || 1}</span>
                      </div>
                      <div className="p-6 md:p-8 space-y-8">
                        {(() => {
                          const parseLine = (str) => {
                            const res = { name: str, size: null, color: null, sku: null, qty: 1 };
                            const colorMatch = str.match(/\((?:Color|রঙ):\s*([^)]*)\)/i);
                            const sizeMatch = str.match(/\((?:Size|সাইজ):\s*([^)]*)\)/i);
                            const skuMatch = str.match(/\((?:SKU):\s*([^)]*)\)/i);
                            const qtyMatch = str.match(/\((?:Qty|পরিমাণ):\s*(\d+)\)/i);
                            if (colorMatch) res.color = colorMatch[1].trim();
                            if (sizeMatch) res.size = sizeMatch[1].trim();
                            if (skuMatch) res.sku = skuMatch[1].trim();
                            if (qtyMatch) res.qty = qtyMatch[1];
                            res.name = str.split('(')[0].trim();
                            return res;
                          };

                          const itemsArr = (selectedOrder.product_name || '').split(' + ').map(parseLine);
                          return itemsArr.map((item, idx) => {
                            const targetP =
                              products.find(p => p.id == selectedOrder.product_id && idx === 0) ||
                              products.find(p => item.sku && (p.platform_id == item.sku || p.serial_no == item.sku)) ||
                              products.find(p => p.name === item.name) ||
                              products.find(p => p.name && item.name && p.name.toLowerCase().includes(item.name.toLowerCase()));

                            const thumb = getOptimizedUrl(targetP?.image_url || targetP?.images?.[0], mediaSizes.thumbnail);

                            return (
                              <div key={idx} className="flex gap-6 items-start group">
                                <div className="w-20 h-24 md:w-24 md:h-32 bg-black rounded-3xl border border-[#1d1d21] overflow-hidden shrink-0 shadow-2xl relative flex items-center justify-center">
                                  {thumb ? <img src={thumb} className="w-full h-full object-cover" alt="" /> : <ImageIcon size={32} className="text-zinc-800" />}
                                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-black text-white/50">
                                    #{targetP?.serial_no || idx + 1}
                                  </div>
                                </div>
                                <div className="flex-1 space-y-4">
                                  <h4 className="text-base md:text-xl font-black text-white italic leading-tight uppercase tracking-tight">{item.name}</h4>

                                  <div className="grid grid-cols-2 gap-2 md:gap-4">
                                    <div className="bg-black/30 border border-[#ce112d]/10 p-2 md:p-3 rounded-2xl">
                                      <p className="text-[7px] font-black uppercase text-[#ce112d]/60 mb-1">Size</p>
                                      <p className="text-[11px] font-black text-white uppercase">{item.size || selectedOrder.size || 'N/A'}</p>
                                    </div>
                                    <div className="bg-black/30 border border-blue-500/10 p-2 md:p-3 rounded-2xl">
                                      <p className="text-[7px] font-black uppercase text-blue-500/60 mb-1">Color</p>
                                      <p className="text-[11px] font-black text-white uppercase">{item.color || selectedOrder.color || 'N/A'}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[#1d1d21]">
                          <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                            <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Base Price</p>
                            <p className="text-xl font-black text-white italic tracking-tighter">৳{selectedOrder.product_price.toLocaleString()}</p>
                          </div>
                          <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                            <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">Shipping Cost</p>
                            <p className="text-xl font-black text-white italic tracking-tighter">৳{parseFloat(selectedOrder.delivery_charge) || 0}</p>
                          </div>
                          <div className="bg-black/40 p-4 rounded-3xl border border-white/5">
                            <p className="text-[8px] font-black text-zinc-600 uppercase mb-1">
                              {selectedOrder.last_four_digits && selectedOrder.last_four_digits.includes(': ')
                                ? `${selectedOrder.last_four_digits.split(': ')[0]} Ref`
                                : 'Sender Reference'}
                            </p>
                            <p className="text-xs font-black text-[#ce112d] italic truncate" title={selectedOrder.last_four_digits}>
                              {selectedOrder.last_four_digits && selectedOrder.last_four_digits.includes(': ')
                                ? selectedOrder.last_four_digits.split(': ')[1]
                                : (selectedOrder.last_four_digits || 'COD')}
                            </p>
                          </div>
                          <div className="bg-[#ce112d]/10 p-4 rounded-3xl border border-[#ce112d]/20">
                            <p className="text-[8px] font-black text-[#ce112d] uppercase mb-1">Advance Received</p>
                            <p className="text-xl font-black text-[#ce112d] italic tracking-tighter">৳{(() => {
                              const charge = parseFloat(selectedOrder.delivery_charge) || 0;
                              const adv = selectedOrder.is_advance_paid ? (selectedOrder.is_exclusive_order ? 500 : (selectedOrder.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge)) : 0;
                              return adv;
                            })()}</p>
                          </div>
                        </div>

                        <div className="bg-gradient-to-br from-[#ce112d] to-[#ff1c3a] p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] flex flex-col sm:flex-row gap-6 items-center justify-between shadow-red-900/40 shadow-2xl relative overflow-hidden group">
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent)] pointer-events-none" />
                          <div className="text-center sm:text-left">
                            <p className="text-[10px] font-black uppercase text-white/60 mb-1 tracking-widest">Balance at Delivery</p>
                            <p className="text-4xl md:text-5xl font-black text-white italic tracking-tighter drop-shadow-lg">
                              ৳{(() => {
                                const total = Number(selectedOrder.total_amount);
                                const charge = parseFloat(selectedOrder.delivery_charge) || 0;
                                const adv = selectedOrder.is_advance_paid ? (selectedOrder.is_exclusive_order ? 500 : (selectedOrder.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge)) : 0;
                                return (selectedOrder.payment_status === 'Fully Paid' ? 0 : total - adv);
                              })().toLocaleString()}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 relative z-10">
                            <button onClick={() => togglePaymentStatus(selectedOrder, 'Advance Paid')} className={`h-11 px-6 rounded-2xl text-[9px] font-black uppercase transition-all shadow-xl ${selectedOrder.is_advance_paid ? 'bg-white text-[#ce112d]' : 'bg-black/30 text-white/60 border border-white/10'}`}>
                              {selectedOrder.is_advance_paid ? 'ADVANCE PAID' : 'SET ADVANCE'}
                            </button>
                            <button onClick={() => togglePaymentStatus(selectedOrder, 'Fully Paid')} className={`h-11 px-6 rounded-2xl text-[9px] font-black uppercase transition-all shadow-xl ${selectedOrder.payment_status === 'Fully Paid' ? 'bg-white text-[#ce112d]' : 'bg-black/30 text-white/60 border border-white/10'}`}>
                              {selectedOrder.payment_status === 'Fully Paid' ? 'FULLY PAID' : 'SET PAID'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section: Status Control */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <Clock size={16} className="text-orange-500" />
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Status Control</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {['Pending', 'Shipped', 'Delivered', 'Canceled'].map(status => (
                          <button
                            key={status}
                            onClick={() => updateOrderStatus(selectedOrder.id, status)}
                            className={`h-16 rounded-[28px] text-[10px] font-black uppercase tracking-widest border transition-all flex items-center justify-between px-6 ${selectedOrder.status === status
                              ? (status === 'Delivered' ? 'bg-green-500 border-green-500 text-white shadow-xl' :
                                status === 'Shipped' ? 'bg-blue-500 border-blue-500 text-white shadow-xl' :
                                  status === 'Canceled' ? 'bg-red-500 border-red-500 text-white shadow-xl' :
                                    'bg-yellow-500 border-yellow-500 text-black shadow-xl')
                              : 'bg-zinc-900 border-white/5 text-zinc-600 hover:border-white/20'
                              }`}
                          >
                            {status}
                            {selectedOrder.status === status && <Check size={14} strokeWidth={4} />}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-4 pt-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Order Notes</p>
                        <button onClick={() => updateOrderNote(selectedOrder.id, selectedOrder.customer_note)} className="w-full text-left p-6 bg-zinc-900 border border-white/5 rounded-[32px] min-h-[100px] flex flex-col justify-between group">
                          <p className={`text-sm italic font-medium leading-relaxed ${selectedOrder.customer_note ? 'text-zinc-300' : 'text-zinc-800'}`}>
                            {selectedOrder.customer_note || "No internal management notes added yet..."}
                          </p>
                          <p className="text-[9px] text-[#ce112d] font-black uppercase mt-4 opacity-40 group-hover:opacity-100 transition-all">Edit Note →</p>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Footer Action Mobile Only */}
                  <div className="md:hidden p-8 pt-2 border-t border-white/5 bg-black/40">
                    <button onClick={() => setSelectedOrder(null)} className="w-full py-5 bg-[#ce112d] text-white rounded-[24px] font-black uppercase tracking-[0.2em] text-[11px] shadow-2xl active:scale-[0.98] transition-all">
                      Done Management
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Desktop Split-View (Only show when NO selected order on mobile, but on Desktop it's always there) */}
            <div className="hidden lg:grid grid-cols-12 gap-8 h-[calc(100vh-450px)] min-h-[600px]">

              {/* LEFT: Order List Sidebar (4/12) */}
              <div className="col-span-4 flex flex-col space-y-4 overflow-y-auto pr-2 custom-scrollbar no-scrollbar">
                {(() => {
                  const productMap = {};
                  products.forEach(p => productMap[p.id] = p);

                  const filteredOrders = orders.filter(o => o && o.status !== 'Deleted');

                  if (filteredOrders.length === 0) return (
                    <div className="flex flex-col items-center justify-center h-full opacity-20 py-20 bg-zinc-900 shadow-xl border border-white/5 rounded-3xl">
                      <ShoppingBag size={48} />
                      <p className="mt-4 font-bold uppercase tracking-widest text-xs">No active orders</p>
                    </div>
                  );

                  return filteredOrders.map(o => {
                    const isSelected = selectedOrder?.id === o.id;
                    const amount = typeof o.total_amount === 'string'
                      ? parseFloat(o.total_amount.replace(/[^0-9.]/g, ''))
                      : parseFloat(o.total_amount);

                    return (
                      <div
                        key={o.id}
                        onClick={() => setSelectedOrder(o)}
                        className={`p-4 rounded-[24px] border transition-all duration-300 cursor-pointer group relative ${isSelected
                          ? 'bg-[#1d1d22] border-[#ce112d] shadow-[0_0_40px_-5px_rgba(206,17,45,0.15)] ring-1 ring-[#ce112d]/30'
                          : 'bg-[#121215]/50 border-[#1d1d21] hover:border-white/10 hover:bg-[#16161a]'
                          }`}
                      >
                        <div className="flex gap-4">
                          <div className="w-16 h-20 bg-zinc-950 rounded-2xl overflow-hidden shrink-0 border border-white/5 relative flex items-center justify-center">
                            {(() => {
                              // Aggressive Image Finder
                              const firstItemName = (o.product_name || '').split('(')[0]?.trim();
                              const firstItemSku = (o.product_name || '').match(/\(SKU:\s*([^)]*)\)/i)?.[1]?.trim();

                              const targetProduct =
                                products.find(p => p.id == o.product_id) ||
                                products.find(p => firstItemSku && (p.platform_id == firstItemSku || p.serial_no == firstItemSku)) ||
                                products.find(p => p.name === firstItemName) ||
                                products.find(p => p.name && firstItemName && p.name.toLowerCase().includes(firstItemName.toLowerCase()));

                              const thumb = getOptimizedUrl(targetProduct?.image_url || targetProduct?.images?.[0], mediaSizes.thumbnail);

                              return thumb ? (
                                <img src={thumb} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                              ) : (
                                <div className="text-zinc-800 flex flex-col items-center gap-1">
                                  <ShoppingBag size={20} />
                                  <span className="text-[6px] font-black uppercase text-zinc-900">No Image</span>
                                </div>
                              );
                            })()}
                            <div className={`absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent ${isSelected ? 'opacity-0' : 'opacity-100'}`} />
                          </div>

                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className={`text-[10px] font-black uppercase tracking-wider ${isSelected ? 'text-[#ce112d]' : 'text-zinc-600'}`}>
                                  {new Date(o.created_at).toLocaleDateString()}
                                </p>
                                <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider backdrop-blur-md border ${o.status === 'Pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                  o.status === 'Shipped' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                    o.status === 'Delivered' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
                                  }`}>
                                  {o.status}
                                </span>
                              </div>
                              <h4 className="text-[13px] font-black text-white leading-tight italic truncate uppercase group-hover:text-[#ce112d] transition-colors">
                                {o.product_name?.split('(')[0]?.trim() || 'Custom Order'}
                              </h4>
                              <p className="text-[11px] font-bold text-zinc-500 truncate flex items-center gap-1.5">
                                <User size={10} className="text-[#ce112d]/50" /> {o.customer_name}
                              </p>
                            </div>

                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.03]">
                              <p className="text-[12px] font-black text-[#ce112d]">৳{amount.toLocaleString()}</p>
                              <div className="flex items-center gap-1 text-[9px] font-black text-zinc-600 uppercase">
                                <MapPin size={10} /> {o.delivery_area}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* RIGHT: Detailed Command Center (8/12) */}
              <div className="col-span-8 bg-[#121215]/30 border border-[#1d1d21] rounded-[40px] overflow-hidden flex flex-col shadow-2xl relative">
                {!selectedOrder ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-6">
                    <div className="w-24 h-24 bg-zinc-900 rounded-[32px] flex items-center justify-center border border-white/5 shadow-xl animate-pulse">
                      <ShoppingBag size={40} className="text-zinc-700" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-zinc-300">Select an order to manage</h3>
                      <p className="text-zinc-500 text-sm mt-2 max-w-xs mx-auto">Complete details, customer info, and quick actions will appear here.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Detail Panel Header */}
                    <div className="p-8 bg-black/20 border-b border-[#1d1d21] flex items-center justify-between relative z-10 backdrop-blur-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-1.5 h-8 bg-gradient-to-b from-[#ce112d] to-[#ff1c3a] rounded-full shadow-[0_0_20px_rgba(206,17,45,0.4)]" />
                        <div>
                          <h3 className="text-2xl font-black italic uppercase tracking-tighter text-white">Order <span className="text-[#ce112d]">Command</span></h3>
                          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-[0.2em] mt-1">
                            Ref: #{selectedOrder.id.toString().slice(-6).toUpperCase()} • {new Date(selectedOrder.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyFullOrderDetails(selectedOrder)}
                          className="flex items-center gap-1.5 px-4 h-10 bg-[#ce112d]/10 hover:bg-[#ce112d] text-[#ce112d] hover:text-white rounded-xl border border-[#ce112d]/20 active:scale-95 transition-all text-xs font-black uppercase tracking-wider shadow-lg shadow-red-900/20"
                          title="Copy Full Order Details"
                        >
                          <Copy size={14} /> Copy Order Details
                        </button>
                        <button onClick={() => deleteOrder(selectedOrder.id)} className="w-10 h-10 flex items-center justify-center bg-red-500/5 text-red-500/50 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-red-500/10">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Detail Panel Content */}
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar no-scrollbar">

                      {/* Section 1: Customer & Logistics */}
                      <div className="grid grid-cols-2 gap-6">
                        <div className="bg-black/20 rounded-3xl p-6 border border-[#1d1d21] space-y-4">
                          <div className="flex items-center gap-2">
                            <User size={12} className="text-[#ce112d]" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#ce112d]">Customer Profile</p>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.2em] mb-1">Full Name</p>
                              <p className="text-lg font-bold text-white tracking-tight">{selectedOrder.customer_name}</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.2em] mb-1">Phone Number</p>
                              <p className="text-lg font-bold text-white">{selectedOrder.customer_phone}</p>
                            </div>
                            <div className="flex gap-2 pt-2">
                              <a href={`tel:${selectedOrder.customer_phone}`} className="flex-1 h-10 flex items-center justify-center bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-xl hover:bg-blue-500 hover:text-white transition-all text-[10px] font-black uppercase">Call Now</a>
                              <a href={`https://wa.me/${selectedOrder.customer_phone.replace(/[^0-9]/g, '')}`} target="_blank" className="flex-1 h-10 flex items-center justify-center bg-green-500/10 text-green-500 border border-green-500/20 rounded-xl hover:bg-green-500 hover:text-white transition-all text-[10px] font-black uppercase">WhatsApp</a>
                            </div>
                          </div>
                        </div>

                        <div className="bg-black/20 rounded-3xl p-6 border border-[#1d1d21] space-y-4">
                          <div className="flex items-center gap-2">
                            <MapPin size={12} className="text-zinc-500" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Shipping Details</p>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.2em] mb-1">Delivery Area</p>
                              <span className="inline-block bg-[#121215] text-zinc-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border border-[#1d1d21]">{selectedOrder.delivery_area}</span>
                            </div>
                            <div>
                              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.2em] mb-1">Full Address</p>
                              <p className="text-sm font-medium text-zinc-300 leading-relaxed">{selectedOrder.customer_address}</p>
                            </div>
                            <button onClick={() => copyToClipboard(selectedOrder.customer_address, "Address")} className="w-full h-10 flex items-center justify-center gap-2 bg-[#1d1d22] hover:bg-[#25252b] text-white rounded-xl transition-all text-[10px] font-black uppercase border border-white/5 shadow-lg">
                              <Copy size={14} /> Copy Address
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Items & Financials */}
                      <div className="bg-black/20 rounded-[32px] border border-[#1d1d21] overflow-hidden">
                        <div className="p-6 border-b border-[#1d1d21] flex justify-between items-center bg-white/[0.01]">
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Order Items & Summary</p>
                          <span className="text-[10px] font-black bg-[#ce112d] text-white px-3 py-1.5 rounded-full uppercase italic shadow-lg shadow-red-900/20 ring-1 ring-white/10">Items: {selectedOrder.product_name?.split('+').length || 1}</span>
                        </div>
                        <div className="p-6 space-y-6">
                          {(() => {
                            // Robust Parser for Item details
                            const parseLine = (str) => {
                              const res = { name: str, size: null, color: null, sku: null, qty: 1 };
                              const colorMatch = str.match(/\((?:Color|রঙ):\s*([^)]*)\)/i);
                              const sizeMatch = str.match(/\((?:Size|সাইজ):\s*([^)]*)\)/i);
                              const skuMatch = str.match(/\((?:SKU):\s*([^)]*)\)/i);
                              const qtyMatch = str.match(/\((?:Qty|পরিমাণ):\s*(\d+)\)/i);

                              if (colorMatch) res.color = colorMatch[1].trim();
                              if (sizeMatch) res.size = sizeMatch[1].trim();
                              if (skuMatch) res.sku = skuMatch[1].trim();
                              if (qtyMatch) res.qty = qtyMatch[1];

                              res.name = str.split('(')[0].trim();
                              return res;
                            };

                            const items = (selectedOrder.product_name || '').split(' + ').map(parseLine);
                            return items.map((item, idx) => {
                              const targetProduct =
                                products.find(p => p.id == selectedOrder.product_id && idx === 0) ||
                                products.find(p => item.sku && (p.platform_id == item.sku || p.serial_no == item.sku)) ||
                                products.find(p => p.name === item.name) ||
                                products.find(p => p.name && item.name && p.name.toLowerCase().includes(item.name.toLowerCase()));

                              const thumb = getOptimizedUrl(targetProduct?.image_url || targetProduct?.images?.[0], mediaSizes.thumbnail);

                              return (
                                <div key={idx} className="flex gap-6 items-start group">
                                  <div className="w-24 h-32 bg-[#121215] rounded-2xl overflow-hidden shrink-0 border border-[#1d1d21] relative shadow-2xl group-hover:scale-[1.02] transition-transform flex items-center justify-center">
                                    {thumb ? (
                                      <img src={thumb} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-zinc-800 bg-zinc-950/50">
                                        <ImageIcon size={32} />
                                      </div>
                                    )}
                                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-black text-white/50">
                                      #{targetProduct?.serial_no || idx + 1}
                                    </div>
                                  </div>
                                  <div className="flex-1 space-y-4 pt-1">
                                    <h4 className="text-xl font-bold text-white leading-tight italic group-hover:text-[#ce112d] transition-colors">{item.name}</h4>

                                    <div className="grid grid-cols-2 gap-3 max-w-md">
                                      <div className="bg-[#1d1d22] border border-[#ce112d]/10 p-3 rounded-2xl space-y-1">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-[#ce112d]/60">Size Spec</p>
                                        <p className={`text-[13px] font-black uppercase ${item.size || selectedOrder.size ? 'text-white' : 'text-zinc-700'}`}>
                                          {item.size || selectedOrder.size || 'Not Specified'}
                                        </p>
                                      </div>
                                      <div className="bg-[#1d1d22] border border-blue-500/10 p-3 rounded-2xl space-y-1">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-blue-500/60">Color Variant</p>
                                        <p className={`text-[13px] font-black uppercase ${item.color || selectedOrder.color ? 'text-white' : 'text-zinc-700'}`}>
                                          {item.color || selectedOrder.color || 'Not Specified'}
                                        </p>
                                      </div>
                                      <div className="bg-[#1d1d22] border border-zinc-800 p-3 rounded-2xl space-y-1">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600">Product SKU</p>
                                        <p className={`text-[11px] font-bold font-mono ${item.sku ? 'text-zinc-400' : 'text-zinc-800'}`}>
                                          {item.sku || 'No SKU'}
                                        </p>
                                      </div>
                                      <div className="bg-[#1d1d22] border border-green-500/10 p-3 rounded-2xl space-y-1">
                                        <p className="text-[8px] font-black uppercase tracking-widest text-green-500/60">Order Quantity</p>
                                        <p className="text-[13px] font-black text-white">
                                          {item.qty} UNIT(S)
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}

                          <div className="pt-6 border-t border-white/5 grid grid-cols-3 gap-6">
                            <div className="bg-zinc-950/50 p-4 rounded-2xl border border-white/5">
                              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Product Price</p>
                              <p className="text-xl font-black text-white italic">৳{selectedOrder.product_price.toLocaleString()}</p>
                            </div>
                            <div className="bg-zinc-950/50 p-4 rounded-2xl border border-white/5">
                              <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Delivery Charge</p>
                              <p className="text-xl font-black text-white italic">৳{selectedOrder.delivery_charge || 0}</p>
                            </div>
                            <div className="bg-[#ce112d]/5 p-4 rounded-2xl border border-[#ce112d]/10">
                              <p className="text-[9px] text-[#ce112d] font-bold uppercase tracking-widest mb-1">Advance Received</p>
                              <p className="text-xl font-black text-[#ce112d] italic">৳{(() => {
                                const charge = parseFloat(selectedOrder.delivery_charge) || 0;
                                return selectedOrder.is_advance_paid ? (selectedOrder.is_exclusive_order ? 500 : (selectedOrder.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge)) : 0;
                              })()}</p>
                            </div>
                          </div>

                          <div className="p-6 bg-[#ce112d] rounded-[24px] flex items-center justify-between shadow-2xl relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-r from-black/20 to-transparent pointer-events-none" />
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Total Due on Delivery</p>
                              <p className="text-4xl font-black text-white italic tracking-tighter">
                                ৳{(() => {
                                  const totalAmount = typeof selectedOrder.total_amount === 'string'
                                    ? Number(selectedOrder.total_amount.replace(/[^0-9.]/g, ''))
                                    : Number(selectedOrder.total_amount);
                                  const charge = parseFloat(selectedOrder.delivery_charge) || 0;
                                  const advanceAmount = selectedOrder.is_advance_paid ? (selectedOrder.is_exclusive_order ? 500 : (selectedOrder.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge)) : 0;
                                  return (selectedOrder.payment_status === 'Fully Paid' ? 0 : totalAmount - advanceAmount).toLocaleString();
                                })()}
                              </p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePaymentStatus(selectedOrder, 'Advance Paid'); }}
                                className={`px-6 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedOrder.is_advance_paid ? 'bg-white text-[#ce112d] shadow-xl' : 'bg-black/20 text-white/50 border border-white/10 hover:bg-black/30'}`}
                              >
                                {selectedOrder.is_advance_paid ? 'Advance Paid' : 'Mark Advance Paid'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); togglePaymentStatus(selectedOrder, 'Fully Paid'); }}
                                className={`px-6 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedOrder.payment_status === 'Fully Paid' ? 'bg-white text-[#ce112d] shadow-xl' : 'bg-black/20 text-white/50 border border-white/10 hover:bg-black/30'}`}
                              >
                                {selectedOrder.payment_status === 'Fully Paid' ? 'Fully Paid' : 'Mark Fully Paid'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Notes & Status Control */}
                      <div className="grid grid-cols-2 gap-8 pt-4">
                        <div className="space-y-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Internal Management Note</p>
                          <button
                            onClick={() => updateOrderNote(selectedOrder.id, selectedOrder.customer_note)}
                            className="w-full text-left p-6 bg-zinc-900 border border-white/5 rounded-[32px] hover:border-[#ce112d]/30 transition-all min-h-[120px] flex flex-col justify-between group"
                          >
                            <p className={`text-sm italic font-medium leading-relaxed ${selectedOrder.customer_note ? 'text-zinc-300' : 'text-zinc-700 font-bold'}`}>
                              {selectedOrder.customer_note || "Write an internal note for this order (visible only to admin)..."}
                            </p>
                            <p className="text-[10px] text-zinc-700 font-black uppercase mt-4 text-right group-hover:text-[#ce112d]">Click to Edit Note</p>
                          </button>
                        </div>
                        <div className="space-y-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Order Fulfilment Status</p>
                          <div className="grid grid-cols-1 gap-4">
                            {['Pending', 'Shipped', 'Delivered', 'Canceled'].map(status => (
                              <button
                                key={status}
                                onClick={() => updateOrderStatus(selectedOrder.id, status)}
                                className={`h-14 rounded-2xl text-xs font-black uppercase tracking-widest border transition-all flex items-center justify-between px-6 ${selectedOrder.status === status
                                  ? (status === 'Delivered' ? 'bg-green-500 border-green-500 text-white shadow-lg' :
                                    status === 'Shipped' ? 'bg-blue-500 border-blue-500 text-white shadow-lg' :
                                      status === 'Canceled' ? 'bg-red-500 border-red-500 text-white shadow-lg' :
                                        'bg-yellow-500 border-yellow-500 text-black shadow-lg')
                                  : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-zinc-500 hover:text-white'
                                  }`}
                              >
                                {status}
                                {selectedOrder.status === status && <CheckCircle2 size={16} />}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Mobile View remains unchanged for specialized experience */}
            <div className="lg:hidden space-y-4 pb-24">
              {(() => {
                const productMap = {};
                products.forEach(p => productMap[p.id] = p);

                return orders.filter(o => o && o.status !== 'Deleted').map(o => {
                  const product = productMap[o.product_id];
                  let productThumb = product?.image_url || product?.images?.[0];

                  return (
                    <div
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className="bg-zinc-900 border border-white/5 rounded-[24px] p-4 space-y-4 relative hover:border-[#ce112d]/30 transition-all cursor-pointer shadow-xl"
                    >
                      <div className="flex gap-4">
                        <div className="w-16 h-20 bg-black rounded-xl overflow-hidden shrink-0 relative border border-white/5">
                          {productThumb && <img src={getOptimizedUrl(productThumb, mediaSizes.thumbnail)} className="w-full h-full object-cover" alt="" />}
                          {product?.serial_no && (
                            <div className="absolute top-0 right-0 bg-[#ce112d] text-white text-[8px] font-bold px-1.5 py-0.5 rounded-bl">#{product.serial_no}</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-[13px] font-bold text-white truncate">{o.customer_name}</p>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase shrink-0 ${o.status === 'Pending' ? 'bg-yellow-500/10 text-yellow-500' : o.status === 'Shipped' ? 'bg-blue-500/10 text-blue-500' : o.status === 'Delivered' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                              {o.status}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {o.product_name?.split(' + ').map((item, idx) => (
                              <p key={idx} className="text-[10px] font-medium text-zinc-400 leading-tight truncate">
                                {item}
                              </p>
                            )) || <p className="text-[10px] font-medium text-zinc-400">Generic Item</p>}
                          </div>
                          <p className="text-xs text-[#ce112d] font-bold">৳{o.total_amount}</p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePaymentStatus(o, 'Advance Paid');
                            }}
                            className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase border transition-all ${o.payment_status === 'Advance Paid' ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20' : o.is_advance_paid && o.payment_status !== 'Fully Paid' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-black text-zinc-600 border-white/5'}`}
                          >
                            {o.is_exclusive_order ? 'Adv' : (o.delivery_area === 'mirsarai' && (parseFloat(o.delivery_charge) || 0) === 0 ? 'Conf' : 'Del')} Paid
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePaymentStatus(o, 'Fully Paid');
                            }}
                            className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase border transition-all ${o.payment_status === 'Fully Paid' ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/20' : 'bg-black text-zinc-600 border-white/5'}`}
                          >
                            Full Paid
                          </button>
                        </div>
                        <p className="text-[10px] font-bold text-zinc-500">{o.customer_phone}</p>
                      </div>

                      <button onClick={(e) => { e.stopPropagation(); deleteOrder(o.id); }} className="absolute bottom-4 right-4 text-zinc-700 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
            {orders.filter(o => o && o.status !== 'Deleted').length === 0 && !loading && (
              <div className="py-32 text-center space-y-4">
                <div className="w-20 h-20 bg-zinc-900 rounded-[32px] flex items-center justify-center mx-auto border border-white/5">
                  <ShoppingBag className="text-zinc-700" size={32} />
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-400 text-base font-bold">No orders found.</p>
                  <p className="text-zinc-600 text-sm">Waiting for new orders to arrive</p>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'deleted' ? (
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold uppercase tracking-tight text-white">Deleted <span className="text-[#ce112d]">Orders</span></h2>
                <p className="text-zinc-500 text-xs mt-3 uppercase font-bold tracking-widest bg-zinc-900 py-1.5 px-4 rounded-full border border-white/5 inline-block">{orders.filter(o => o && o.status === 'Deleted').length} Deleted Orders</p>
              </div>
              {orders.filter(o => o && o.status === 'Deleted').length > 0 && (
                <button
                  onClick={emptyBin}
                  className="flex items-center justify-center gap-2 px-6 h-12 bg-zinc-900 border border-white/10 rounded-2xl text-[11px] font-bold uppercase tracking-widest text-[#ce112d] hover:bg-[#ce112d] hover:text-white transition-all shadow-lg"
                >
                  <Trash2 size={16} /> Empty Bin
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {(() => {
                const productMap = {};
                products.forEach(p => productMap[p.id] = p);

                return orders.filter(o => o && o.status === 'Deleted').map(o => {
                  const product = productMap[o.product_id];
                  let productThumb = product?.image_url || product?.images?.[0];

                  return (
                    <div
                      key={o.id}
                      onClick={() => setSelectedOrder(o)}
                      className="bg-zinc-900 border border-white/5 rounded-[32px] overflow-hidden p-6 space-y-6 opacity-70 hover:opacity-100 transition-all border-dashed shadow-xl group cursor-pointer hover:border-[#ce112d]/30"
                    >
                      <div className="flex justify-between items-start">
                        <div className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">
                          {new Date(o.created_at).toLocaleDateString()} • {new Date(o.created_at).toLocaleTimeString()}
                        </div>
                        <span className="px-3 py-1 bg-red-500/10 text-red-500 text-[10px] font-bold uppercase rounded-lg border border-red-500/20">Deleted</span>
                      </div>

                      <div className="flex gap-4 p-3 bg-black/40 border border-white/5 rounded-[24px]">
                        <div className="w-16 h-20 bg-zinc-900 rounded-xl overflow-hidden flex-shrink-0 relative border border-white/5">
                          {productThumb ? (
                            <img src={getOptimizedUrl(productThumb, mediaSizes.thumbnail)} className="w-full h-full object-cover grayscale" alt="" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-800">
                              <ImageIcon size={20} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <p className="text-sm font-bold text-white leading-tight mb-1 truncate">{o.product_name}</p>
                          <p className="text-base font-bold text-[#ce112d]">৳{o.total_amount}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-white truncate">{o.customer_name}</p>
                          <p className="text-xs text-zinc-500 font-semibold">{o.customer_phone}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="text-[10px] font-bold uppercase text-zinc-400 truncate">{o.delivery_area}</p>
                          <p className="text-[10px] text-zinc-500 line-clamp-2 leading-relaxed">{o.customer_address}</p>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-4 border-t border-white/5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => restoreOrder(o.id)} className="flex-1 h-11 flex items-center justify-center gap-2 bg-green-500/10 text-green-500 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-green-500 hover:text-white transition-all shadow-lg shadow-green-500/10">
                          <RotateCcw size={14} /> Restore
                        </button>
                        <button onClick={() => permanentDeleteOrder(o.id)} className="flex-1 h-11 flex items-center justify-center gap-2 bg-zinc-800 text-zinc-400 rounded-xl text-[11px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                          <Trash2 size={14} /> Wipe
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            {orders.filter(o => o && o.status === 'Deleted').length === 0 && (
              <div className="py-32 text-center space-y-4">
                <div className="w-20 h-20 bg-zinc-900 rounded-[32px] flex items-center justify-center mx-auto border border-white/5 shadow-xl">
                  <Archive className="text-zinc-700" size={32} />
                </div>
                <div className="space-y-1">
                  <p className="text-zinc-400 text-lg font-bold">Trash is Empty</p>
                  <p className="text-zinc-600 text-sm font-medium">No deleted orders to show here</p>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'reviews' ? (
          <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {(() => {
                const avgRating = reviews.length > 0 ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length : 0;
                return (
                  <div className="col-span-1 md:col-span-2 lg:col-span-1 bg-zinc-900 border border-white/5 p-8 rounded-[40px] flex flex-col items-center justify-center text-center space-y-4 shadow-xl">
                    <p className="text-xs font-semibold uppercase text-zinc-500 tracking-[0.2em]">Avg Rating</p>
                    <div className="flex items-end gap-1">
                      <span className="text-6xl font-bold tracking-tighter text-white">{reviews.length > 0 ? avgRating.toFixed(1) : '—'}</span>
                      <span className="text-2xl font-bold text-[#ce112d] mb-2">/5</span>
                    </div>
                    <div className="flex gap-1.5 text-[#ce112d]">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} size={20} fill={s <= avgRating ? 'currentColor' : 'none'} className={s <= avgRating ? 'opacity-100' : 'opacity-20'} />
                      ))}
                    </div>
                    <p className="text-xs font-medium text-zinc-600 uppercase tracking-widest">Based on {reviews.length} reviews</p>
                  </div>
                );
              })()}

              <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-zinc-900 border border-white/5 p-8 rounded-[40px] space-y-6 shadow-xl">
                <p className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">Rating Distribution</p>
                <div className="space-y-4">
                  {[5, 4, 3, 2, 1].map(stars => {
                    const count = reviews.filter(r => r.rating === stars).length;
                    const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                    return (
                      <div key={stars} className="flex items-center gap-4">
                        <span className="text-xs font-bold text-zinc-500 w-4">{stars}</span>
                        <div className="flex-1 h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                          <div className="h-full bg-[#ce112d] transition-all duration-1000" style={{ width: `${percentage}%` }} />
                        </div>
                        <span className="text-xs font-bold text-zinc-400 w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <h3 className="text-xl font-bold uppercase tracking-tight text-zinc-400 border-b border-white/5 pb-4">Recent <span className="text-white">Feedback</span></h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {reviews.map(r => (
                  <div key={r.id} className="bg-zinc-900 border border-white/5 rounded-3xl p-6 space-y-4 hover:border-zinc-700 transition-all shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} size={16} className={s <= r.rating ? 'text-yellow-500 fill-yellow-500' : 'text-zinc-800'} />
                        ))}
                      </div>
                      <span className="text-[11px] text-zinc-500 font-bold">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    {r.comment && (
                      <p className="text-sm text-zinc-300 leading-relaxed font-medium">"{r.comment}"</p>
                    )}
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                      <p className="text-xs text-zinc-400 font-bold">{r.customer_name || 'Anonymous'}</p>
                      {r.product_name && <p className="text-[10px] text-zinc-600 font-bold uppercase truncate max-w-[120px]">{r.product_name}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {reviews.length === 0 && (
                <div className="py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto border border-white/5">
                    <Star className="text-zinc-800" size={32} />
                  </div>
                  <p className="text-zinc-500 text-sm font-bold">No reviews submitted yet.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                <div>
                  <h2 className="text-3xl font-bold uppercase tracking-tight text-white">
                    {activeTab === 'published' ? 'Published' : activeTab === 'pending' ? 'Pending' : 'Sold Out'} <span className="text-[#ce112d]">Feed</span>
                  </h2>
                  <div className="flex items-center gap-3 flex-wrap mt-3">
                    <p className="text-zinc-500 text-xs uppercase font-bold tracking-widest bg-zinc-900 py-1.5 px-4 rounded-full border border-white/5 inline-block">
                      {products.filter(p => {
                        if (!p) return false;
                        if (activeTab === 'soldout') return p.is_sold_out;
                        return p.status === activeTab && !p.is_sold_out;
                      }).length} Items in Tab
                    </p>
                    {hasMoreProducts && (
                      <>
                        <button
                          type="button"
                          onClick={handleLoadMoreProducts}
                          disabled={loading}
                          className="flex items-center gap-1.5 text-xs font-bold text-[#ce112d] bg-[#ce112d]/10 hover:bg-[#ce112d]/20 px-3.5 py-1.5 rounded-full border border-[#ce112d]/20 transition-all active:scale-95 disabled:opacity-50"
                        >
                          {loading ? <RotateCcw size={12} className="animate-spin" /> : <Plus size={12} />}
                          <span>Load 100 More</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleLoadAllProducts}
                          disabled={loading}
                          className="flex items-center gap-1.5 text-xs font-bold text-white bg-zinc-800 hover:bg-zinc-700 px-3.5 py-1.5 rounded-full border border-white/10 transition-all active:scale-95 disabled:opacity-50"
                        >
                          <Sparkles size={12} className="text-amber-400" />
                          <span>Load All Products</span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowRangeDeleteModal(true)}
                      className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-1.5 rounded-full border border-red-500/20 transition-all active:scale-95 ml-auto"
                    >
                      <Trash2 size={12} />
                      <span>Delete Serial Range</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Filter Controls Bar: Search + Category Dropdown + Subcategory Dropdown ── */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-zinc-900/60 p-3.5 rounded-2xl border border-white/5 backdrop-blur-md">
                {/* Search Bar */}
                <div className="sm:col-span-4 relative group">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-[#ce112d] transition-colors" />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-black/50 border border-zinc-800 pl-10 pr-4 h-11 rounded-xl text-xs font-medium focus:border-zinc-500 outline-none transition-all placeholder:text-zinc-600 text-white"
                    placeholder="Search name, SKU, serial..."
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Category Dropdown Filter */}
                <div className="sm:col-span-4 relative">
                  <select
                    value={selectedCategoryFilter}
                    onChange={e => {
                      setSelectedCategoryFilter(e.target.value);
                      setSelectedSubcategoryFilter('All'); // Reset subcategory when category changes
                    }}
                    className={`w-full bg-black/50 border h-11 px-3.5 rounded-xl text-xs font-bold outline-none transition-all appearance-none cursor-pointer pr-9 ${
                      selectedCategoryFilter !== 'All' ? 'border-[#ce112d] text-white bg-[#ce112d]/10' : 'border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <option value="All" className="bg-zinc-900 text-white">All Categories (সব ক্যাটাগরি)</option>
                    {TOP_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id} className="bg-zinc-900 text-white">
                        {cat.en} ({cat.bn})
                      </option>
                    ))}
                    <option value="__uncategorized__" className="bg-zinc-900 text-amber-400 font-bold">
                      Uncategorized (ক্যাটাগরি নেই)
                    </option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>

                {/* Subcategory Dropdown Filter */}
                <div className="sm:col-span-4 relative">
                  <select
                    value={selectedSubcategoryFilter}
                    onChange={e => setSelectedSubcategoryFilter(e.target.value)}
                    className={`w-full bg-black/50 border h-11 px-3.5 rounded-xl text-xs font-bold outline-none transition-all appearance-none cursor-pointer pr-9 ${
                      selectedSubcategoryFilter !== 'All' ? 'border-rose-500 text-white bg-rose-500/10' : 'border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <option value="All" className="bg-zinc-900 text-white">All Subcategories (সব সাব-ক্যাটাগরি)</option>
                    {(() => {
                      const merged = mergeWithDynamic(subcategoriesData);
                      let subsToDisplay = [];
                      if (selectedCategoryFilter && selectedCategoryFilter !== 'All' && selectedCategoryFilter !== '__uncategorized__') {
                        subsToDisplay = merged[selectedCategoryFilter] || [];
                      } else {
                        const seen = new Set();
                        Object.values(merged).forEach(list => {
                          (list || []).forEach(sub => {
                            if (!seen.has(sub.id)) {
                              seen.add(sub.id);
                              subsToDisplay.push(sub);
                            }
                          });
                        });
                      }
                      return subsToDisplay.map(sub => (
                        <option key={sub.id} value={sub.id} className="bg-zinc-900 text-white">
                          {sub.name_en || sub.en} ({sub.name_bn || sub.bn})
                        </option>
                      ));
                    })()}
                    <option value="__no_subcategory__" className="bg-zinc-900 text-amber-400 font-bold">
                      No Subcategory / Uncategorized (সাব-ক্যাটাগরি নেই)
                    </option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Active Filter Indicators */}
              {(selectedCategoryFilter !== 'All' || selectedSubcategoryFilter !== 'All' || searchTerm) && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                    <Filter size={12} className="text-[#ce112d]" /> Filters Active:
                  </span>
                  {selectedCategoryFilter !== 'All' && (
                    <span className="px-2.5 py-1 rounded-lg bg-[#ce112d]/15 border border-[#ce112d]/30 text-white text-[11px] font-bold flex items-center gap-1.5">
                      Cat: {selectedCategoryFilter === '__uncategorized__' ? 'Uncategorized' : selectedCategoryFilter}
                      <button onClick={() => setSelectedCategoryFilter('All')} className="hover:text-red-300"><X size={12} /></button>
                    </span>
                  )}
                  {selectedSubcategoryFilter !== 'All' && (
                    <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-white text-[11px] font-bold flex items-center gap-1.5">
                      Subcat: {selectedSubcategoryFilter === '__no_subcategory__' ? 'No Subcategory' : selectedSubcategoryFilter}
                      <button onClick={() => setSelectedSubcategoryFilter('All')} className="hover:text-rose-300"><X size={12} /></button>
                    </span>
                  )}
                  {searchTerm && (
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-800 border border-white/10 text-zinc-300 text-[11px] font-bold flex items-center gap-1.5">
                      Search: "{searchTerm}"
                      <button onClick={() => setSearchTerm('')} className="hover:text-white"><X size={12} /></button>
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setSelectedCategoryFilter('All');
                      setSelectedSubcategoryFilter('All');
                      setSearchTerm('');
                    }}
                    className="text-[10px] font-bold text-zinc-400 hover:text-white underline underline-offset-2 ml-1"
                  >
                    Reset All Filters
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {products.filter(p => {
                if (!p) return false;
                
                // Status filter based on active tab
                if (activeTab === 'soldout') {
                  if (!p.is_sold_out) return false;
                } else if (activeTab === 'pending' || activeTab === 'published') {
                  if (p.status !== activeTab || p.is_sold_out) return false;
                } else {
                  return false;
                }

                // Search term matching
                const term = searchTerm.toLowerCase().trim();
                const matchesSearch = !term ||
                  (p.name && p.name.toLowerCase().includes(term)) ||
                  (p.description && p.description.toLowerCase().includes(term)) ||
                  (p.platform_id && p.platform_id.toLowerCase().includes(term)) ||
                  (p.serial_no && String(p.serial_no).includes(term));
                if (!matchesSearch) return false;

                // Category filter matching (including uncategorized)
                if (selectedCategoryFilter !== 'All') {
                  if (selectedCategoryFilter === '__uncategorized__') {
                    const isUncategorized = !p.category || p.category.trim() === '' || p.category === 'Uncategorized';
                    if (!isUncategorized) return false;
                  } else {
                    if (p.category !== selectedCategoryFilter) return false;
                  }
                }

                // Subcategory filter matching (including no subcategory)
                if (selectedSubcategoryFilter !== 'All') {
                  if (selectedSubcategoryFilter === '__no_subcategory__') {
                    const hasNoSub = !p.subcategory || p.subcategory.trim() === '' || p.subcategory === 'Uncategorized';
                    if (!hasNoSub) return false;
                  } else {
                    const matchesSub = p.subcategory && (
                      p.subcategory.toLowerCase() === selectedSubcategoryFilter.toLowerCase() ||
                      p.subcategory.toLowerCase().includes(selectedSubcategoryFilter.toLowerCase())
                    );
                    if (!matchesSub) return false;
                  }
                }

                return true;
              }).map(p => {
                let displayImage = getOptimizedUrl(p.image_url || p.images?.[0], mediaSizes.thumbnail);
                if (!displayImage || displayImage.includes('via.placeholder')) {
                  displayImage = null;
                }

                return (
                  <div key={p.id} className="group bg-zinc-900 border border-white/5 rounded-[32px] overflow-hidden hover:border-[#ce112d]/30 transition-all duration-300 shadow-xl">

                    {/* ── Top section: Image + Details ── */}
                    <div className="flex gap-5 p-4">

                      {/* Thumbnail */}
                      <div
                        className="w-24 h-32 sm:w-28 sm:h-36 rounded-2xl overflow-hidden shrink-0 bg-black relative cursor-pointer border border-white/5 shadow-lg group-hover:scale-[1.02] transition-transform"
                        onClick={() => p.video_url ? setPreviewVideo(p.video_url) : null}
                      >
                        {displayImage ? (
                          <img
                            src={displayImage}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            alt={p.name}
                            onError={(e) => {
                              if (e.currentTarget.src.includes('images.weserv.nl') && (p.image_url || p.images?.[0])) {
                                e.currentTarget.src = p.image_url || p.images[0];
                              }
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
                            {p.video_url ? <Play size={24} /> : <ImageIcon size={24} />}
                          </div>
                        )}
                        {p.is_sold_out && (
                          <div className="absolute inset-0 bg-red-600/60 backdrop-blur-[2px] flex items-center justify-center">
                            <span className="text-[10px] font-bold text-white uppercase tracking-widest">Sold Out</span>
                          </div>
                        )}
                        {p.serial_no && (
                          <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-lg border border-white/10">
                            #{p.serial_no}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                        <div className="space-y-2">
                          <h4 className="text-sm sm:text-base font-bold text-white leading-tight line-clamp-2" title={p.name}>
                            {p.name || <span className="text-zinc-600">Unnamed Product</span>}
                          </h4>

                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-[#ce112d] text-lg font-bold">৳{p.price}</span>
                            {p.original_price && p.original_price > p.price && (
                              <span className="text-zinc-500 line-through text-xs font-semibold">
                                ৳{p.original_price}
                              </span>
                            )}
                            <span className={`text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border ${p.status === 'published' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>
                              {p.status === 'published' ? 'Live' : 'Draft'}
                            </span>
                          </div>
                        </div>

                        {/* Meta badges */}
                        <div className="flex flex-wrap gap-2 mt-auto">
                          {p.stock_count !== null && (
                            <span className={`text-[10px] font-bold px-3 py-1 rounded-lg border ${p.stock_count <= 3 ? 'bg-red-500/10 text-red-500 border-red-500/20' : p.stock_count <= 8 ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-zinc-800 text-zinc-400 border-white/5'}`}>
                              STOCK: {p.stock_count}
                            </span>
                          )}
                          {p.available_colors?.length > 0 && (
                            <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-white/5 px-3 py-1 rounded-lg uppercase">
                              VARIANTS: {p.available_colors.length}
                            </span>
                          )}
                          {p.platform_id && (
                            <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-white/5 px-3 py-1 rounded-lg truncate max-w-[120px] uppercase">
                              ID: {p.platform_id}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Actions Row ── */}
                    <div className="flex items-stretch border-t border-white/5 bg-black/20 divide-x divide-white/5">
                      <button
                        onClick={() => startEdit(p)}
                        className="flex-1 flex flex-col items-center justify-center gap-1.5 py-4 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all group/btn"
                      >
                        <Edit size={16} className="group-hover/btn:scale-110 transition-transform" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Edit</span>
                      </button>

                      {(activeTab === 'pending' || (activeTab === 'soldout' && p.status === 'pending')) && (
                        <button
                          onClick={() => setConfirmation({
                            isOpen: true,
                            title: 'Publish Product',
                            message: 'Are you sure you want to Publish this product to the main site?',
                            confirmText: 'Publish',
                            onConfirm: () => {
                              setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: 'published' } : x));
                              bigBazarApi.from('products').update({ status: 'published' }).eq('id', p.id).then(fetchProducts);
                            }
                          })}
                          className="flex-1 flex flex-col items-center justify-center gap-1.5 py-4 text-green-500 hover:bg-green-500/10 transition-all group/btn"
                        >
                          <CheckCircle2 size={16} className="group-hover/btn:scale-110 transition-transform" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Live</span>
                        </button>
                      )}

                      {(activeTab === 'published' || (activeTab === 'soldout' && p.status === 'published')) && (
                        <button
                          onClick={() => setConfirmation({
                            isOpen: true,
                            title: 'Unpublish Product',
                            message: 'Are you sure you want to move this product back to Pending/Drafts?',
                            confirmText: 'Unpublish',
                            onConfirm: () => {
                              setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: 'pending' } : x));
                              bigBazarApi.from('products').update({ status: 'pending' }).eq('id', p.id).then(fetchProducts);
                            }
                          })}
                          className="flex-1 flex flex-col items-center justify-center gap-1.5 py-4 text-yellow-500 hover:bg-yellow-500/10 transition-all group/btn"
                        >
                          <Clock size={16} className="group-hover/btn:scale-110 transition-transform" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Draft</span>
                        </button>
                      )}

                      <button
                        onClick={() => setConfirmation({
                          isOpen: true,
                          title: p.is_exclusive ? 'Remove Exclusive Status' : 'Mark as Exclusive/Premium',
                          message: p.is_exclusive ? 'আপনি কি নিশ্চিত যে পণ্যটি আর এক্সক্লুসিভ নয়?' : 'আপনি কি এই পণ্যটিকে Exclusive/Premium হিসেবে চিহ্নিত করতে চান?',
                          confirmText: 'Confirm',
                          onConfirm: () => bigBazarApi.from('products').update({ is_exclusive: !p.is_exclusive }).eq('id', p.id).then(fetchProducts)
                        })}
                        className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all ${p.is_exclusive ? 'bg-orange-500/10 text-orange-400' : 'text-neutral-500 hover:text-orange-400 hover:bg-orange-500/10'}`}
                      >
                        <Star size={15} className={p.is_exclusive ? "fill-orange-400" : ""} />
                        <span className="text-[9px] font-black uppercase text-center leading-tight">PREMIUM</span>
                      </button>

                      <button
                        onClick={() => setConfirmation({
                          isOpen: true,
                          title: p.is_sold_out ? 'Mark as Available' : 'Mark as Sold Out',
                          message: p.is_sold_out ? 'আপনি কি নিশ্চিত যে পণ্যটি স্টকে আছে?' : 'আপনি কি এই পণ্যটিকে Sold Out হিসেবে চিহ্নিত করতে চান?',
                          confirmText: 'Confirm',
                          onConfirm: () => bigBazarApi.from('products').update({ is_sold_out: !p.is_sold_out }).eq('id', p.id).then(fetchProducts)
                        })}
                        className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all ${p.is_sold_out ? 'bg-[#ce112d] text-white' : 'text-neutral-500 hover:text-red-400 hover:bg-red-500/10'}`}
                      >
                        <ShoppingBag size={15} />
                        <span className="text-[9px] font-black uppercase">{p.is_sold_out ? 'Resell' : 'Sold'}</span>
                      </button>

                      <button
                        onClick={() => deleteProduct(p.id)}
                        className="flex-1 flex flex-col items-center gap-1 py-3 text-neutral-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <Trash2 size={15} />
                        <span className="text-[9px] font-black uppercase">Del</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMoreProducts && (
              <div className="pt-6 pb-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={handleLoadMoreProducts}
                  disabled={loading}
                  className="flex items-center gap-2 bg-[#ce112d] hover:bg-[#b00e26] text-white px-8 py-3.5 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-red-900/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  {loading ? <RotateCcw size={16} className="animate-spin" /> : <Plus size={16} />}
                  <span>Load More Products ({products.length} Loaded)</span>
                </button>
                <button
                  type="button"
                  onClick={handleLoadAllProducts}
                  disabled={loading}
                  className="text-xs text-zinc-400 hover:text-white font-semibold underline underline-offset-4"
                >
                  Load All Live &amp; Draft Products
                </button>
              </div>
            )}
          </div>
        )
        }
      </main>

      {/* Video Preview Modal */}
      {
        previewVideo && (
          <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setPreviewVideo(null)}>
            <div className="relative w-full max-w-sm bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setPreviewVideo(null)}
                className="absolute top-4 right-4 z-20 p-2 bg-black/50 text-white rounded-full backdrop-blur-md"
              >
                <X size={20} />
              </button>
              <div className="aspect-[9/16]">
                <VideoPlayer src={previewVideo} isActive={true} priority={true} />
              </div>
            </div>
          </div>
        )
      }
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />

      {/* Bulk Serial Range Delete Modal */}
      {showRangeDeleteModal && (
        <div className="fixed inset-0 z-[110] bg-black/90 flex items-center justify-center p-4 backdrop-blur-md" onClick={() => setShowRangeDeleteModal(false)}>
          <div className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl p-6 space-y-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xl font-bold uppercase tracking-tight text-white flex items-center gap-2">
                  <Trash2 size={20} className="text-[#ce112d]" />
                  Delete <span className="text-[#ce112d]">Serial Range</span>
                </h3>
                <p className="text-zinc-500 text-xs mt-1">Delete all products within a serial number range</p>
              </div>
              <button onClick={() => setShowRangeDeleteModal(false)} className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Start Serial #</label>
                  <input
                    type="number"
                    value={rangeStart}
                    onChange={e => setRangeStart(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full bg-black border border-zinc-800 h-11 px-3 rounded-xl text-sm font-bold text-white outline-none focus:border-[#ce112d]/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">End Serial #</label>
                  <input
                    type="number"
                    value={rangeEnd}
                    onChange={e => setRangeEnd(e.target.value)}
                    placeholder="e.g. 200"
                    className="w-full bg-black border border-zinc-800 h-11 px-3 rounded-xl text-sm font-bold text-white outline-none focus:border-[#ce112d]/50"
                  />
                </div>
              </div>

              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-1">
                <p className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle size={14} /> Warning: Permanent Action
                </p>
                <p className="text-[11px] text-zinc-400">
                  This will permanently delete all products with Serial numbers between #{rangeStart || '1'} and #{rangeEnd || '200'} from the database.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRangeDeleteModal(false)}
                className="flex-1 h-12 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleBulkDeleteBySerialRange}
                className="flex-1 h-12 bg-[#ce112d] hover:bg-[#b00e26] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-red-900/30 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <RotateCcw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                <span>Delete #{rangeStart} - #{rangeEnd}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Overlay during Bulk Range Delete */}
      {deletingRangeProgress && (
        <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 bg-[#ce112d]/10 border border-[#ce112d]/20 rounded-2xl flex items-center justify-center mx-auto text-[#ce112d]">
              <RotateCcw size={32} className="animate-spin" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-white uppercase tracking-tight">Deleting Products...</h4>
              <p className="text-xs text-zinc-400 mt-1 font-mono">
                Deleting item {deletingRangeProgress.current} of {deletingRangeProgress.total}
              </p>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#ce112d] h-full transition-all duration-200"
                style={{ width: `${(deletingRangeProgress.current / deletingRangeProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile/Shared Detail Modal restricted to appropriate tabs */}
      {selectedOrder && (activeTab !== 'orders' && activeTab !== 'pending-items') && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md" onClick={() => setSelectedOrder(null)}>
          {(() => {
            // ── Parser ──────────────────────────────────────────────
            const parseOrderItem = (str) => {
              let s = str.trim();
              let quantity = 1;
              let sku = null;
              let size = null;
              let color = null;

              const structuredMatch = s.match(/^(.*?)\s*(?:\((?:Color|রঙ):\s*([^)]*)\))?\s*(?:\((?:Size|সাইজ):\s*([^)]*)\))?\s*(?:\((?:SKU):\s*([^)]*)\))?\s*(?:\((?:Qty|পরিমাণ):\s*(\d+)\))?\s*$/i);
              if (structuredMatch && (structuredMatch[2] || structuredMatch[3] || structuredMatch[4] || structuredMatch[5])) {
                return {
                  name: structuredMatch[1].trim() || 'Unknown Item',
                  color: structuredMatch[2]?.trim() || null,
                  size: structuredMatch[3]?.trim() || null,
                  sku: structuredMatch[4]?.trim() || null,
                  quantity: parseInt(structuredMatch[5] || '1')
                };
              }

              const qtyMatch = s.match(/^(.*)\s+(\d+)\s*(?:piece|pc)\s*$/i);
              if (qtyMatch) {
                quantity = parseInt(qtyMatch[2]);
                s = qtyMatch[1].trim();
              }

              const skuMatch = s.match(/^(.*)\s*\(SKU:\s*([^)]*)\)\s*$/i);
              if (skuMatch) {
                sku = skuMatch[2].trim();
                s = skuMatch[1].trim();
              } else {
                const truncatedSku = s.match(/^(.*)\s*\(SKU:\s*([^)]*)\s*$/i);
                if (truncatedSku) {
                  sku = truncatedSku[2].trim() + '…';
                  s = truncatedSku[1].trim();
                }
              }

              const sizeMatch = s.match(/^(.*)\s+(.+?)\s+size\s*$/i);
              if (sizeMatch) {
                size = sizeMatch[2].trim();
                s = sizeMatch[1].trim();
              }

              const colorMatch = s.match(/^(.*)\s+(.+?)\s+color\s*$/i);
              if (colorMatch) {
                color = colorMatch[2].trim();
                s = colorMatch[1].trim();
              }

              return { name: s.trim() || 'Unknown Item', color, size, sku, quantity };
            };

            const productByName = {};
            const productBySku = {};
            products.forEach(p => {
              if (p.name) productByName[p.name.toLowerCase().trim()] = p;
              if (p.platform_id) productBySku[p.platform_id.toLowerCase().trim()] = p;
              if (p.available_colors) {
                p.available_colors.forEach(c => {
                  if (typeof c === 'object' && c.sizes) {
                    c.sizes.forEach(sz => {
                      if (typeof sz === 'object' && sz.sku) {
                        productBySku[sz.sku.toLowerCase().trim()] = p;
                      }
                    });
                  }
                });
              }
            });

            const rawParts = (selectedOrder.product_name || '').split(' + ');
            const parsedItems = rawParts.map(parseOrderItem);

            const alreadyUsedIds = new Set();
            const detailedItems = parsedItems.map((item, idx) => {
              const isTruncatedSku = item.sku?.endsWith('…');
              let p = idx === 0 ? products.find(pr => pr.id == selectedOrder.product_id) : null;

              if (!p && !isTruncatedSku) {
                if (item.sku && item.sku.length > 2) {
                  const candidate = productBySku[item.sku.toLowerCase().trim()];
                  if (candidate && !alreadyUsedIds.has(candidate.id)) p = candidate;
                }
                if (!p && item.name) {
                  const candidate = productByName[item.name.toLowerCase().trim()];
                  if (candidate && !alreadyUsedIds.has(candidate.id)) p = candidate;
                }
                if (!p && item.name && item.name.length > 2) {
                  const needle = item.name.toLowerCase().trim();
                  p = products.find(pr =>
                    !alreadyUsedIds.has(pr.id) && (
                      pr.name?.toLowerCase().includes(needle) ||
                      needle.includes(pr.name?.toLowerCase())
                    )
                  );
                }
              }

              if (p) alreadyUsedIds.add(p.id);

              const unitPrice = (parsedItems.length === 1)
                ? (Number(selectedOrder.product_price) / item.quantity)
                : (p?.price || 0);

              return { ...item, p, unitPrice };
            });

            const derivedItemsSubtotal = detailedItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
            const totalQty = detailedItems.reduce((s, i) => s + i.quantity, 0);
            const derivedTotalAmount = Number(derivedItemsSubtotal) + Number(selectedOrder.delivery_charge || 0);

            return (
              <div className="relative w-full max-w-lg bg-neutral-950 rounded-[40px] overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[85vh] sm:max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="h-1.5 bg-gradient-to-r from-transparent via-[#ce112d] to-transparent opacity-80 flex-shrink-0" />

                <div className="px-8 pt-8 pb-5 flex justify-between items-center bg-neutral-950 border-b border-white/5 relative z-30 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-8 bg-[#ce112d] rounded-full shadow-[0_0_15px_rgba(206,17,45,0.4)]" />
                    <div>
                      <h3 className="text-2xl font-black italic uppercase tracking-tighter leading-none">Order <span className="text-[#ce112d]">Details</span></h3>
                      <p className="text-[9px] text-neutral-500 font-black uppercase tracking-[0.2em] mt-1.5 opacity-60">
                        {new Date(selectedOrder.created_at).toLocaleDateString('bn-BD')} • {new Date(selectedOrder.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedOrder(null)} className="p-2.5 bg-white/5 hover:bg-[#ce112d] hover:text-white text-neutral-600 rounded-full transition-all border border-white/5">
                    <X size={20} className="stroke-2" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-7 custom-scrollbar shadow-inner">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500">
                          Ordered Items <span className="text-[#ce112d]">({detailedItems.length})</span>
                        </p>
                      </div>

                      {detailedItems.map((item, idx) => {
                        const { p, unitPrice } = item;
                        const thumb = p?.image_url || p?.images?.[0];
                        const colorObj = p?.available_colors?.find(c => (typeof c === 'object' ? c.name : c) === item.color);
                        const hex = typeof colorObj === 'object' ? colorObj.hex : null;

                        return (
                          <div key={idx} className="relative overflow-hidden bg-neutral-900/50 rounded-[20px] border border-white/5 p-4 hover:border-white/10 transition-all">
                            <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                              <span className="text-[8px] font-black text-neutral-500">{idx + 1}</span>
                            </div>
                            <div className="flex gap-4">
                              <div className="w-16 h-20 bg-neutral-900 rounded-xl overflow-hidden shrink-0 border border-white/10 relative">
                                {thumb ? <img src={getOptimizedUrl(thumb, mediaSizes.thumbnail)} className="w-full h-full object-cover" alt={item.name} /> : <div className="w-full h-full flex items-center justify-center text-neutral-800"><ImageIcon size={20} /></div>}
                                {p?.serial_no && <div className="absolute top-0 left-0 bg-[#ce112d] text-white text-[6px] font-black px-1 rounded-br">#{p.serial_no}</div>}
                              </div>
                              <div className="flex-1 min-w-0 space-y-2 pr-5">
                                <div className="flex justify-between items-start gap-2">
                                  <p className="text-xs font-black text-white uppercase italic leading-snug truncate pr-2">{item.name || 'Unknown Item'}</p>
                                  <span className="text-xs font-black text-[#ce112d] italic shrink-0">৳{unitPrice}</span>
                                </div>
                                {item.sku && <p className="text-[9px] font-mono text-neutral-600 tracking-wider">SKU: <span className="text-neutral-400">{item.sku}</span></p>}
                                <div className="flex flex-wrap gap-1.5">
                                  {item.size && !['size', 'সাইজ'].includes(item.size.toLowerCase()) && (
                                    <span className="text-[9px] font-black bg-[#ce112d]/10 text-[#ce112d] px-2 py-0.5 rounded border border-[#ce112d]/20 uppercase">{item.size}</span>
                                  )}
                                  {item.color && !['color', 'কালার'].includes(item.color.toLowerCase()) && (
                                    <div className="flex items-center gap-1 bg-white/5 text-white px-2 py-0.5 rounded border border-white/10">
                                      {hex && <div className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: hex }} />}
                                      <span className="text-[9px] font-black uppercase">{item.color}</span>
                                    </div>
                                  )}
                                  <span className="text-[9px] font-black bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">×{item.quantity} pcs</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <div className="mt-2 rounded-[24px] border border-white/10 overflow-hidden bg-neutral-900/30">
                        <div className="px-5 py-3 bg-white/[0.03] border-b border-white/5">
                          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-neutral-500">Order Summary</p>
                        </div>
                        <div className="px-5 py-4 space-y-3">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-neutral-500 font-bold uppercase tracking-wider">Subtotal ({totalQty} items)</span>
                            <span className="font-black text-white italic">৳{derivedItemsSubtotal}</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-neutral-500 font-bold uppercase tracking-wider">Delivery Charge</span>
                            <span className="font-black text-white italic">৳{selectedOrder.delivery_charge || 0}</span>
                          </div>

                          <div className="flex justify-between items-center py-3 border-y border-white/5">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Total Order Value</span>
                            <span className="text-xl font-black text-white italic">৳{derivedTotalAmount}</span>
                          </div>

                          {selectedOrder.is_advance_paid && (
                            <div className="flex justify-between text-[11px] bg-orange-500/5 p-2 rounded-lg border border-orange-500/10">
                              <span className="text-orange-500 font-bold uppercase tracking-wider">Advance / Partial Paid</span>
                              <span className="font-black text-orange-400 italic">-৳{(() => {
                                const charge = parseFloat(selectedOrder.delivery_charge) || 0;
                                return selectedOrder.is_exclusive_order ? 500 : (selectedOrder.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge);
                              })()}</span>
                            </div>
                          )}

                          <div className="flex justify-between items-center pt-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#ce112d]">Due on Delivery</span>
                            <span className="text-2xl font-black text-[#ce112d] italic">৳{(() => {
                              const charge = parseFloat(selectedOrder.delivery_charge) || 0;
                              const adv = selectedOrder.is_exclusive_order ? 500 : (selectedOrder.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge);
                              return selectedOrder.payment_status === 'Fully Paid' ? 0 : (selectedOrder.is_advance_paid ? derivedTotalAmount - adv : derivedTotalAmount);
                            })()}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Consolidated Customer & Delivery Details */}
                    <div className="bg-neutral-900/50 rounded-[32px] border border-white/10 p-6 space-y-6 shadow-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-4 bg-[#ce112d] rounded-full" />
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-500">Customer & Shipping Info</p>
                      </div>

                      <div className="space-y-6">
                        {/* Name & ID Group */}
                        <div className="flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center text-neutral-500 group-hover:bg-[#ce112d]/10 group-hover:text-[#ce112d] transition-all">
                              <User size={20} strokeWidth={2.5} />
                            </div>
                            <div>
                              <p className="text-[8px] font-black uppercase text-neutral-600 tracking-widest mb-0.5">Full Name</p>
                              <p className="text-base font-black text-white tracking-tight">{selectedOrder.customer_name}</p>
                            </div>
                          </div>
                          <button onClick={() => copyToClipboard(selectedOrder.customer_name, "Name")} className="p-3 bg-neutral-900 hover:bg-[#ce112d] text-neutral-600 hover:text-white rounded-2xl transition-all shadow-lg active:scale-90">
                            <Copy size={14} />
                          </button>
                        </div>

                        {/* Phone Group - Fixed Clipping */}
                        <div className="flex items-center justify-between group">
                          <div className="flex items-center gap-4 min-w-0 flex-1">
                            <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center text-neutral-500 group-hover:bg-green-500/10 group-hover:text-green-500 transition-all">
                              <Phone size={20} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[8px] font-black uppercase text-neutral-600 tracking-widest mb-0.5">Phone Number</p>
                              <p className="text-lg font-black text-[#ce112d] tracking-tighter truncate">{selectedOrder.customer_phone}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4 shrink-0">
                            <a href={`tel:${selectedOrder.customer_phone}`} className="p-3 bg-neutral-900 hover:bg-green-600 text-neutral-600 hover:text-white rounded-2xl transition-all shadow-lg">
                              <ExternalLink size={14} />
                            </a>
                            <button onClick={() => copyToClipboard(selectedOrder.customer_phone, "Phone")} className="p-3 bg-neutral-900 hover:bg-[#ce112d] text-neutral-600 hover:text-white rounded-2xl transition-all shadow-lg shadow-black/20">
                              <Copy size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Address Group */}
                        <div className="flex items-start justify-between group">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center text-neutral-500 group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-all mt-1">
                              <MapPin size={20} strokeWidth={2.5} />
                            </div>
                            <div className="flex-1">
                              <p className="text-[8px] font-black uppercase text-neutral-600 tracking-widest mb-1.5">
                                Delivery Address <span className="text-[#ce112d] ml-1">({selectedOrder.delivery_area})</span>
                              </p>
                              <p className="text-[13px] font-bold text-neutral-300 leading-relaxed italic">{selectedOrder.customer_address}</p>
                            </div>
                          </div>
                          <button onClick={() => copyToClipboard(selectedOrder.customer_address, "Address")} className="p-3 bg-neutral-900 hover:bg-[#ce112d] text-neutral-600 hover:text-white rounded-2xl transition-all shadow-lg ml-4 shrink-0 mt-1">
                            <Copy size={14} />
                          </button>
                        </div>

                        {/* Merchant Note */}
                        {selectedOrder.customer_note && (
                          <div className="bg-yellow-500/5 p-4 rounded-3xl border border-yellow-500/10 flex items-start gap-3 mt-4">
                            <AlertCircle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[8px] font-black uppercase text-yellow-600/80 mb-1 tracking-widest">Internal Order Note</p>
                              <p className="text-xs font-bold text-yellow-500/80 leading-relaxed italic">{selectedOrder.customer_note}</p>
                            </div>
                            <button onClick={() => copyToClipboard(selectedOrder.customer_note, "Note")} className="p-2 bg-yellow-500/10 hover:bg-yellow-500 text-yellow-600/50 hover:text-white rounded-xl transition-all shrink-0">
                              <Copy size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Refactored Footer Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-neutral-900/40 p-5 rounded-[28px] border border-white/5 group hover:border-white/20 transition-all">
                        <div className="flex items-center gap-2 mb-2 opacity-60">
                          <Truck size={14} className="text-neutral-500" />
                          <p className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">
                            {selectedOrder.is_exclusive_order ? 'Adv Required' : 'Deli Charge'}
                          </p>
                        </div>
                        <span className="text-2xl font-black italic tracking-tighter">৳{(() => {
                          const charge = parseFloat(selectedOrder.delivery_charge) || 0;
                          return selectedOrder.is_exclusive_order ? 500 : (selectedOrder.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge);
                        })()}</span> </div>

                      <div className="bg-neutral-900/40 p-5 rounded-[28px] border border-white/5 group hover:border-[#ce112d]/30 transition-all overflow-hidden">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 opacity-60">
                            <ShieldCheck size={14} className="text-neutral-500" />
                            <p className="text-[8px] font-black uppercase text-neutral-500 tracking-widest">
                              {selectedOrder.last_four_digits && selectedOrder.last_four_digits.includes(': ')
                                ? `${selectedOrder.last_four_digits.split(': ')[0]} Ref`
                                : 'Sender ID'}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const val = selectedOrder.last_four_digits && selectedOrder.last_four_digits.includes(': ')
                                ? selectedOrder.last_four_digits.split(': ')[1]
                                : selectedOrder.last_four_digits;
                              copyToClipboard(val, "Sender Detail");
                            }}
                            className="p-1.5 bg-neutral-950 text-neutral-700 hover:text-[#ce112d] rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Copy size={10} />
                          </button>
                        </div>
                        <p className="text-xl font-black text-[#ce112d] italic truncate" title={selectedOrder.last_four_digits}>
                          {selectedOrder.last_four_digits && selectedOrder.last_four_digits.includes(': ')
                            ? selectedOrder.last_four_digits.split(': ')[1]
                            : (selectedOrder.last_four_digits || 'COD')}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-600 text-center">Admin Controls & Status</p>
                      <div className="flex gap-4">
                        <button
                          onClick={() => togglePaymentStatus(selectedOrder, 'Advance Paid')}
                          className={`flex-1 group relative overflow-hidden p-5 rounded-[28px] border transition-all duration-500 ${selectedOrder.payment_status === 'Advance Paid' ? 'bg-orange-500 border-orange-400 text-white shadow-2xl shadow-orange-500/40' : 'bg-neutral-900/50 border-white/5 text-neutral-500 hover:border-orange-500/50 hover:bg-orange-950/20'}`}
                        >
                          <div className="relative z-10 flex flex-col items-center">
                            <span className="text-2xl font-black italic tracking-tighter">৳{(() => {
                              const charge = parseFloat(selectedOrder.delivery_charge) || 0;
                              return selectedOrder.is_exclusive_order ? 500 : (selectedOrder.delivery_area === 'mirsarai' && charge === 0 ? 100 : charge);
                            })()}</span>
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] mt-1">{selectedOrder.is_exclusive_order ? 'Adv Paid' : (selectedOrder.delivery_area === 'mirsarai' && (parseFloat(selectedOrder.delivery_charge) || 0) === 0 ? 'Conf Paid' : 'Deli Paid')}</span>
                          </div>
                          {selectedOrder.payment_status === 'Advance Paid' && <div className="absolute top-0 right-0 p-1.5 bg-white/20 rounded-bl-xl"><Check size={10} strokeWidth={4} /></div>}
                        </button>
                        <button
                          onClick={() => togglePaymentStatus(selectedOrder, 'Fully Paid')}
                          className={`flex-1 group relative overflow-hidden p-5 rounded-[28px] border transition-all duration-500 ${selectedOrder.payment_status === 'Fully Paid' ? 'bg-green-600 border-green-500 text-white shadow-2xl shadow-green-500/40' : 'bg-neutral-900/50 border-white/5 text-neutral-500 hover:border-green-500/50 hover:bg-green-950/20'}`}
                        >
                          <div className="relative z-10 flex flex-col items-center">
                            <span className="text-2xl font-black italic tracking-tighter">৳{derivedTotalAmount}</span>
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] mt-1">Full Paid</span>
                          </div>
                          {selectedOrder.payment_status === 'Fully Paid' && <div className="absolute top-0 right-0 p-1.5 bg-white/20 rounded-bl-xl"><Check size={10} strokeWidth={4} /></div>}
                        </button>
                      </div>
                      <div className={`w-full p-6 rounded-[32px] border-2 flex items-center justify-between font-black uppercase tracking-[0.2em] shadow-inner transition-colors duration-500 ${selectedOrder.status === 'Delivered' ? 'bg-green-500/5 border-green-500/10 text-green-500' : selectedOrder.status === 'Canceled' ? 'bg-red-500/5 border-red-500/10 text-red-500' : selectedOrder.status === 'Deleted' ? 'bg-zinc-800 border-white/10 text-zinc-600' : 'bg-[#ce112d]/5 border-[#ce112d]/10 text-[#ce112d]'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_15px_currentColor] ${selectedOrder.status === 'Delivered' ? 'bg-green-500' : selectedOrder.status === 'Canceled' ? 'bg-red-500' : selectedOrder.status === 'Deleted' ? 'bg-zinc-600' : 'bg-[#ce112d]'}`} />
                          <span className="text-[11px] opacity-60">Order Status</span>
                        </div>
                        <span className="text-2xl italic tracking-tighter transform -skew-x-12">{selectedOrder.status}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Floating Action Button (FAB) for Add Product */}
      {activeTab !== 'add' && (
        <button
          type="button"
          onClick={() => {
            cancelEdit();
            setActiveTab('add');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-[#ce112d] via-[#e61535] to-[#ff1c3a] text-white rounded-full font-black uppercase text-xs tracking-wider shadow-[0_10px_35px_rgba(206,17,45,0.55)] hover:shadow-[0_15px_45px_rgba(206,17,45,0.75)] hover:scale-105 active:scale-95 transition-all group ring-4 ring-white/10 hover:ring-white/20"
          title="Add New Product (নতুন পণ্য যুক্ত করুন)"
        >
          <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center group-hover:rotate-90 transition-transform duration-300">
            <Plus size={14} strokeWidth={3.5} />
          </div>
          <span className="font-bold tracking-widest text-[11px] drop-shadow-md">Add Product</span>
        </button>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={() => setConfirmation({ ...confirmation, isOpen: false })}
        onConfirm={confirmation.onConfirm}
        title={confirmation.title}
        message={confirmation.message}
        confirmText={confirmation.confirmText}
      />
    </div>
  );
}
