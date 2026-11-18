// Styles for the Advanced Homepage. Every rule starts with .ah- so nothing else on the site can be affected, and it only uses
// the site's own colour variables, so it follows the active theme.
export const ADVANCED_HOME_CSS = `
.ah-section{padding:44px 0}.ah-section--alt{background:var(--white)}
.ah-wrap{max-width:var(--container,1200px);margin:0 auto;padding:0 20px}
.ah-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:22px}
.ah-head h2{margin:0;font-size:clamp(22px,3vw,30px)}.ah-sub{margin:6px 0 0;color:var(--gray)}
.ah-link{font-weight:600;color:var(--primary)}
.ah-hero{padding:64px 0 48px;text-align:center;background:linear-gradient(160deg,color-mix(in srgb,var(--primary) 14%,var(--bg)),var(--bg))}
.ah-hero--left{text-align:left}
.ah-kicker{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--primary);margin-bottom:10px}
.ah-hero h1{font-size:clamp(30px,5vw,50px);line-height:1.12;margin:0 0 14px}
.ah-hero p{max-width:680px;margin:0 auto 22px;font-size:18px;color:var(--gray)}.ah-hero--left p{margin-left:0}
.ah-cta{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}.ah-hero--left .ah-cta{justify-content:flex-start}
.ah-proof{margin-top:18px;font-size:14px;color:var(--gray)}
.ah-chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ah-chips__label{font-size:13px;font-weight:700;color:var(--gray);margin-right:4px}
.ah-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;border:1px solid var(--light-gray);background:var(--white);color:var(--dark);font-size:14px;text-decoration:none}
.ah-chip:hover{background:var(--primary);color:var(--white);border-color:var(--primary);text-decoration:none}
.ah-filters{padding:18px 0;border-bottom:1px solid var(--light-gray)}.ah-filters .ah-wrap{display:flex;flex-direction:column;gap:10px}
.ah-geo{display:inline-flex;gap:6px;align-items:center;font-size:14px;color:var(--gray);margin-bottom:14px}
.ah-disclosure{margin:14px 0 0;font-size:13px;color:var(--gray)}.ah-more{margin-top:16px;text-align:center}
.ah-bar{height:6px;border-radius:6px;background:var(--light-gray);margin-top:5px;overflow:hidden}.ah-bar i{display:block;height:100%;background:var(--primary)}
.ah-section .casino-card__reason{display:inline-block;margin-top:4px;padding:2px 9px;font-size:12px;font-weight:600;border-radius:999px;background:color-mix(in srgb,var(--primary) 12%,var(--white));color:var(--primary)}
.ah-section .casino-card__score{display:inline-block;margin:4px 8px 0 0;font-size:13px;color:var(--gray)}.ah-section .casino-card__score b{font-size:18px;color:var(--dark)}
.ah-section .casino-card__terms{margin:6px 0 0;font-size:12px;color:var(--gray)}
.ah-empty{padding:22px;border:1px dashed var(--light-gray);border-radius:var(--radius);color:var(--gray);text-align:center}
.ah-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.ah-card{display:flex;flex-direction:column;gap:6px;align-items:flex-start;padding:16px;background:var(--white);border:1px solid var(--light-gray);border-radius:var(--radius);color:var(--dark);text-decoration:none}
.ah-card:hover{border-color:var(--primary);box-shadow:var(--shadow);text-decoration:none}.ah-card__icon{font-size:26px;line-height:1}.ah-card b{font-size:15px}
/* Latest reviews first, then latest news: one block under the other, each in two columns on wide screens */
.ah-rn{display:flex;flex-direction:column;gap:36px}.ah-rn>div>h3{margin:0 0 14px;font-size:22px}
.ah-rn .casino-grid,.ah-rn .news-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.ah-pay{display:flex;flex-wrap:wrap;gap:10px}.ah-pay a{display:flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid var(--light-gray);border-radius:10px;background:var(--white);color:var(--dark);font-size:14px;text-decoration:none}.ah-pay img{height:22px;width:auto;max-width:60px;object-fit:contain}
.ah-criteria{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin:0;padding:0;list-style:none}
.ah-criteria li{padding:14px 16px;background:var(--white);border:1px solid var(--light-gray);border-radius:var(--radius)}.ah-criteria b{display:flex;justify-content:space-between;gap:8px}.ah-criteria p{margin:4px 0 0;font-size:14px;color:var(--gray)}
.ah-faq details{background:var(--white);border:1px solid var(--light-gray);border-radius:var(--radius);margin-bottom:10px}.ah-faq summary{cursor:pointer;padding:14px 16px;font-weight:600}.ah-faq p{margin:0;padding:0 16px 16px;color:var(--gray)}
.ah-trust{padding:30px 0;background:color-mix(in srgb,var(--primary) 6%,var(--bg))}.ah-trust__row{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.ah-age{flex:none;width:48px;height:48px;border-radius:50%;border:3px solid var(--danger);display:flex;align-items:center;justify-content:center;font-weight:800}
.ah-trust__text{flex:1 1 280px}.ah-trust__text h2{margin:0 0 4px;font-size:20px}.ah-trust__text p{margin:0;color:var(--gray)}
.ah-prose{background:var(--white);border:1px solid var(--light-gray);border-radius:var(--radius);padding:4px 18px}.ah-prose summary{cursor:pointer;padding:14px 0;font-weight:600;color:var(--primary)}.ah-prose__body{padding-bottom:16px}.ah-prose__body p{color:var(--gray)}
.ah-news{padding:38px 0;background:var(--surface-dark);color:#fff}.ah-news h2{margin:0 0 6px;color:#fff}.ah-news p{margin:0 0 14px;opacity:.85}
.ah-news form{display:flex;gap:10px;flex-wrap:wrap}.ah-news input{flex:1 1 240px;padding:12px 14px;border-radius:var(--btn-radius,12px);border:0}
@media(max-width:760px){.ah-rn .casino-grid,.ah-rn .news-grid{grid-template-columns:1fr}}
@media(max-width:860px){.ah-hero{padding:44px 0 34px}}
`;
