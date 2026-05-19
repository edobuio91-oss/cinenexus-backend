const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const wiki = require("wikipedia");
const wtf = require("wtf_wikipedia");

const movieMappings =
    require("./movieMappings.json");

const app = express();

app.use(cors());

function normalizeMovieTitle(title) {

    return title
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

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

    } catch (error) {

        return {

            found: false,

            hasDubbingSection: false,

            content: ""
        };
    }
}

async function getWikipediaDubbers(
    movie,
    year
) {

    try {

        const response =
            await axios.get(

                "https://it.wikipedia.org/w/api.php",

                {

                    headers: {

                        "User-Agent":

                            "CineNexusBot/1.0 (https://cinenexus.app)"
                    },

                    params: {

                        action: "query",

                        prop: "revisions",

                        rvslots: "main",

                        rvprop: "content",

                        titles:

                            year

                                ? `${movie} (film ${year})`

                                : movie,

                        format: "json",

                        formatversion: 2
                    }
                }
            );

        const pages =

            response.data
                .query
                .pages;

        const page =
            pages[0];

        let rawContent = "";

        if (

            page.revisions &&

            page.revisions.length > 0

        ) {

            rawContent =

                page.revisions[0]
                    .slots
                    ?.main
                    ?.content

                ||

                "";
        }

        if (!rawContent) {

            console.log(
                "No Wikipedia raw content found"
            );

            return [];
        }

        console.log(
            "Wikipedia raw content loaded"
        );

        const doc =
            wtf(rawContent);

        console.log(
            doc.json()
        );

        const sections =
            doc.sections();

        const dubbers = [];

        const keywords = [

            "doppiaggio",
            "doppiatori",
            "edizione italiana",
            "cast italiano",
            "voci italiane"
        ];

        sections.forEach(section => {

            const title =
                (
                    section.title() || ""
                )
                    .toLowerCase();

            const matches =

                keywords.some(keyword =>

                    title.includes(keyword)
                );

            if (!matches) {

                return;
            }

            const text =
                section.text();

            const lines =
                text.split("\n");

            lines.forEach(line => {

                const cleanLine =
                    line.trim();

                if (
                    cleanLine.length < 3
                ) {

                    return;
                }

                const separators = [

                    " – ",
                    " - ",
                    ": "
                ];

                let parts = null;

                for (const separator of separators) {

                    if (
                        cleanLine.includes(separator)
                    ) {

                        parts =
                            cleanLine.split(
                                separator
                            );

                        break;
                    }
                }

                if (

                    parts &&

                    parts.length >= 2

                ) {

                    const characterName =
                        parts[0]
                            .trim();

                    const actorName =
                        parts[1]
                            .trim();

                    const invalid =

                        actorName.length > 80 ||

                        characterName.includes("=") ||

                        actorName.includes("=");

                    if (!invalid) {

                        dubbers.push({

                            characterName,

                            actorName
                        });
                    }
                }
            });
        });

        const uniqueDubbers =

            dubbers.filter(
                (item, index, self) =>

                    index ===

                    self.findIndex(d =>

                        d.characterName ===
                        item.characterName &&

                        d.actorName ===
                        item.actorName
                    )
            );

        return uniqueDubbers.slice(0, 30);

    } catch (error) {

        console.log(
            "Wikipedia structured parser failed"
        );

        console.log(error);

        return [];
    }
}

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

    const titleMatches =

        normalizedTitle.includes(
            normalizedMovie
        );

    const yearMatches =

        !year ||

        bestMatch.year === year;

    return (
        titleMatches &&
        yearMatches
    );
}

function findBestMatch(
    movie,
    year
) {

    const normalizedMovie =
        normalizeMovieTitle(movie);

    const movieWords =
        normalizedMovie
            .split(" ")
            .filter(word =>
                word.length > 1
            );

    let scoredMatches = [];

    Object.keys(movieMappings)
        .forEach((key) => {

            const item =
                movieMappings[key];

            const normalizedKey =
                normalizeMovieTitle(
                    item.title
                );

            let score = 0;

            movieWords.forEach(word => {

                if (
                    normalizedKey.includes(word)
                ) {

                    score++;
                }
            });

            if (score > 0) {

                if (
                    year &&
                    item.year === year
                ) {

                    score += 100;
                }

                if (
                    normalizedKey === normalizedMovie
                ) {

                    score += 25;
                }

                scoredMatches.push({

                    title:
                        item.title,

                    url:
                        item.url,

                    year:
                        item.year,

                    director:
                        item.director,

                    type:
                        item.type,

                    score
                });
            }
        });

    console.log(
        "Possible matches:",
        scoredMatches
    );

    if (scoredMatches.length === 0) {

        return null;
    }

    scoredMatches.sort(
        (a, b) => b.score - a.score
    );

    return scoredMatches[0];
}

app.get("/dubbers", async (req, res) => {

    try {

        const movie =
            req.query.movie;

        const year =
            req.query.year;

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

        const bestMatch =
            findBestMatch(
                movie,
                year
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
                bestMatch.url
            );

            const response =
                await axios.get(
                    bestMatch.url
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
                            "segnalatelo",
                            "realizzazione",
                            "antonio genna",
                            "torna",
                            "indice",
                            "home",
                            "cinema"
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

        if (

            antonioGennaRejected &&

            wikipediaCheck.found

        ) {

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

        console.log(
            "Source:",
            source
        );

        console.log(
            "Confidence:",
            confidence
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

app.listen(3000, () => {

    console.log(
        "CineNexus backend running on port 3000"
    );
});