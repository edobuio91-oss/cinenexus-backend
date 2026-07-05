const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const wiki = require("wikipedia");
const Database = require("better-sqlite3");

const TMDB_API_KEY =
    "ccfb56079b1e4e01c68c03045ea23a21";

const app = express();

app.use(cors());

const db = new Database("cinenexus.db");

db.exec(`

CREATE TABLE IF NOT EXISTS dubbing_cache (

    tmdbId TEXT PRIMARY KEY,

    json TEXT NOT NULL,

    updatedAt INTEGER NOT NULL
)

`);

// ========================================
// WIKIPEDIA DUBBERS
// ========================================

async function getWikipediaDubbersByTitle(
    wikipediaTitle
) {

    try {

        const wikipediaUrl =

            `https://it.wikipedia.org/wiki/${encodeURIComponent(
                wikipediaTitle
            )}`;

        console.log(
            "Wikipedia URL:",
            wikipediaUrl
        );

        const response =
            await axios.get(
                wikipediaUrl,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0"
                    }
                }
            );

        const $ =
            cheerio.load(
                response.data
            );

            console.log("================================");
            console.log("DEBUG WIKIPEDIA SINOTTICO");
            console.log("================================");

            $(".sinottico tr").each((i, tr) => {

                console.log(
                    $(tr)
                        .text()
                        .replace(/\s+/g, " ")
                        .trim()
                );
            });

            console.log(
                $.html()
                    .substring(0, 30000)
            );

        const dubbingVersions = [];

        let currentVersion = {

            id: "original",

            name: "Doppiaggio italiano",

            type: "original",

            cast: []
        };

        dubbingVersions.push(
            currentVersion
        );

        const dubbingKeywords = [

            "doppiatori italiani",
            "voci italiane",
            "voce italiana",
            "doppiaggio italiano",
            "cast del doppiaggio",
            "cast italiano",
            "voci",
            "doppiatori"
        ];

        $(".sinottico tr").each((i, tr) => {

            const headerText =

                $(tr)
                    .find("th")
                    .first()
                    .text()
                    .replace(/\s+/g, " ")
                    .trim()
                    .toLowerCase();

            const isDubbingSection =

                headerText.includes("doppiatori italiani") ||
                headerText.includes("voci italiane") ||
                headerText.includes("voce italiana") ||
                headerText.includes("doppiaggio italiano") ||
                headerText.includes("cast del doppiaggio") ||
                headerText.includes("cast italiano");

            if (!isDubbingSection) {

                return;
            }

            let td =
                $(tr)
                    .find("td")
                    .first();

            if (!td.length) {

                td =
                    $(tr)
                        .next("tr")
                        .find("td")
                        .first();
            }

            if (!td.length) {

                return;
            }

            console.log("HEADER:");
            console.log(headerText);

            console.log(
                "TD HTML:"
            );

            console.log(
                td.html()
            );

            const container =
                td.find("div").first();

            console.log(
                "CONTAINER HTML:"
            );
            console.log(
                container.html()
            );

            container.children().each(
                (i, element) => {

                const tagName =
                    element.tagName?.toLowerCase();

                // =====================
                // RIDOPPIAGGIO
                // =====================

                if (tagName === "p") {

                    const text =
                        $(element)
                            .text()
                            .replace(/\s+/g, " ")
                            .trim();

                    const match =
                        text.match(
                            /ridoppiaggio\s*\((\d{4})\)/i
                        );

                    if (match) {

                        const year =
                            match[1];

                        currentVersion = {

                            id:
                                `redub_${year}`,

                            name:
                                `Ridoppiaggio (${year})`,

                            type:
                                "redub",

                            cast: []
                        };

                        dubbingVersions.push(
                            currentVersion
                        );
                    }

                    return;
                }

                // =====================
                // LISTA DOPPIATORI
                // =====================

                if (tagName !== "ul") {

                    return;
                }

                $(element)
                    .find("li")
                    .each((j, li) => {

                        const line =
                            $(li)
                                .text()
                                .replace(/\s+/g, " ")
                                .trim();

                        let parts = null;

                        if (line.includes(":")) {

                            parts =
                                line.split(":");

                        } else if (
                            line.includes(" - ")
                        ) {

                            parts =
                                line.split(" - ");

                        } else if (
                            line.includes(" – ")
                        ) {

                            parts =
                                line.split(" – ");
                        }

                        if (
                            !parts ||
                            parts.length < 2
                        ) {

                            return;
                        }

                        const actorName =
                            parts[0].trim();

                        const actorLink =
                            $(li)
                                .find("a")
                                .first()
                                .attr("href");

                        const wikipediaUrl =
                            actorLink
                                ? `https:${actorLink}`
                                : null;

                        const characterName =
                            parts
                                .slice(1)
                                .join(":")
                                .trim();

                        if (
                            actorName === "Pat Welsh"
                        ) {

                            return;
                        }

                        currentVersion.cast.push({

                            actorName,

                            characterName,

                            wikipediaUrl
                        });

                    });

            });


        });
        return dubbingVersions.filter(
            version =>
                version.cast.length > 0
        );

    } catch {

        return [];
    }
}
// ========================================
// ROUTE
// ========================================

app.get("/dubbers", async (req, res) => {

    try {

        const tmdbId =
            req.query.tmdbId;

        // ========================================
        // CACHE LOOKUP
        // ========================================

        const cached = db
            .prepare(
                "SELECT json FROM dubbing_cache WHERE tmdbId = ?"
            )
            .get(tmdbId);

        if (cached) {

            console.log(
                "CACHE HIT:",
                tmdbId
            );

            return res.json(
                JSON.parse(cached.json)
            );
        }

        if (!tmdbId) {

            return res.status(400).json({

                error:
                    "tmdbId missing"
            });
        }

        console.log(
            "Requested TMDB ID:",
            tmdbId
        );

        const imdbId =
            await getImdbIdFromTmdb(
                tmdbId
            );

        if (!imdbId) {

            return res.status(404).json({

                error:
                    "IMDb not found"
            });
        }

        const wikidataId =
            await getWikidataIdFromImdb(
                imdbId
            );

        if (!wikidataId) {

            return res.status(404).json({

                error:
                    "Wikidata not found"
            });
        }

        const wikipediaTitle =
            await getItalianWikipediaTitleFromWikidata(
                wikidataId
            );

        if (!wikipediaTitle) {

            return res.status(404).json({

                error:
                    "Wikipedia page not found"
            });
        }

        console.log(
            "Wikipedia title:",
            wikipediaTitle
        );

        const dubbingVersions =
            await getWikipediaDubbersByTitle(
                wikipediaTitle
            );

        const result = {

            tmdbId,

            imdbId,

            wikidataId,

            wikipediaTitle,

            source:
                "wikipedia",

            verified:
                dubbingVersions.length > 0,

            dubbingVersions
        };

        // ========================================
        // SAVE CACHE
        // ========================================

        db.prepare(

            `INSERT OR REPLACE INTO
            dubbing_cache (
                tmdbId,
                json,
                updatedAt
            )
            VALUES (?, ?, ?)`

        ).run(

            tmdbId,

            JSON.stringify(result),

            Date.now()
        );

        console.log(
            "CACHE SAVED:",
            tmdbId
        );

        return res.json(result);

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            error:
                "Dubbing lookup failed"
        });
    }
});

async function getWikipediaPage(title, year) {

    const candidates = [

        `${title} (film ${year})`,
        `${title} (${year} film)`,
        `${title} (${year})`,
        title
    ];

    for (const candidate of candidates) {

        try {

            console.log(
                "Trying Wikipedia:",
                candidate
            );

            const page =
                await wiki.page(candidate);

            const summary =
                await page.summary();

            return {

                success: true,

                searched:
                    candidate,

                title:
                    summary.title,

                extract:
                    summary.extract
            };

        } catch {

            // prova il successivo
        }
    }

    return {

        success: false
    };
}

app.get("/wiki-test", async (req, res) => {

    const title =
        req.query.title;

    const year =
        req.query.year;

    if (!title) {

        return res.status(400).json({

            error:
                "title missing"
        });
    }

    const result =
        await getWikipediaPage(
            title,
            year
        );

    return res.json(result);
});

async function getImdbIdFromTmdb(tmdbId) {

    try {

        const response =
            await axios.get(

                `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids`,

                {
                    params: {
                        api_key: TMDB_API_KEY
                    }
                }
            );

        return response.data.imdb_id;

    } catch (error) {

        console.log(
            "TMDB external_ids failed:",
            tmdbId
        );

        return null;
    }
}

app.get("/tmdb-test", async (req, res) => {

    const tmdbId =
        req.query.tmdbId;

    if (!tmdbId) {

        return res.status(400).json({

            error:
                "tmdbId missing"
        });
    }

    const imdbId =
        await getImdbIdFromTmdb(
            tmdbId
        );

    const wikidataId =
        await getWikidataIdFromImdb(
            imdbId
        );

    const wikipediaTitle =
        await getItalianWikipediaTitleFromWikidata(
            wikidataId
        );

    return res.json({

        tmdbId,
        imdbId,
        wikidataId,
        wikipediaTitle
    });
});

async function getWikidataIdFromImdb(imdbId) {

    if (!imdbId) {

        return null;
    }

    try {

        const query = `
            SELECT ?item WHERE {
              ?item wdt:P345 "${imdbId}" .
            }
            LIMIT 1
        `;

        const response =
            await axios.get(
                "https://query.wikidata.org/sparql",
                {
                    params: {
                        query,
                        format: "json"
                    },

                    headers: {
                        "User-Agent":
                            "CineNexus/1.0 (https://cinenexus.app)",
                        "Accept":
                            "application/sparql-results+json"
                    }
                }
            );

        console.log(
            "SPARQL RAW RESPONSE:"
        );

        console.log(
            JSON.stringify(
                response.data,
                null,
                2
            )
        );

        const binding =
            response.data
                ?.results
                ?.bindings?.[0];

        if (!binding) {

            return null;
        }

        const entityUrl =
            binding.item.value;

        return entityUrl
            .split("/")
            .pop();

    } catch (error) {

        console.log(
            "SPARQL ERROR:"
        );

        console.log(error);

        return null;
    }
}

async function getItalianWikipediaTitleFromWikidata(wikidataId) {

    if (!wikidataId) {

        return null;
    }

    try {

        const response =
            await axios.get(
                "https://www.wikidata.org/w/api.php",
                {
                    params: {
                        action: "wbgetentities",
                        ids: wikidataId,
                        props: "sitelinks",
                        format: "json"
                    },

                    headers: {
                        "User-Agent":
                            "CineNexus/1.0 (https://cinenexus.app)"
                    }
                }
            );

        console.log(
            "WIKIDATA ENTITY RESPONSE:"
        );

        console.log(
            JSON.stringify(
                response.data,
                null,
                2
            )
        );

        return response
            .data
            .entities?.[wikidataId]
            ?.sitelinks?.itwiki
            ?.title || null;

    } catch (error) {

        console.log(
            "WIKIDATA ENTITY ERROR:"
        );

        console.log(error);

        return null;
    }
}

async function getWikidataIdFromWikipediaTitle(title) {

    try {

        const response =
            await axios.get(
                "https://it.wikipedia.org/w/api.php",
                {
                    params: {
                        action: "query",
                        prop: "pageprops",
                        titles: title,
                        format: "json"
                    },

                    headers: {
                        "User-Agent":
                            "CineNexus/1.0 (contact: support@cinenexus.app)"
                    }
                }
            );

        const pages =
            response.data.query.pages;

        const page =
            Object.values(pages)[0];

        return page?.pageprops?.wikibase_item || null;

    } catch (error) {

        console.log(
            "WIKIPEDIA TITLE ERROR:"
        );

        console.log(error);

        return null;
    }
}

async function getTmdbPersonIdFromWikidata(
    wikidataId,
    wikipediaTitle
) {

    try {

        const searchName =
            wikipediaTitle.replaceAll("_", " ");

        const searchResponse =
            await axios.get(

                "https://api.themoviedb.org/3/search/person",

                {
                    params: {
                        api_key: TMDB_API_KEY,
                        query: searchName
                    }
                }
            );

        for (const person of searchResponse.data.results) {

            const externalIdsResponse =
                await axios.get(

                    `https://api.themoviedb.org/3/person/${person.id}/external_ids`,

                    {
                        params: {
                            api_key: TMDB_API_KEY
                        }
                    }
                );

            if (

                externalIdsResponse.data.wikidata_id ===
                wikidataId

            ) {

                return person.id;
            }
        }

        return null;

    } catch (error) {

        console.log(
            "TMDB PERSON LOOKUP ERROR:"
        );

        console.log(error);

        return null;
    }
}

app.get("/dubber-person", async (req, res) => {

    try {

        const wikipediaUrl =
            req.query.wikipediaUrl;

        if (!wikipediaUrl) {

            return res.status(400).json({

                error:
                    "wikipediaUrl missing"
            });
        }

        const title =
            decodeURIComponent(

                wikipediaUrl
                    .split("/wiki/")
                    .pop()
            );

        const wikidataId =
            await getWikidataIdFromWikipediaTitle(
                title
            );

        if (!wikidataId) {

            return res.status(404).json({

                error:
                    "Wikidata not found"
            });
        }

        return res.json({

            wikipediaTitle: title,

            wikidataId
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            error:
                "Dubber lookup failed"
        });
    }
});

app.get("/voice-credits", async (req, res) => {

    try {

        const personId =
            req.query.personId;

        if (!personId) {

            return res.status(400).json({

                error: "personId missing"
            });
        }

        const externalIdsResponse =
            await axios.get(

                `https://api.themoviedb.org/3/person/${personId}/external_ids`,

                {
                    params: {
                        api_key: TMDB_API_KEY
                    }
                }
            );

        const wikidataId =
            externalIdsResponse.data.wikidata_id;

        const wikipediaTitle =
            await getItalianWikipediaTitleFromWikidata(
                wikidataId
            );

        const wikipediaUrl =
            `https://it.wikipedia.org/wiki/${encodeURIComponent(
                wikipediaTitle
            )}`;

        const response =
            await axios.get(
                wikipediaUrl,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0"
                    }
                }
            );

        const $ =
            cheerio.load(
                response.data
            );

        const filmHeader = $("h3").filter((i, el) =>
            $(el).text().replace(/\[.*?\]/g, "").trim() === "Film"
        ).first();

        let current = filmHeader.parent().next();

        console.log("========== FILM NODES ==========");

        while (
            current.length &&
            current[0].tagName !== "h2" &&
            current[0].tagName !== "h3"
        ) {

            console.log("TAG:", current[0].tagName);
            console.log(
                current.text()
                    .replace(/\s+/g, " ")
                    .trim()
                    .substring(0, 300)
            );

            console.log("--------------------------------");

            current = current.next();
        }

        const sections = [];

        $("h2, h3").each((i, el) => {

            sections.push({

                tag: el.tagName,

                title: $(el)
                    .text()
                    .replace(/\[.*?\]/g, "")
                    .replace(/\s+/g, " ")
                    .trim()

            });

        });

        return res.json({

            personId,

            wikidataId,

            wikipediaTitle,

            sections
        });

    } catch (e) {

        console.error(e);

        return res.status(500).json({

            error: e.toString()
        });
    }
});

app.get("/voice-debug", async (req, res) => {

    try {

        const personId =
            req.query.personId;

        if (!personId) {

            return res.status(400).json({

                error: "personId missing"
            });
        }

        const externalIdsResponse =
            await axios.get(

                `https://api.themoviedb.org/3/person/${personId}/external_ids`,

                {
                    params: {
                        api_key: TMDB_API_KEY
                    }
                }
            );

        const wikidataId =
            externalIdsResponse.data.wikidata_id;

        console.log(
            "WIKIDATA:",
            wikidataId
        );

        const wikipediaTitle =
            await getItalianWikipediaTitleFromWikidata(
                wikidataId
            );

        console.log(
            "WIKIPEDIA:",
            wikipediaTitle
        );

        const wikipediaUrl =

            `https://it.wikipedia.org/wiki/${encodeURIComponent(
                wikipediaTitle
            )}`;

        const response =
            await axios.get(
                wikipediaUrl,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0"
                    }
                }
            );

        const $ =
            cheerio.load(
                response.data
            );

        console.log(response.data.substring(0, 5000));

        console.log(
            "========== H2 =========="
        );

        $("h2").each((i, el) => {

            console.log(
                $(el).text()
            );
        });

        console.log(
            "========== H3 =========="
        );

        $("h3").each((i, el) => {

            const title =
                $(el).text().trim();

            console.log(
                "SECTION:",
                title
            );

            let current =
                $(el).next();

            let count = 0;

            while (
                current.length &&
                current[0].tagName !== "h3" &&
                current[0].tagName !== "h2" &&
                count < 10
            ) {

                console.log(
                    current.text()
                        .replace(/\s+/g, " ")
                        .trim()
                        .substring(0, 300)
                );

                current =
                    current.next();

                count++;
            }

        });

        $("h3").each((i, el) => {

            console.log(
                $(el).text()
            );
        });

        res.json({

            personId,
            wikidataId,
            wikipediaTitle
        });

    } catch (e) {

        console.error(e);

        res.status(500).json({

            error: e.toString()
        });
    }
});

app.get("/dubber-tmdb", async (req, res) => {

    try {

        const wikipediaUrl =
            req.query.wikipediaUrl;

        if (!wikipediaUrl) {

            return res.status(400).json({

                error:
                    "wikipediaUrl missing"
            });
        }

        const wikipediaTitle =
            decodeURIComponent(

                wikipediaUrl
                    .split("/wiki/")
                    .pop()
            );

        const wikidataId =
            await getWikidataIdFromWikipediaTitle(
                wikipediaTitle
            );

        if (!wikidataId) {

            return res.status(404).json({

                error:
                    "Wikidata not found"
            });
        }

        const personId =
            await getTmdbPersonIdFromWikidata(

                wikidataId,

                wikipediaTitle
            );

        if (!personId) {

            return res.status(404).json({

                error:
                    "TMDb person not found"
            });
        }

        return res.json({

            wikipediaTitle,

            wikidataId,

            personId
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            error:
                "Dubber TMDb lookup failed"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `CineNexus backend running on port ${PORT}`
    );
});


