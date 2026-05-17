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

        try {

            console.log(
                "Scanning:",
                pageUrl
            );

            const response =
                await axios.get(pageUrl);

            const $ =
                cheerio.load(response.data);

            $("a").each((index, element) => {

                const href =
                    $(element).attr("href");

                const title =
                    $(element).text().trim();

                if (

                    href &&
                    href.endsWith(".htm") &&
                    title.length > 0

                ) {

                    const fullUrl =
                        new URL(
                            href,
                            pageUrl
                        ).href;

                    if (

                        fullUrl.includes("/doppiaggio/") &&
                        !title.includes("Torna") &&
                        !title.includes("Home") &&
                        !title.includes("Cinema")

                    ) {

                        mappings[title] =
                            fullUrl;
                    }
                }
            });

        } catch (error) {

            console.log(
                "Failed:",
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