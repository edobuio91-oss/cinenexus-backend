const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");

const TMDB_API_KEY = "ccfb56079b1e4e01c68c03045ea23a21";

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

function delay(ms) {

    return new Promise(resolve =>

        setTimeout(resolve, ms)
    );
}

function extractYear(text) {

    const match =
        text.match(/\b(19|20)\d{2}\b/);

    return match
        ? match[0]
        : "";
}

function cleanText(text) {

    return text
        .replace(/\s+/g, " ")
        .replace(/\n/g, " ")
        .trim();
}

async function getTmdbMatch(
    title,
    year
) {

    try {

        await delay(250);

        const response =
            await axios.get(

                "https://api.themoviedb.org/3/search/movie",

                {

                    params: {

                        api_key:
                            TMDB_API_KEY,

                        query:
                            title,

                        year:
                            year,

                        language:
                            "it-IT"
                    }
                }
            );

        const results =
            response.data.results || [];

        if (!results.length) {

            console.log(
                "TMDB NOT FOUND:",
                title
            );

            return null;
        }

        const best =
            results[0];

        console.log(
            "TMDB MATCH:",
            title,
            "->",
            best.id
        );

        return {

            tmdbId:
                best.id,

            tmdbTitle:
                best.title,

            tmdbOriginalTitle:
                best.original_title,

            tmdbReleaseDate:
                best.release_date
        };

    } catch (error) {

        console.log(
            "TMDB FAILED:",
            title
        );

        return null;
    }
}

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

        const directorPatterns = [

            /Regia:? ([^.|\n]+)/i,
            /Diretto da:? ([^.|\n]+)/i,
            /Regista:? ([^.|\n]+)/i
        ];

        let director = "";

        for (const pattern of directorPatterns) {

            const match =
                bodyText.match(pattern);

            if (match) {

                director =
                    cleanText(match[1]);

                break;
            }
        }

        const type =

            url.includes("/anim/")
                ? "animation"
                : "movie";

        return {

            success: true,

            year,

            director,

            type
        };

    } catch (error) {

        console.log(
            "Metadata extraction failed:",
            url
        );

        return {

            success: false,

            year: "",

            director: "",

            type: ""
        };
    }
}

async function generateMappings() {

    const mappings = {};

    for (const pageUrl of indexPages) {

        console.log(
            "\nScanning index:",
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

                    links.push({

                        title,

                        url: fullUrl
                    });
                }
            });

            for (const link of links) {

                console.log(
                    "Extracting:",
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

                const uniqueKey =

                    `${link.title}_${metadata.year}_${metadata.type}`;

                mappings[uniqueKey] = {

                    title:
                        link.title,

                    url:
                        link.url,

                    year:
                        metadata.year,

                    director:
                        metadata.director,

                    type:
                        metadata.type,

                    tmdbId:
                        tmdbData?.tmdbId || null,

                    tmdbTitle:
                        tmdbData?.tmdbTitle || "",

                    tmdbOriginalTitle:
                        tmdbData?.tmdbOriginalTitle || "",

                    tmdbReleaseDate:
                        tmdbData?.tmdbReleaseDate || "",

                    metadataSuccess:
                        metadata.success
                };

                fs.writeFileSync(

                    "movieMappings.json",

                    JSON.stringify(
                        mappings,
                        null,
                        2
                    )
                );
            }

        } catch (error) {

            console.log(
                "Failed index page:",
                pageUrl
            );
        }
    }

    console.log(
        "\nMappings generated:",
        Object.keys(mappings).length
    );
}

generateMappings();