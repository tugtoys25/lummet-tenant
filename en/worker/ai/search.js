import { searchFAQs } from "../database/faqs.js";


export const aiSearch = {


async search(
env,
query,
country="RW",
intent="search"
){

const text =
query.toLowerCase();


const q =
`%${text}%`;


// =====================
// CASINOS
// =====================

let casinos;


if(
text.includes("list") ||
text.includes("all casinos") ||
text.includes("available casinos") ||
text.includes("casinos available")
){

casinos =
await env.DB.prepare(`

SELECT
slug,
name,
rating,
bonus_title,
bonus_value,
website_url

FROM casinos

LIMIT 20

`)
.all();


}
else {


casinos =
await env.DB.prepare(`

SELECT
slug,
name,
rating,
bonus_title,
bonus_value,
website_url

FROM casinos

WHERE

LOWER(name) LIKE ?

OR LOWER(bonus_title) LIKE ?

LIMIT 10

`)
.bind(q,q)
.all();


}


// =====================
// REVIEWS
// =====================

let reviews;


if(
text.includes("list") ||
text.includes("all reviews") ||
intent === "casino_review"
){

reviews =
await env.DB.prepare(`

SELECT
title,
casino_slug,
overview

FROM reviews

LIMIT 20

`)
.all();


}
else {


reviews =
await env.DB.prepare(`

SELECT
title,
casino_slug,
overview

FROM reviews

WHERE
LOWER(title) LIKE ?
OR LOWER(overview) LIKE ?

LIMIT 5

`)
.bind(q,q)
.all();

}



// =====================
// NEWS
// =====================

const news =
await env.DB.prepare(`

SELECT
title,
slug,
excerpt

FROM news

WHERE

LOWER(title) LIKE ?

OR LOWER(excerpt) LIKE ?

LIMIT 5

`)
.bind(q,q)
.all();




// =====================
// PAGES
// =====================

const pages =
await env.DB.prepare(`

SELECT
title,
slug

FROM pages

WHERE LOWER(title) LIKE ?

LIMIT 5

`)
.bind(q)
.all();




// =====================
// FAQ
// =====================

const faqs =
await searchFAQs(
env.DB,
text
);



return {

country,

intent,

casinos:
casinos.results || [],

reviews:
reviews.results || [],

news:
news.results || [],

pages:
pages.results || [],

faqs

};


}


};
