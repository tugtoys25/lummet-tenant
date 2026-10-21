-- Rating sync triggers present in the live tenant database (casinos.rating <-> reviews.rating).
-- They were not created by any of the old migrations; kept in their own file because trigger bodies
-- contain ';' and some tools split statements naively.
CREATE TRIGGER IF NOT EXISTS trg_casino_rating_to_reviews AFTER UPDATE OF rating ON casinos BEGIN   UPDATE reviews   SET rating = NEW.rating,       updated_at = CURRENT_TIMESTAMP   WHERE casino_slug = NEW.slug; END;

CREATE TRIGGER IF NOT EXISTS trg_review_rating_from_casino AFTER INSERT ON reviews BEGIN   UPDATE reviews   SET rating = (SELECT rating FROM casinos WHERE slug = NEW.casino_slug)   WHERE id = NEW.id     AND EXISTS (SELECT 1 FROM casinos WHERE slug = NEW.casino_slug); END;

