-- =====================================================
-- 0039_payment_methods.sql
-- Reusable payment methods (Visa, Mastercard, Skrill, crypto, ...),
-- their own /payment-methods and /payment-methods/:slug pages, and
-- the join to casinos so a payment method's icon row can be rendered
-- on casino cards (mirrors casino_categories exactly).
--
-- Deletion policy: unlike offers, payment methods carry no
-- commercial/historical significance of their own -- deleting one
-- (e.g. "Skrill" is discontinued) should just detach it from every
-- casino, not block the delete. ON DELETE CASCADE on the join table
-- reflects that; casinos.id itself is never touched.
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,

    icon_url TEXT,                     -- e.g. /wp-content/uploads/visa-fav.svg equivalent
    method_type TEXT DEFAULT 'card',   -- 'card' | 'ewallet' | 'crypto' | 'bank' | 'other'

    description TEXT,                  -- shown on the /payment-methods/:slug detail page
    content_json TEXT,                 -- optional structured sections, same convention as categories.content_json

    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT,

    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'published',   -- 'published' | 'draft'
    published INTEGER DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_slug ON payment_methods(slug);
CREATE INDEX IF NOT EXISTS idx_payment_methods_published ON payment_methods(published);

CREATE TABLE IF NOT EXISTS casino_payment_methods (
    casino_id INTEGER NOT NULL,
    payment_method_id INTEGER NOT NULL,

    PRIMARY KEY (casino_id, payment_method_id),

    FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cpm_casino ON casino_payment_methods(casino_id);
CREATE INDEX IF NOT EXISTS idx_cpm_payment_method ON casino_payment_methods(payment_method_id);

-- ── Permissions (role-level), matching the pattern in 0024_offers.sql ──
INSERT OR IGNORE INTO permissions (role, resource, action, allowed) VALUES
    ('editor', 'payment_methods', 'read',   1),
    ('editor', 'payment_methods', 'create', 1),
    ('editor', 'payment_methods', 'update', 1),
    ('editor', 'payment_methods', 'delete', 1);

-- ── Seed a starter set so /payment-methods isn't empty on first deploy.
--    Icons point at /static/images/payments/<slug>.svg -- drop matching
--    files there (see the note in the reply) or swap icon_url later
--    from the dashboard once payment-method admin UI exists. ──
INSERT OR IGNORE INTO payment_methods (slug, name, icon_url, method_type, description, sort_order) VALUES
    ('visa',        'Visa',        '/static/images/payments/visa.svg',        'card',    'Visa is one of the most widely accepted card networks at online casinos, with instant deposits and typically 1-3 day withdrawals.', 10),
    ('mastercard',  'Mastercard',  '/static/images/payments/mastercard.svg',  'card',    'Mastercard is accepted at nearly every licensed online casino, offering instant deposits worldwide.', 20),
    ('skrill',      'Skrill',      '/static/images/payments/skrill.svg',      'ewallet', 'Skrill is a popular e-wallet for online casinos, known for fast withdrawals and wide international support.', 30),
    ('neteller',    'Neteller',    '/static/images/payments/neteller.svg',    'ewallet', 'Neteller is an e-wallet frequently used at casinos for its quick payout times.', 40),
    ('paypal',      'PayPal',      '/static/images/payments/paypal.svg',      'ewallet', 'PayPal is accepted at a growing number of licensed casinos, valued for its buyer protection and familiarity.', 50),
    ('apple-pay',   'Apple Pay',   '/static/images/payments/apple-pay.svg',   'ewallet', 'Apple Pay lets iOS users deposit instantly using stored cards, without re-entering card details.', 60),
    ('google-pay',  'Google Pay',  '/static/images/payments/google-pay.svg',  'ewallet', 'Google Pay offers instant, card-free deposits for Android users.', 70),
    ('paysafecard', 'Paysafecard', '/static/images/payments/paysafecard.svg', 'card',    'Paysafecard is a prepaid voucher method, useful for depositing without a bank or credit card.', 80),
    ('neosurf',     'Neosurf',     '/static/images/payments/neosurf.svg',     'card',    'Neosurf is a prepaid voucher accepted at many casinos as a card-free deposit option.', 90),
    ('bitcoin',     'Bitcoin',     '/static/images/payments/bitcoin.svg',     'crypto',  'Bitcoin deposits and withdrawals are typically faster than traditional banking methods and widely supported at crypto-friendly casinos.', 100);
