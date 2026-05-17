const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();

app.use(cors());

const movieUrls = {

    "Toy Story":
        "https://www.antoniogenna.net/doppiaggio/film/toystory.htm"
};

app.get("/dubbers", async (req, res) => {

    try {

        const movie = req.query.movie;

        if (!movie) {

            return res.status(400).json({
                error: "Movie title missing"
            });
        }

        const url = movieUrls[movie];

        if (!url) {

            return res.json({

                movie,

                dubbers: []
            });
        }

        const response =
            await axios.get(url);

        const $ =
            cheerio.load(response.data);

        const dubbers = [];

        $("tr").each((index, element) => {

            const cells =
                $(element).find("td");

            if (cells.length >= 3) {

                const characterName =
                    $(cells[0])
                        .text()
                        .trim();

                const actorName =
                    $(cells[2])
                        .text()
                        .trim();

                if (

                    characterName &&
                    actorName &&
                    characterName !== "PERSONAGGI" &&
                    actorName !== "DOPPIATORI ITALIANI"

                ) {

                    dubbers.push({

                        characterName,

                        actorName
                    });
                }
            }
        });

        return res.json({

            movie,

            dubbers
        });

    } catch (error) {

        console.error(error);

        return res.status(500).json({

            error: "Scraping failed"
        });
    }
});

app.listen(3000, () => {

    console.log(
        "CineNexus backend running on port 3000"
    );
});