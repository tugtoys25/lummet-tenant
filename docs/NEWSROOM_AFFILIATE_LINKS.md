# Newsroom affiliate links (commerce v2)

Generic marketplace / affiliate offers (Amazon, Alibaba, AliExpress, eBay, Jumia, Etsy, any shop) for news articles.

- Manage links in **Newsroom > Commerce > Affiliate links**. Each link has a name, optional network, a code and an https destination.
- Public address: `/en/go/<code>`; the code is fixed once created. Optional `?n=<article>&w=<widget>` is added by widgets so clicks are counted per article and widget.
- **Separate from the casino tracking system.** Tables `news_affiliate_links` and `news_link_clicks` (migration 0033). The casino flow runs first and is unchanged; a news link is only consulted when the casino system finds nothing for that code. Codes already used by a casino tracking link or casino slug are refused.
- Gated by the existing `news_commerce` switch (ships OFF). Off: every news link answers with the normal 404.
- Paused link: button disappears from articles and the address answers 404. A link used by a widget cannot be deleted.
- Article picker: choose by section, topic, search or number. The photo gallery and widget picture use the standard media picker.
- Old widgets that point at a casino tracking link keep working.

Not verified live: the Commerce screen in a browser, real marketplace destinations.
