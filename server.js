const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

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

function findBestMatch(movie, year) {

    const normalizedMovie =
        normalizeMovieTitle(movie);

    let bestMatch = null;

    Object.keys(movieMappings)
        .forEach((key) => {

            const normalizedKey =
                normalizeMovieTitle(key);

            const movieWords =
                normalizedMovie
                    .split(" ")
                    .filter(word =>
                        word.length > 1
                    );

            const allWordsMatch =
                movieWords.every(word =>

                    normalizedKey.includes(word)
                );

            if (allWordsMatch) {

                if (

                    !bestMatch ||

                    key.includes(year)

                ) {

                    bestMatch = {

                        title: key,

                        url: movieMappings[key]
                    };
                }
            }
        });

    return bestMatch;
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

                    dubbers.push({

                        characterName:
                            filteredTexts[0],

                        actorName:
                            filteredTexts[
                                filteredTexts.length - 1
                            ]
                    });
                }
            }
        });

        console.log(
            "Dubbers found:",
            dubbers.length
        );

        return res.json({

            movie,

            matchedTitle:
                bestMatch.title,

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