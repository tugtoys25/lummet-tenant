export const DEFAULTS = {
  logo: "",
  ogImage: "",

  favicon96: "",
  faviconSvg: "",
  faviconIco: "",
  appleTouchIcon: "",
  manifest: "/site.webmanifest",

  heroImage: "",
  // ==========================================================
  // ANALYTICS
  // ==========================================================

  gaMeasurementId: "",

  // ==========================================================
  // GPWA VERIFICATION (SEAL + SCRIPT)
  // Admin-pasted, per-tenant. Never hardcoded — each tenant may
  // or may not be GPWA-certified, and the exact markup (domain,
  // verify/seal/script URLs) differs per tenant certification.
  // ==========================================================

  gpwaSealEnabled: false,
  gpwaSealHtml: "",
  gpwaScriptHtml: "",

   // ==========================================================
  // THEME / PLATFORM LAYOUT
  // ==========================================================

  themePreset: "midnight",

  themePrimary: "#8b5cf6",
  themePrimaryHover: "#7c3aed",

  themeSecondary: "#ec4899",
  themeSecondaryHover: "#db2777",

  themeAccent: "#22d3ee",

  themeBackground: "#050505",
  themeSurface: "#0f0f12",
  themeSurfaceAlt: "#15151a",

  themeText: "#ffffff",
  themeTextMuted: "#a1a1aa",

  themeBorder: "#27272a",

  themeButtonText: "#ffffff",

  themeHeaderBackground: "",
  themeFooterBackground: "",

  themeCardRadius: "12px",
  themeButtonRadius: "8px",

  themeContainerWidth: "1200px",

  themeHeaderStyle: "default",
  themeCardStyle: "default",
  themeButtonStyle: "default",
  themeLayoutStyle: "default",

    homepageSections: [
    {
      id: "features",
      enabled: true,
      type: "features",
      title: "Why Choose Us",
      subtitle: "",
      description: "",
      alignment: "center",
      backgroundColor: "",
      backgroundImage: "",
      textColor: "",
      cards: [
        {
          id: "expert-reviews",
          enabled: true,
          title: "Expert Reviews",
          text: "In-depth analysis from industry veterans with years of experience.",
          iconType: "icon",
          icon: "★",
          imageUrl: "",
          url: "",
          target: "_self",
          backgroundColor: "",
          backgroundImage: "",
          textColor: "",
          iconColor: ""
        },
        {
          id: "exclusive-bonuses",
          enabled: true,
          title: "Exclusive Bonuses",
          text: "Access special bonus offers available only through {{site_name}}.",
          iconType: "icon",
          icon: "🔒",
          imageUrl: "",
          url: "",
          target: "_self",
          backgroundColor: "",
          backgroundImage: "",
          textColor: "",
          iconColor: ""
        },
        {
          id: "geo-targeted",
          enabled: true,
          title: "Geo-Targeted",
          text: "See casinos available in your country with localized bonus offers.",
          iconType: "icon",
          icon: "🌐",
          imageUrl: "",
          url: "",
          target: "_self",
          backgroundColor: "",
          backgroundImage: "",
          textColor: "",
          iconColor: ""
        },
        {
          id: "real-data",
          enabled: true,
          title: "Real Data",
          text: "Click tracking and player analytics for transparent recommendations.",
          iconType: "icon",
          icon: "📊",
          imageUrl: "",
          url: "",
          target: "_self",
          backgroundColor: "",
          backgroundImage: "",
          textColor: "",
          iconColor: ""
        }
      ],
      paragraphs: [],
      buttonText: "",
      buttonUrl: "",
      buttonStyle: "primary"
    }
  ],
  footerDisclaimer:
    " This website is an independent casino comparison and affiliate platform. We do not operate gambling services or take bets. Operator availability depends on your jurisdiction. Users are responsible for complying with local laws. We may earn a commission via affiliate links.",

  responsibleText:
    "18+ | Gambling can be addictive, please play responsibly.",

  responsibleUrl: "/en/responsible-gambling",

  responsibleHelpText:
    "If you or someone you know needs help, visit",

  responsibleHelpUrl:
    "https://www.gambleaware.org/",

  responsibleHelpLabel:
    "GambleAware.org",

  compliance: [
    {
      image: "/static/images/logo/18plus.png",
      url: "",
      alt: "18+ Only"
    },
    {
      image: "/static/images/logo/gamble-aware-logo.svg",
      url: "https://www.gambleaware.org/",
      alt: "GambleAware"
    },
    {
      image: "/static/images/logo/curacao-gaming-contro-board-license.svg",
      url: "https://www.gamingcontrolcuracao.org/",
      alt: "Curaçao Gaming Control Board"
    },
    {
      image: "/static/images/logo/malta-gaming-authority-mga.svg",
      url: "https://www.mga.org.mt/",
      alt: "Malta Gaming Authority"
    },
    {
      image: "/static/images/logo/uk-gc-rectangle.svg",
      url: "https://www.gamblingcommission.gov.uk/",
      alt: "UK Gambling Commission"
    },
    {
      image: "/static/images/logo/gamstop.svg",
      url: "https://www.gamstop.co.uk/",
      alt: "GAMSTOP"
    },
    {
      image: "/static/images/logo/betblocker.svg",
      url: "https://betblocker.org/",
      alt: "BetBlocker"
    }
  ]
};
