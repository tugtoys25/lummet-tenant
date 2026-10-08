export async function searchFAQs(DB,q){

const result =
await DB.prepare(`
SELECT *
FROM faqs
WHERE
LOWER(question) LIKE ?
OR LOWER(answer) LIKE ?

LIMIT 5
`)
.bind(
`%${q}%`,
`%${q}%`
)
.all();


return result.results || [];

}
