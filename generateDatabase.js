const Database = require("better-sqlite3");
const axios = require("axios");
const cheerio = require("cheerio");

// ========================================
// CONFIG
// ========================================

const TMDB_API_KEY =
    "ccfb56079b1e4e01c68c03045ea23a21";

const db =
    new Database("cinenexus.db");

db.pragma("journal_mode = WAL");

// ========================================
// RESET TABLES
// ========================================

db.prepare(
    "DELETE FROM dubbers"
).run();

db.prepare(
    "DELETE FROM aliases"
).run();

db.prepare(
    "DELETE FROM sources"
).run();

db.prepare(
    "DELETE FROM entities"
).run();

// ========================================
// INDEX PAGES
// ========================================

const indexPages = [];

// FILM

for (let i = 1; i <= 25; i++) {

    if (i === 1) {

        indexPages.push(
            "https://www.antoniogenna.net/doppiaggio/film.htm"
        );

    } else {

        indexPages.push(
            `https://www.antoniogenna.net/doppiaggio/film-${i}.htm`
        );
    }
}

// ANIMAZIONE

for (let i = 1; i <= 10; i++) {

    if (i === 1) {

        indexPages.push(
            "https://www.antoniogenna.net/doppiaggio/anim.htm"
        );

    } else {

        indexPages.push(
            `https://www.antoniogenna.net/doppiaggio/anim-${i}.htm`
        );
    }
}

// ========================================
// HELPERS
// ========================================

function delay(ms) {

    return new Promise(resolve =>

        setTimeout(resolve, ms)
    );
}

function cleanText(text) {

    return (text || "")
        .replace(/\s+/g, " ")
        .replace(/\n/g, " ")
        .trim();
}

function normalizeTitle(title) {

    return cleanText(title)
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extractYear(text) {

    const match =
        text.match(/\b(19|20)\d{2}\b/);

    return match
        ? match[0]
        : "";
}

function extractRuntime(text) {

    const match =
        text.match(/DURATA:\s*(\d+)/i);

    if (!match) {

        return null;
    }

    return parseInt(match[1]);
}

// ========================================
// TMDB DETAILS
// ========================================

async function getTmdbDetails(
    id,
    mediaType
) {

    try {

        await delay(150);

        const endpoint =

            mediaType === "tv"
                ? "tv"
                : "movie";

        const response =
            await axios.get(

                `https://api.themoviedb.org/3/${endpoint}/${id}`,

                {

                    params: {

                        api_key:
                            TMDB_API_KEY,

                        language:
                            "it-IT"
                    }
                }
            );

        const data =
            response.data;

        return {

            runtime:

                data.runtime ||

                data.episode_run_time?.[0] ||

                null,

            italianTitle:

                data.title ||

                data.name ||

                "",

            originalTitle:

                data.original_title ||

                data.original_name ||

                ""
        };

    } catch {

        return {

            runtime: null,
            italianTitle: "",
            originalTitle: ""
        };
    }
}

// ========================================
// TMDB MATCH
// ========================================

async function getTmdbMatch(
    title,
    year
) {

    try {

        await delay(250);

        const response =
            await axios.get(

                "https://api.themoviedb.org/3/search/multi",

                {

                    params: {

                        api_key:
                            TMDB_API_KEY,

                        query:
                            title,

                        language:
                            "it-IT"
                    }
                }
            );

        const results =
            response.data.results || [];

            console.log(
                "SEARCH:",
                title,
                year
            );

            for (const item of results) {

                console.log(
                    item.id,
                    item.media_type,
                    item.title || item.name,
                    item.release_date ||
                    item.first_air_date
                );
            }

        if (!results.length) {

            console.log(
                "TMDB NOT FOUND:",
                title
            );

            return null;
        }

        let bestMatch = null;

        let bestScore = -999;

        for (const item of results) {

            if (

                item.media_type !== "movie" &&

                item.media_type !== "tv"

            ) {

                continue;
            }

            const tmdbTitle =
                normalizeTitle(

                    item.title ||

                    item.name ||

                    ""
                );

            const normalizedInput =
                normalizeTitle(title);

            let score = 0;

            // EXACT TITLE

            if (
                tmdbTitle ===
                normalizedInput
            ) {

                score += 100;
            }

            // PARTIAL TITLE

            if (
                tmdbTitle.includes(
                    normalizedInput
                )
            ) {

                score += 40;
            }

            // YEAR

            const releaseDate =

                item.release_date ||

                item.first_air_date ||

                "";

            const resultYear =
                releaseDate.slice(0, 4);

            if (
                year &&
                resultYear === year
            ) {

                score += 80;
            }

            // ANIMATION BOOST

            if (
                item.genre_ids?.includes(16)
            ) {

                score += 15;
            }

            // POPULARITY

            score += Math.min(
                item.popularity || 0,
                20
            );

            if (score > bestScore) {

                bestScore = score;

                bestMatch = item;
            }
        }

        if (!bestMatch) {

            return null;
        }

        // ========================================
        // DETAILED TMDB FETCH
        // ========================================

        const details =
            await getTmdbDetails(

                bestMatch.id,
                bestMatch.media_type
            );

        console.log(
            "TMDB MATCH:",
            title,
            "->",
            bestMatch.id,
            "RUNTIME:",
            details.runtime
        );

        return {

            tmdbId:
                bestMatch.id,

            tmdbTitle:

                bestMatch.title ||

                bestMatch.name ||

                "",

            tmdbItalianTitle:
                details.italianTitle ||

                "",

            tmdbOriginalTitle:

                details.originalTitle ||

                "",

            tmdbRuntime:
                details.runtime,

            tmdbMediaType:
                bestMatch.media_type,

            tmdbReleaseDate:

                bestMatch.release_date ||

                bestMatch.first_air_date ||

                ""
        };

    } catch (error) {

        console.log(
            "TMDB FAILED:",
            title
        );

        return null;
    }
}

// ========================================
// METADATA EXTRACTION
// ========================================

async function extractMetadata(url) {

    try {

        await delay(300);

        const response =
            await axios.get(url, {

                timeout: 15000,

                headers: {

                    "User-Agent":
                        "Mozilla/5.0"
                }
            });

        const $ =
            cheerio.load(response.data);

        const bodyText =
            cleanText(
                $("body").text()
            );

        const year =
            extractYear(bodyText);

        const runtime =
            extractRuntime(bodyText);

        let director = "";

        const directorPatterns = [

            /Regia:? ([^.|\n]+)/i,
            /Diretto da:? ([^.|\n]+)/i,
            /Regista:? ([^.|\n]+)/i
        ];

        for (const pattern of directorPatterns) {

            const match =
                bodyText.match(pattern);

            if (match) {

                director =
                    cleanText(match[1]);

                break;
            }
        }

        let category =
            "movie";

        if (
            url.includes("/anim/")
        ) {

            category =
                "animation";
        }

        return {

            success: true,

            year,
            runtime,
            director,
            category
        };

    } catch {

        return {

            success: false,

            year: "",
            runtime: null,
            director: "",
            category: "unknown"
        };
    }
}

// ========================================
// INSERT ENTITY
// ========================================

function insertEntity(data) {

    const stmt =
        db.prepare(`

            INSERT INTO entities (

                canonicalTitle,
                canonicalOriginalTitle,

                normalizedCanonicalTitle,

                year,
                runtime,

                mediaType,
                category,

                director,

                tmdbId,
                tmdbMediaType,
                tmdbReleaseDate,

                sourceConfidence

            )

            VALUES (

                @canonicalTitle,
                @canonicalOriginalTitle,

                @normalizedCanonicalTitle,

                @year,
                @runtime,

                @mediaType,
                @category,

                @director,

                @tmdbId,
                @tmdbMediaType,
                @tmdbReleaseDate,

                @sourceConfidence
            )

        `);

    const result =
        stmt.run(data);

    return result.lastInsertRowid;
}

function insertAlias(data) {

    db.prepare(`

        INSERT INTO aliases (

            entityId,

            alias,
            normalizedAlias,

            language,

            isPrimary,

            source

        )

        VALUES (

            @entityId,

            @alias,
            @normalizedAlias,

            @language,

            @isPrimary,

            @source
        )

    `).run(data);
}

function insertSource(data) {

    db.prepare(`

        INSERT INTO sources (

            entityId,

            sourceName,

            sourceUrl,

            externalId,

            rawTitle

        )

        VALUES (

            @entityId,

            @sourceName,

            @sourceUrl,

            @externalId,

            @rawTitle
        )

    `).run(data);
}

// ========================================
// MAIN
// ========================================

async function generateDatabase() {

    let insertedCount = 0;

    for (const pageUrl of indexPages) {

        console.log(
            "\nSCANNING:",
            pageUrl
        );

        try {

            const response =
                await axios.get(pageUrl);

            const $ =
                cheerio.load(response.data);

            const links = [];



           $("a").each((index, element) => {

                const href =
                    $(element).attr("href");

                const title =
                    cleanText(
                        $(element).text()
                    );

                if (!href || !title) {

                    return;
                }

                const lowerHref =
                    href.toLowerCase();

                const isValidPage =

                    lowerHref.endsWith(".htm") &&

                    (
                        lowerHref.includes("film/")
                        ||
                        lowerHref.includes("film1/")
                        ||
                        lowerHref.includes("anim/")
                    ) &&

                    !lowerHref.includes("film.htm") &&

                    !lowerHref.includes("film-") &&

                    !lowerHref.includes("anim.htm") &&

                    !lowerHref.includes("anim-");

                if (isValidPage) {

                    const fullUrl =
                        new URL(
                            href,
                            pageUrl
                        ).href;

                    links.push({

                        title,
                        url: fullUrl
                    });
                }
            });

            for (const link of links) {

                console.log(
                    "\nEXTRACTING:",
                    link.title
                );

                const metadata =
                    await extractMetadata(
                        link.url
                    );

                const tmdbData =
                    await getTmdbMatch(

                        link.title,
                        metadata.year
                    );

                const entityId =
                    insertEntity({

                        canonicalTitle:

                            tmdbData?.tmdbItalianTitle ||

                            tmdbData?.tmdbTitle ||

                            link.title,

                        canonicalOriginalTitle:

                            tmdbData?.tmdbOriginalTitle ||

                            link.title,

                        normalizedCanonicalTitle:

                            normalizeTitle(

                                tmdbData?.tmdbItalianTitle ||

                                tmdbData?.tmdbTitle ||

                                link.title
                            ),

                        year:
                            metadata.year,

                        runtime:

                            metadata.runtime ||

                            tmdbData?.tmdbRuntime ||

                            null,

                        mediaType:

                            tmdbData?.tmdbMediaType ||

                            metadata.category,

                        category:
                            metadata.category,

                        director:
                            metadata.director,

                        tmdbId:
                            tmdbData?.tmdbId || null,

                        tmdbMediaType:
                            tmdbData?.tmdbMediaType || "",

                        tmdbReleaseDate:
                            tmdbData?.tmdbReleaseDate || "",

                        sourceConfidence:
                            0.8
                    });

                // ========================================
                // PRIMARY ALIAS
                // ========================================

                insertAlias({

                    entityId,

                    alias:
                        link.title,

                    normalizedAlias:
                        normalizeTitle(
                            link.title
                        ),

                    language:
                        "it",

                    isPrimary:
                        1,

                    source:
                        "antoniogenna"
                });

                // ========================================
                // TMDB ITALIAN TITLE ALIAS
                // ========================================

                if (

                    tmdbData?.tmdbItalianTitle &&

                    normalizeTitle(
                        tmdbData.tmdbItalianTitle
                    ) !==

                    normalizeTitle(
                        link.title
                    )

                ) {

                    insertAlias({

                        entityId,

                        alias:
                            tmdbData.tmdbItalianTitle,

                        normalizedAlias:
                            normalizeTitle(
                                tmdbData.tmdbItalianTitle
                            ),

                        language:
                            "it",

                        isPrimary:
                            0,

                        source:
                            "tmdb"
                    });
                }

                // ========================================
                // ORIGINAL TITLE ALIAS
                // ========================================

                if (

                    tmdbData?.tmdbOriginalTitle &&

                    normalizeTitle(
                        tmdbData.tmdbOriginalTitle
                    ) !==

                    normalizeTitle(
                        link.title
                    )

                ) {

                    insertAlias({

                        entityId,

                        alias:
                            tmdbData.tmdbOriginalTitle,

                        normalizedAlias:
                            normalizeTitle(
                                tmdbData.tmdbOriginalTitle
                            ),

                        language:
                            "original",

                        isPrimary:
                            0,

                        source:
                            "tmdb"
                    });
                }

                // ========================================
                // SOURCE
                // ========================================

                insertSource({

                    entityId,

                    sourceName:
                        "antoniogenna",

                    sourceUrl:
                        link.url,

                    externalId:

                        String(
                            tmdbData?.tmdbId || ""
                        ),

                    rawTitle:
                        link.title
                });

                insertedCount++;

                console.log(
                    "INSERTED:",
                    insertedCount
                );
            }

        } catch (error) {

            console.log(
                "INDEX FAILED:",
                pageUrl
            );

            console.log(error);
        }
    }

    console.log(
        "\nDATABASE COMPLETE"
    );

    console.log(
        "TOTAL ENTITIES:",
        insertedCount
    );

    db.close();
}

generateDatabase();