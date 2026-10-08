export const aiContext = {

    async get(env, intent, message, country) {

        switch(intent) {

            case "search":
                return await this.searchCasino(env, message);

            case "review":
                return await this.searchReview(env, message);

            case "news":
                return await this.getNews(env);

            case "geo":
                return await this.getGeo(env, country);

            default:
                return {};
        }
    },


    async searchCasino(env, q) {

        const data = await env.DB.prepare(`
            SELECT
                name,
                slug,
                rating,
                supported_countries,
                restricted_countries
            FROM casinos
            WHERE name LIKE ?
            LIMIT 5
        `)
        .bind(`%${q}%`)
        .all();

        return {
            casinos: data.results
        };
    },

    async searchReview(env, q) {

    const data = await env.DB.prepare(`
        SELECT
            title,
            slug,
            rating
        FROM reviews
        WHERE title LIKE ?
        OR casino_slug LIKE ?
        LIMIT 5
    `)
    .bind(`%${q}%`, `%${q.toLowerCase()}%`)
    .all();

    return {
        reviews: data.results
    };
},

    async getNews(env) {

        const data = await env.DB.prepare(`
            SELECT
                title,
                slug
            FROM news
            ORDER BY created_at DESC
            LIMIT 5
        `)
        .all();

        return {
            news: data.results
        };
    },


    async getGeo(env, country) {

        const data = await env.DB.prepare(`
            SELECT *
            FROM geo_rules
            WHERE country_code = ?
        `)
        .bind(country)
        .all();

        return {
            geo: data.results
        };
    }

};
