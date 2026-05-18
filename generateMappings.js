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

                const isValidPage =

                    lowerHref.endsWith(".htm") &&

                    !lowerHref.includes("film.htm") &&

                    !lowerHref.includes("film-") &&

                    !lowerHref.includes("anim.htm") &&

                    !lowerHref.includes("anim-");

                if (

                    isValidPage &&
                    !isInvalidTitle

                ) {

                    const fullUrl =
                        new URL(
                            href,
                            pageUrl
                        ).href;

                    if (!mappings[title]) {

                        mappings[title] =
                            fullUrl;

                    } else {

                        console.log(
                            "Duplicate skipped:",
                            title,
                            fullUrl
                        );
                    }
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