const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");

const indexPages = [];

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

async function generateMappings() {

    const mappings = {};

    for (const pageUrl of indexPages) {

        console.log(
            "Scanning:",
            pageUrl
        );

        try {

            const response =
                await axios.get(pageUrl);

            const $ =
                cheerio.load(response.data);

            $("a").each((index, element) => {

                const href =
                    $(element).attr("href");

                const title =
                    $(element)
                        .text()
                        .trim();

                if (!href || !title) {

                    return;
                }

                const lowerHref =
                    href.toLowerCase();

                const invalidTitles = [

                    "#",
                    "torna",
                    "indice",
                    "cinema",
                    "home"
                ];

                const isInvalidTitle =

                    title.length < 2 ||

                    invalidTitles.some(word =>

                        title
                            .toLowerCase()
                            .includes(word)
                    );

                const isMoviePage =

                    lowerHref.endsWith(".htm") &&

                    !lowerHref.includes("film.htm") &&

                    !lowerHref.includes("film-");

                if (

                    isMoviePage &&
                    !isInvalidTitle

                ) {

                    const fullUrl =
                        new URL(
                            href,
                            pageUrl
                        ).href;

                    mappings[title] =
                        fullUrl;
                }
            });

        } catch (error) {

            console.log(
                "Failed page:",
                pageUrl
            );
        }
    }

    fs.writeFileSync(

        "movieMappings.json",

        JSON.stringify(
            mappings,
            null,
            2
        )
    );

    console.log(
        "Mappings generated:",
        Object.keys(mappings).length
    );
}

generateMappings();