function extractWorkLinks($, li) {

    const workLinks = [];

    $(li).find("a").each((i, a) => {

        const href =
            $(a).attr("href");

        const title =
            $(a).text().trim();

        if (!href) return;

        if (href.startsWith("#")) return;

        if (href.includes("cite_note")) return;

        if (href.includes("action=edit")) return;

        const wikipediaUrl =
            href.startsWith("//")
                ? "https:" + href
                : href;

        workLinks.push({

            title,

            wikipediaUrl

        });

    });

    return workLinks;

}

module.exports = {

    extractWorkLinks

};