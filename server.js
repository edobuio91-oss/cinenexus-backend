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
        .trim();
}

function findBestMatch(movie, year) {

    const normalizedMovie =
        normalizeMovieTitle(movie);

    const possibleMatches = [];

    Object.keys(movieMappings)
        .forEach((key) => {

            const normalizedKey =
                normalizeMovieTitle(key);

            if (

                normalizedKey.includes(normalizedMovie) ||
                normalizedMovie.includes(normalizedKey)

            ) {

                possibleMatches.push({

                    title: key,

                    url: movieMappings[key]
                });
            }
        });

    if (possibleMatches.length === 0) {

        return null;
    }

    if (!year) {

        return possibleMatches[0];
    }

    const yearMatch =
        possibleMatches.find((match) =>

            match.title.includes(year)
        );

    return yearMatch || possibleMatches[0];
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

        const bestMatch =
            findBestMatch(
                movie,
                year
            );

        if (!bestMatch) {

            return res.json({

                movie,

                dubbers: []
            });
        }

        console.log(
            "Matched:",
            bestMatch.title
        );

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