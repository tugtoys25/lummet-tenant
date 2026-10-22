-- Fix duplicate/redundant H1s found in body content (title already renders as the page's H1).
-- Case-by-case, not a blanket conversion:
--   news #4, #5      -> h1 text adds real info beyond the title, so demote to h2
--   pages "contact"  -> h1 just restates the title in different words, so remove it
--   pages "team"     -> same, h1 restates the title, so remove it
--   pages "review-methodology" -> the title column itself was broken (literal slug text,
--       "Level.casino review-methodology"); replaced it with the well-formatted text that
--       was sitting in the body's h1, then removed that now-redundant h1

UPDATE news
SET content = REPLACE(content, '<h1>Our New Website Is Now Live</h1>', '<h2>Our New Website Is Now Live</h2>')
WHERE id = 4;

UPDATE news
SET content = REPLACE(content, '<h1>New Online Casinos Added to Level.casino</h1>', '<h2>New Online Casinos Added to Level.casino</h2>')
WHERE id = 5;

UPDATE pages
SET content_json = REPLACE(content_json, '<h1>Get in Touch With Our Team</h1>
', '')
WHERE id = 5;

UPDATE pages
SET title = 'Level.casino Casino Review Methodology',
    content_json = REPLACE(content_json, '<h1>Level.casino Casino Review Methodology</h1>

', '')
WHERE id = 15;

UPDATE pages
SET content_json = REPLACE(content_json, '<h1>Meet the Level.casino Team</h1>

', '')
WHERE id = 17;
