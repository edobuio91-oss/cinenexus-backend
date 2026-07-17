const axios = require("axios");

const USER_AGENT =
    "CineNexus/1.0 (https://cinenexus.app)";

function chunk(array, size) {

    const chunks = [];

    for (let i = 0; i < array.length; i += size) {

        chunks.push(
            array.slice(i, i + size)
        );

    }

    return chunks;

}

function collectUniqueIds(credits) {

    const ids = new Set();

    for (const section of credits) {

        for (const entry of section.entries) {

            for (const work of entry.workLinks || []) {

                if (work.wikidataId) {

                    ids.add(work.wikidataId);

                }

            }

        }

    }

    return [...ids];

}

async function fetchEntitiesBatch(ids) {

    const response = await axios.get(

        "https://www.wikidata.org/w/api.php",

        {

            params: {

                action: "wbgetentities",

                ids: ids.join("|"),

                props: "labels|descriptions|claims",

                languages: "it|en",

                format: "json"

            },

            headers: {

                "User-Agent": USER_AGENT

            }

        }

    );

    console.log(
        JSON.stringify(response.data, null, 2)
    );

    return response.data.entities || {};

}

async function resolveWikidataEntities(credits) {

    console.log(">>> resolveWikidataEntities START <<<");

    const ids = collectUniqueIds(credits);

    console.log(
        "Unique Wikidata IDs:",
        ids.length
    );

    const batches = chunk(ids, 50);

    console.log(
        "Batches:",
        batches.length
    );

    let total = 0;

    for (let i = 0; i < batches.length; i++) {

        const batch = batches[i];

        const entities =
            await fetchEntitiesBatch(batch);

        const count = Object.keys(entities || {}).length;

        total += count;

        console.log(
            `Batch ${i + 1}/${batches.length}: ${count} entities`
        );

    }

    console.log(
        "Total entities:",
        total
    );

}

module.exports = {
    resolveWikidataEntities
};