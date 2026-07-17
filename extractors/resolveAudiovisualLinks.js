const axios = require("axios");

const USER_AGENT =
    "CineNexus/1.0 (contact: support@cinenexus.app)";

const BATCH_SIZE = 50;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function chunk(array, size) {

    const result = [];

    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }

    return result;
}

function getWikipediaTitle(url) {

    if (!url) {
        return null;
    }

    try {

        return decodeURIComponent(
            url.split("/wiki/").pop()
        );

    } catch {

        return null;

    }

}

async function resolveBatch(titles) {

    const map = new Map();

    const batches = chunk(titles, BATCH_SIZE);

    for (const batch of batches) {

        const joined = batch.join("|");

        let success = false;

        for (let attempt = 1; attempt <= 3 && !success; attempt++) {

            try {

                const response = await axios.get(

                    "https://it.wikipedia.org/w/api.php",

                    {

                        params: {

                            action: "query",
                            prop: "pageprops",
                            titles: joined,
                            format: "json"

                        },

                        headers: {

                            "User-Agent": USER_AGENT

                        }

                    }

                );

                const pages = response.data.query.pages;

                Object.values(pages).forEach(page => {

                    if (
                        page.title &&
                        page.pageprops &&
                        page.pageprops.wikibase_item
                    ) {

                        map.set(

                            page.title.replace(/ /g, "_"),

                            page.pageprops.wikibase_item

                        );

                    }

                });

                success = true;

            } catch (err) {

                if (err.response?.status === 429) {

                    console.log(
                        `Wikipedia 429 - retry ${attempt}`
                    );

                    await sleep(attempt * 1000);

                    continue;

                }

                throw err;

            }

        }

    }

    return map;

}

async function resolveAudiovisualLinks(credits) {

    console.log(">>> resolveAudiovisualLinks START <<<");

    const uniqueTitles = new Set();

    for (const credit of credits) {

        if (credit.section !== "Doppiaggio") {
            continue;
        }

        for (const entry of credit.entries) {

            if (!entry.workLinks) {
                continue;
            }

            for (const work of entry.workLinks) {

                const title =
                    getWikipediaTitle(
                        work.wikipediaUrl
                    );

                if (title) {
                    uniqueTitles.add(title);
                }

            }

        }

    }

    console.log(
        `Unique Wikipedia titles: ${uniqueTitles.size}`
    );

    const wikidataMap =
        await resolveBatch(
            [...uniqueTitles]
        );

    console.log(
        `Resolved Wikidata IDs: ${wikidataMap.size}`
    );

    for (const credit of credits) {

        if (credit.section !== "Doppiaggio") {
            continue;
        }

        for (const entry of credit.entries) {

            if (!entry.workLinks) {
                continue;
            }

            for (const work of entry.workLinks) {

                const title =
                    getWikipediaTitle(
                        work.wikipediaUrl
                    );

                work.wikidataId =
                    title
                        ? wikidataMap.get(title) ?? null
                        : null;

            }

        }

    }

}

module.exports = {

    resolveAudiovisualLinks

};