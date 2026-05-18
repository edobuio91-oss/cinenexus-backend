const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");
const wiki = require("wikipedia");

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
    wikipediaCheck
) {

    let confidence = 0;

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

            hasDubbingSection
        };

    } catch (error) {

        return {

            found: false,

            hasDubbingSection: false
        };
    }
}

function findBestMatch(
    movie,
    year,
    director
) {

    const normalizedMovie =
        normalizeMovieTitle(movie);

    const normalizedDirector =
        normalizeMovieTitle(director);

    const movieWords =
        normalizedMovie
            .split(" ")
            .filter(word =>
                word.length > 1
            );

    let scoredMatches = [];

    Object.keys(movieMappings)
        .forEach((key) => {

            const normalizedKey =
                normalizeMovieTitle(key);

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
                    key.includes(year)
                ) {

                    score += 50;
                }

                if (
                    normalizedKey === normalizedMovie
                ) {

                    score += 10;
                }

                if (

                    director &&

                    normalizedKey.includes(
                        normalizedDirector
                    )

                ) {

                    score += 100;
                }

                scoredMatches.push({

                    title: key,

                    url: movieMappings[key],

                    score,

                    hasYear:
                        key.includes(year)
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

        const director =
            req.query.director;

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
            "Requested director:",
            director
        );

        const bestMatch =
            findBestMatch(
                movie,
                year,
                director
            );

        if (bestMatch) {

            console.log(
                "Matched title:",
                bestMatch.title
            );

            console.log(
                "Matched URL:",
                bestMatch.url
            );
        }

        if (!bestMatch) {

            console.log(
                "No match found"
            );

            return res.json({

                movie,

                verified: false,

                confidence: 0,

                wikipediaCheck: {

                    found: false,

                    hasDubbingSection: false
                },

                dubbers: []
            });
        }

        const response =
            await axios.get(
                bestMatch.url
            );

        const $ =
            cheerio.load(response.data);

        const dubbers = [];

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

        const wikipediaCheck =
            await verifyWithWikipedia(
                movie
            );

        const confidence =
            calculateConfidence(
                dubbers,
                wikipediaCheck
            );

        const verified =
            confidence >= 0.6;

        console.log(
            "Dubbers found:",
            dubbers.length
        );

        console.log(
            "Confidence:",
            confidence
        );

        console.log(
            "Wikipedia check:",
            wikipediaCheck
        );

        return res.json({

            movie,

            matchedTitle:
                bestMatch.title,

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