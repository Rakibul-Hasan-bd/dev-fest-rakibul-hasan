const translations = {
  en: {
    appTitle: "Smart Escape - Evacuation Simulator",
    uploadJson: "Upload JSON",
    resetState: "Reset Hazards",
    selectStart: "Select a Start Location (Room/Junction)",
    cost: "Total Cost",
    exit: "Destination Exit",
    route: "Path Sequence",
    noRoute: "No route available",
    startBlocked: "Starting location blocked",
    langName: "বাংলা"
  },
  bn: {
    appTitle: "স্মার্ট এস্কেপ - জরুরি নির্গমন সিমুলেটর",
    uploadJson: "JSON আপলোড",
    resetState: "রিসেট করুন",
    selectStart: "শুরুর স্থান নির্বাচন করুন (রুম/জংশন)",
    cost: "মোট খরচ",
    exit: "গন্তব্য এক্সিট",
    route: "রুটের সিকোয়েন্স",
    noRoute: "কোনো রুট পাওয়া যায়নি",
    startBlocked: "শুরুর স্থানটি ব্লকড",
    langName: "English"
  }
};

let currentLang = 'en';

function setLanguage(lang) {
  currentLang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang] && translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });
  if (window.updateApp) window.updateApp();
}

function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || key;
}

window.i18n = { setLanguage, t, getLang: () => currentLang };