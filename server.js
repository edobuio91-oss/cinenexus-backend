const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const wiki = require("wikipedia");
const Database = require("better-sqlite3");
const TMDB_API_KEY = "ccfb56079b1e4e01c68c03045ea23a21";

const db =
    new Database("cinenexus.db");

const app = express();

app.use(cors());

// ========================================
// HELPERS
// ========================================

function normalizeMovieTitle(title) {

    return (title || "")
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// ========================================
// CONFIDENCE
// ========================================

function calculateConfidence(
    dubbers,
    wikipediaCheck,
    source
) {

    let confidence = 0;

    if (source === "wikipedia") {

        confidence += 0.35;
    }

    if (dubbers.length >= 15) {

        confidence += 0.5;

    } else if (dubbers.length >= 8) {

        confidence += 0.3;

    } else if (dubbers.length >= 3) {

        confidence += 0.15;
    }

    const uniqueActors =
        new Set(

            dubbers.map(
                dubber =>
                    dubber.actorName
            )
        );

    if (

        uniqueActors.size >=
        dubbers.length * 0.8

    ) {

        confidence += 0.2;
    }

    const suspiciousEntries =
        dubbers.filter(dubber =>

            dubber.characterName
                .length < 2 ||

            dubber.actorName
                .length < 2
        );

    if (
        suspiciousEntries.length === 0
    ) {

        confidence += 0.2;
    }

    if (
        wikipediaCheck.found
    ) {

        confidence += 0.05;
    }

    if (
        wikipediaCheck.hasDubbingSection
    ) {

        confidence += 0.05;
    }

    if (confidence > 1) {

        confidence = 1;
    }

    return Number(
        confidence.toFixed(2)
    );
}

// ========================================
// WIKIPEDIA CHECK
// ========================================

async function verifyWithWikipedia(movie) {

    try {

        const page =
            await wiki.page(movie);

        const summary =
            await page.summary();

        const content =
            summary.extract
                .toLowerCase();

        const hasDubbingSection =

            content.includes("doppi") ||

            content.includes("doppiaggio") ||

            content.includes("doppiatori");

        return {

            found: true,

            hasDubbingSection,

            content
        };

    } catch {

        return {

            found: false,

            hasDubbingSection: false,

            content: ""
        };
    }
}

// ========================================
// WIKIPEDIA DUBBERS
// ========================================

async function getWikipediaDubbers(
    movie,
    year
) {

    try {

        const pageTitle =

            year

                ? `${movie}_(film_${year})`

                : movie.replace(/\s+/g, "_");

        const wikipediaUrl =

            `https://it.wikipedia.org/wiki/${pageTitle}`;

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

        const dubbers = [];

        $(".sinottico tr").each((i, tr) => {

            const headerText =

                $(tr)
                    .find("th")
                    .first()
                    .text()
                    .replace(/\s+/g, " ")
                    .trim()
                    .toLowerCase();

            if (

                !headerText.includes(
                    "doppiatori italiani"
                )

            ) {

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

            td.find("li").each((i, li) => {

                const line =
                    $(li)
                        .text()
                        .replace(/\s+/g, " ")
                        .trim();

                let parts = null;

                if (
                    line.includes(":")
                ) {

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
                    parts[0]
                        .trim();

                const characterName =
                    parts
                        .slice(1)
                        .join(":")
                        .trim();

                if (

                    actorName.length < 2 ||

                    characterName.length < 2

                ) {

                    return;
                }

                dubbers.push({

                    characterName,

                    actorName
                });
            });
        });

        return dubbers;

    } catch (error) {

        console.log(
            "Wikipedia parser failed"
        );

        return [];
    }
}

// ========================================
// MATCH VALIDATION
// ========================================

function isMatchValid(
    bestMatch,
    movie,
    year
) {

    if (!bestMatch) {

        return false;
    }

    const normalizedMovie =
        normalizeMovieTitle(movie);

    const normalizedTitle =
        normalizeMovieTitle(
            bestMatch.title
        );

    const normalizedTmdbTitle =
        normalizeMovieTitle(
            bestMatch.tmdbTitle
        );

    const normalizedOriginalTitle =
        normalizeMovieTitle(
            bestMatch.tmdbOriginalTitle
        );

    const titleMatches =

        normalizedTitle === normalizedMovie ||

        normalizedTmdbTitle === normalizedMovie ||

        normalizedOriginalTitle === normalizedMovie ||

        normalizedTitle.includes(normalizedMovie) ||

        normalizedTmdbTitle.includes(normalizedMovie) ||

        normalizedOriginalTitle.includes(normalizedMovie);

    const yearMatches =

        !year ||

        bestMatch.year === year;

    return (
        titleMatches &&
        yearMatches
    );
}

// ========================================
// SQLITE MATCHING
// ========================================

function findBestMatch(
    movie,
    year,
    tmdbId,
    runtime
) {

    const normalizedMovie =
        normalizeMovieTitle(movie);

    // ========================================
    // TMDB EXACT MATCH
    // ========================================

    if (tmdbId) {

        console.log(
            "Searching by TMDB ID:",
            tmdbId
        );

        const exactMatch =
            db.prepare(`

                SELECT *
                FROM titles
                WHERE tmdbId = ?

            `).get(tmdbId);

        if (exactMatch) {

            if (

                runtime &&
                exactMatch.runtime

            ) {

                const runtimeDifference =
                    Math.abs(
                        runtime -
                        exactMatch.runtime
                    );

                console.log(
                    "Runtime difference:",
                    runtimeDifference
                );

                if (runtimeDifference >= 25) {

                    console.log(
                        "TMDB exact match rejected"
                    );

                } else {

                    console.log(
                        "TMDB EXACT MATCH FOUND:",
                        exactMatch.title
                    );

                    return exactMatch;
                }

            } else {

                return exactMatch;
            }
        }
    }

    // ========================================
    // SQLITE SEARCH
    // ========================================

    const possibleMatches =
        db.prepare(`

            SELECT *
            FROM titles

            WHERE

                normalizedTitle LIKE ?

                OR

                LOWER(tmdbTitle) LIKE ?

                OR

                LOWER(tmdbOriginalTitle) LIKE ?

        `).all(

            `%${normalizedMovie}%`,
            `%${normalizedMovie}%`,
            `%${normalizedMovie}%`
        );

    if (!possibleMatches.length) {

        return null;
    }

    let scoredMatches = [];

    for (const item of possibleMatches) {

        let score = 0;

        const normalizedTitle =
            normalizeMovieTitle(
                item.title
            );

        const normalizedTmdbTitle =
            normalizeMovieTitle(
                item.tmdbTitle
            );

        const normalizedOriginalTitle =
            normalizeMovieTitle(
                item.tmdbOriginalTitle
            );

        // EXACT TITLE

        if (
            normalizedTitle ===
            normalizedMovie
        ) {

            score += 150;
        }

        if (
            normalizedTmdbTitle ===
            normalizedMovie
        ) {

            score += 120;
        }

        if (
            normalizedOriginalTitle ===
            normalizedMovie
        ) {

            score += 120;
        }

        // PARTIAL

        if (
            normalizedTitle.includes(
                normalizedMovie
            )
        ) {

            score += 50;
        }

        // YEAR

        if (
            year &&
            item.year === year
        ) {

            score += 200;
        }

        // RUNTIME

        if (

            runtime &&
            item.runtime

        ) {

            const runtimeDifference =
                Math.abs(
                    runtime -
                    item.runtime
                );

            if (runtimeDifference <= 10) {

                score += 120;

            } else if (
                runtimeDifference >= 30
            ) {

                score -= 300;
            }
        }

        // ANIMATION BOOST

        if (
            item.category === "animation"
        ) {

            score += 25;
        }

        item.score = score;

        scoredMatches.push(item);
    }

    scoredMatches.sort(
        (a, b) => b.score - a.score
    );

    console.log(
        "BEST MATCH:",
        scoredMatches[0]
    );

    return scoredMatches[0];
}

// ========================================
// ROUTE
// ========================================

app.get("/dubbers", async (req, res) => {

    try {

        const movie =
            req.query.movie;

        const year =
            req.query.year;

        const tmdbId =
            req.query.tmdbId;

        const runtime =
            parseInt(
                req.query.runtime || "0"
            );

        if (!movie) {

            return res.status(400).json({

                error:
                    "Movie title missing"
            });
        }

        console.log(
            "Requested movie:",
            movie
        );

        console.log(
            "Requested year:",
            year
        );

        console.log(
            "Requested TMDB ID:",
            tmdbId
        );

        console.log(
            "Requested runtime:",
            runtime
        );

        const bestMatch =
            findBestMatch(
                movie,
                year,
                tmdbId,
                runtime
            );

        let dubbers = [];

        let source =
            "antoniogenna";

        let matchedTitle =
            null;

        if (

            bestMatch &&

            isMatchValid(
                bestMatch,
                movie,
                year
            )

        ) {

            matchedTitle =
                bestMatch.title;

            console.log(
                "Matched title:",
                matchedTitle
            );

            console.log(
                "Matched URL:",
                bestMatch.antoniogennaUrl
            );

            const response =
                await axios.get(
                    bestMatch.antoniogennaUrl
                );

            const $ =
                cheerio.load(response.data);

            $("tr").each((index, element) => {

                const cells =
                    $(element).find("td");

                if (cells.length >= 2) {

                    const texts = [];

                    cells.each((i, cell) => {

                        texts.push(

                            $(cell)
                                .text()
                                .replace(/\n/g, " ")
                                .replace(/\s+/g, " ")
                                .trim()
                        );
                    });

                    const filteredTexts =
                        texts.filter(

                            text =>

                                text.length > 0 &&
                                text !==
                                "PERSONAGGI" &&
                                text !==
                                "DOPPIATORI ITALIANI"
                        );

                    if (filteredTexts.length >= 2) {

                        const characterName =
                            filteredTexts[0];

                        const actorName =
                            filteredTexts[
                                filteredTexts.length - 1
                            ];

                        const invalidWords = [

                            "interpreti",
                            "doppiatori",
                            "aggiunte",
                            "modifiche",
                            "realizzazione",
                            "antonio genna"
                        ];

                        const isInvalid =

                            invalidWords.some(word =>

                                characterName
                                    .toLowerCase()
                                    .includes(word)

                                ||

                                actorName
                                    .toLowerCase()
                                    .includes(word)
                            );

                        if (

                            !isInvalid &&

                            characterName.length > 1 &&

                            actorName.length > 1

                        ) {

                            dubbers.push({

                                characterName,

                                actorName
                            });
                        }
                    }
                }
            });
        }

        const wikipediaCheck =
            await verifyWithWikipedia(
                movie
            );

        const antonioGennaRejected =

            dubbers.length < 3 ||

            !bestMatch ||

            !isMatchValid(
                bestMatch,
                movie,
                year
            );

        const allowWikipediaFallback =

            antonioGennaRejected &&

            wikipediaCheck.found &&

            (

                !runtime ||

                !bestMatch?.runtime ||

                Math.abs(
                    runtime -
                    bestMatch.runtime
                ) <= 15
            );

        if (allowWikipediaFallback) {

            console.log(
                "Using Wikipedia fallback"
            );

            const wikipediaDubbers =
                await getWikipediaDubbers(
                    movie,
                    year
                );

            if (
                wikipediaDubbers.length > 0
            ) {

                dubbers =
                    wikipediaDubbers;

                source =
                    "wikipedia";
            }
        }

        const confidence =
            calculateConfidence(

                dubbers,

                wikipediaCheck,

                source
            );

        const verified =
            confidence >= 0.5;

        console.log(
            "Dubbers found:",
            dubbers.length
        );

        return res.json({

            movie,

            matchedTitle,

            source,

            verified,

            confidence,

            wikipediaCheck,

            dubbers
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            error:
                "Scraping failed"
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

    try {

        const response =
            await axios.get(
                "https://www.wikidata.org/w/api.php",
                {
                    params: {
                        action: "wbsearchentities",
                        search: imdbId,
                        language: "en",
                        format: "json"
                    }
                }
            );

        console.log(
            JSON.stringify(
                response.data,
                null,
                2
            )
        );

        return null;

    } catch {

        return null;
    }
}

async function getItalianWikipediaTitleFromWikidata(wikidataId) {

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
                    }
                }
            );

        return response
            .data
            .entities?.[wikidataId]
            ?.sitelinks?.itwiki
            ?.title || null;

    } catch {

        return null;
    }
}

app.listen(3000, () => {

    console.log(
        "CineNexus backend running on port 3000"
    );
});
