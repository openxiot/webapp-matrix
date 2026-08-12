import { inject, Injectable, signal } from "@angular/core";
import {
  NzI18nInterface,
  NzI18nService,
  ar_EG,
  az_AZ,
  bg_BG,
  bn_BD,
  by_BY,
  ca_ES,
  cs_CZ,
  da_DK,
  de_DE,
  el_GR,
  en_AU,
  en_GB,
  en_US,
  es_ES,
  et_EE,
  fa_IR,
  fi_FI,
  fr_BE,
  fr_CA,
  fr_FR,
  ga_IE,
  gl_ES,
  he_IL,
  hi_IN,
  hr_HR,
  hu_HU,
  hy_AM,
  id_ID,
  is_IS,
  it_IT,
  ja_JP,
  ka_GE,
  kk_KZ,
  km_KH,
  kmr_IQ,
  kn_IN,
  ko_KR,
  ku_IQ,
  lt_LT,
  lv_LV,
  mk_MK,
  ml_IN,
  mn_MN,
  ms_MY,
  nb_NO,
  ne_NP,
  nl_BE,
  nl_NL,
  pl_PL,
  pt_BR,
  pt_PT,
  ro_RO,
  ru_RU,
  sk_SK,
  sl_SI,
  sr_RS,
  sv_SE,
  ta_IN,
  th_TH,
  tr_TR,
  uk_UA,
  ur_PK,
  vi_VN,
  zh_CN,
  zh_HK,
  zh_TW
} from "ng-zorro-antd/i18n";
import { TranslateService } from "@ngx-translate/core";

// 支持的语言映射 → 这里加上标准 BCP 47 码
export const SUPPORTED_LANGUAGES: Record<string, { name: string; nzLocale: NzI18nInterface; bcp47: string }> = {
  en: {
    name: 'English',
    nzLocale: en_US,
    bcp47: 'en-US'
  },
  en_AU: {
    name: 'English (Australia)',
    nzLocale: en_AU,
    bcp47: 'en-AU'
  },
  en_GB: {
    name: 'English (UK)',
    nzLocale: en_GB,
    bcp47: 'en-GB'
  },
  zh: {
    name: '中文(简体)',
    nzLocale: zh_CN,
    bcp47: 'zh-CN'
  },
  zh_HK: {
    name: '中文(香港)',
    nzLocale: zh_HK,
    bcp47: 'zh-HK'
  },
  zh_TW: {
    name: '中文(繁體)',
    nzLocale: zh_TW,
    bcp47: 'zh-TW'
  },
  de: {
    name: 'Deutsch',
    nzLocale: de_DE,
    bcp47: 'de-DE'
  },
  fr: {
    name: 'Français',
    nzLocale: fr_FR,
    bcp47: 'fr-FR'
  },
  fr_BE: {
    name: 'Français (Belgique)',
    nzLocale: fr_BE,
    bcp47: 'fr-BE'
  },
  fr_CA: {
    name: 'Français (Canada)',
    nzLocale: fr_CA,
    bcp47: 'fr-CA'
  },
  it: {
    name: 'Italiano',
    nzLocale: it_IT,
    bcp47: 'it-IT'
  },
  ru: {
    name: "Русский",
    nzLocale: ru_RU,
    bcp47: 'ru-RU'
  },
  ko: {
    name: "한국어",
    nzLocale: ko_KR,
    bcp47: 'ko-KR'
  },
  es: {
    name: 'Español',
    nzLocale: es_ES,
    bcp47: 'es-ES'
  },
  ja: {
    name: '日本語',
    nzLocale: ja_JP,
    bcp47: 'ja-JP'
  },
  nl: {
    name: "Nederlands",
    nzLocale: nl_NL,
    bcp47: 'nl-NL'
  },
  nl_BE: {
    name: "Nederlands (België)",
    nzLocale: nl_BE,
    bcp47: 'nl-BE'
  },
  pt: {
    name: 'Português',
    nzLocale: pt_PT,
    bcp47: 'pt-PT'
  },
  pt_BR: {
    name: 'Português (Brasil)',
    nzLocale: pt_BR,
    bcp47: 'pt-BR'
  },
  ar: {
    name: 'العربية',
    nzLocale: ar_EG,
    bcp47: 'ar-EG'
  },
  az: {
    name: 'Azərbaycan dili',
    nzLocale: az_AZ as unknown as NzI18nInterface,
    bcp47: 'az-AZ'
  },
  bg: {
    name: 'Български',
    nzLocale: bg_BG,
    bcp47: 'bg-BG'
  },
  bn: {
    name: 'বাংলা',
    nzLocale: bn_BD,
    bcp47: 'bn-BD'
  },
  by: {
    name: 'Беларуская',
    nzLocale: by_BY,
    bcp47: 'be-BY'
  },
  ca: {
    name: 'Català',
    nzLocale: ca_ES,
    bcp47: 'ca-ES'
  },
  cs: {
    name: 'Čeština',
    nzLocale: cs_CZ,
    bcp47: 'cs-CZ'
  },
  da: {
    name: 'Dansk',
    nzLocale: da_DK,
    bcp47: 'da-DK'
  },
  el: {
    name: 'Ελληνικά',
    nzLocale: el_GR,
    bcp47: 'el-GR'
  },
  et: {
    name: 'Eesti',
    nzLocale: et_EE,
    bcp47: 'et-EE'
  },
  fa: {
    name: 'فارسی',
    nzLocale: fa_IR,
    bcp47: 'fa-IR'
  },
  fi: {
    name: 'Suomi',
    nzLocale: fi_FI,
    bcp47: 'fi-FI'
  },
  ga: {
    name: 'Gaeilge',
    nzLocale: ga_IE,
    bcp47: 'ga-IE'
  },
  gl: {
    name: 'Galego',
    nzLocale: gl_ES,
    bcp47: 'gl-ES'
  },
  he: {
    name: 'עברית',
    nzLocale: he_IL,
    bcp47: 'he-IL'
  },
  hi: {
    name: 'हिन्दी',
    nzLocale: hi_IN,
    bcp47: 'hi-IN'
  },
  hr: {
    name: 'Hrvatski',
    nzLocale: hr_HR,
    bcp47: 'hr-HR'
  },
  hu: {
    name: 'Magyar',
    nzLocale: hu_HU,
    bcp47: 'hu-HU'
  },
  hy: {
    name: 'Հայերեն',
    nzLocale: hy_AM,
    bcp47: 'hy-AM'
  },
  id: {
    name: 'Bahasa Indonesia',
    nzLocale: id_ID,
    bcp47: 'id-ID'
  },
  is: {
    name: 'Íslenska',
    nzLocale: is_IS,
    bcp47: 'is-IS'
  },
  ka: {
    name: 'ქართული',
    nzLocale: ka_GE,
    bcp47: 'ka-GE'
  },
  kk: {
    name: 'Қазақ тілі',
    nzLocale: kk_KZ,
    bcp47: 'kk-KZ'
  },
  km: {
    name: 'ភាសាខ្មែរ',
    nzLocale: km_KH,
    bcp47: 'km-KH'
  },
  kmr: {
    name: 'Kurdî (Kurmancî)',
    nzLocale: kmr_IQ,
    bcp47: 'kmr-IQ'
  },
  kn: {
    name: 'ಕನ್ನಡ',
    nzLocale: kn_IN as unknown as NzI18nInterface,
    bcp47: 'kn-IN'
  },
  ku: {
    name: 'کوردی (Sorani)',
    nzLocale: ku_IQ,
    bcp47: 'ku-IQ'
  },
  lt: {
    name: 'Lietuvių',
    nzLocale: lt_LT,
    bcp47: 'lt-LT'
  },
  lv: {
    name: 'Latviešu',
    nzLocale: lv_LV,
    bcp47: 'lv-LV'
  },
  mk: {
    name: 'Македонски',
    nzLocale: mk_MK,
    bcp47: 'mk-MK'
  },
  ml: {
    name: 'മലയാളം',
    nzLocale: ml_IN,
    bcp47: 'ml-IN'
  },
  mn: {
    name: 'Монгол',
    nzLocale: mn_MN,
    bcp47: 'mn-MN'
  },
  ms: {
    name: 'Bahasa Melayu',
    nzLocale: ms_MY,
    bcp47: 'ms-MY'
  },
  nb: {
    name: 'Norsk (Bokmål)',
    nzLocale: nb_NO,
    bcp47: 'nb-NO'
  },
  ne: {
    name: 'नेपाली',
    nzLocale: ne_NP,
    bcp47: 'ne-NP'
  },
  pl: {
    name: 'Polski',
    nzLocale: pl_PL,
    bcp47: 'pl-PL'
  },
  ro: {
    name: 'Română',
    nzLocale: ro_RO,
    bcp47: 'ro-RO'
  },
  sk: {
    name: 'Slovenčina',
    nzLocale: sk_SK,
    bcp47: 'sk-SK'
  },
  sl: {
    name: 'Slovenščina',
    nzLocale: sl_SI,
    bcp47: 'sl-SI'
  },
  sr: {
    name: 'Српски',
    nzLocale: sr_RS as unknown as NzI18nInterface,
    bcp47: 'sr-RS'
  },
  sv: {
    name: 'Svenska',
    nzLocale: sv_SE,
    bcp47: 'sv-SE'
  },
  ta: {
    name: 'தமிழ்',
    nzLocale: ta_IN,
    bcp47: 'ta-IN'
  },
  th: {
    name: 'ไทย',
    nzLocale: th_TH,
    bcp47: 'th-TH'
  },
  tr: {
    name: 'Türkçe',
    nzLocale: tr_TR,
    bcp47: 'tr-TR'
  },
  uk: {
    name: 'Українська',
    nzLocale: uk_UA,
    bcp47: 'uk-UA'
  },
  ur: {
    name: 'اردو',
    nzLocale: ur_PK,
    bcp47: 'ur-PK'
  },
  vi: {
    name: 'Tiếng Việt',
    nzLocale: vi_VN,
    bcp47: 'vi-VN'
  }
};

@Injectable({ providedIn: 'root' })
export class MainI18nService {

  public translate = inject(TranslateService);
  public i18n = inject(NzI18nService);

  languages = Object.entries(SUPPORTED_LANGUAGES)
    .map(([code, config]) => ({
      code: code,
      name: config.name,
      bcp47: config.bcp47,
    }));

  currentLang = signal<string>('en');

  constructor() {
    const savedLang = localStorage.getItem('lang');
    const browserLang = this.translate.getBrowserLang() || 'en';
    const langToUse = savedLang && SUPPORTED_LANGUAGES[savedLang] ? savedLang : browserLang;

    this.currentLang.set(langToUse);
    this.translate.use(langToUse);
    this.setNzI18n(langToUse);
  }

  changeLanguage(lang: string) {
    if (!SUPPORTED_LANGUAGES[lang]) {
      console.warn(`Unsupported language: ${lang}`);
      return;
    }

    localStorage.setItem('lang', lang);
    this.currentLang.set(lang);
    this.translate.use(lang);
    this.setNzI18n(lang);
  }

  private setNzI18n(lang: string): void {
    const nzLocale = SUPPORTED_LANGUAGES[lang]?.nzLocale;
    if (nzLocale) {
      this.i18n.setLocale(nzLocale);
    }
  }

  // ✅ 直接返回 BCP 47 格式
  getCurrentLang(): string {
    const langCode = this.currentLang();
    return SUPPORTED_LANGUAGES[langCode]?.bcp47 ?? 'en-US';
  }
}
