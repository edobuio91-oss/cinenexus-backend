const axios = require("axios");

const TMDB_API_KEY =
    "ccfb56079b1e4e01c68c03045ea23a21";

async function getVerifiedMediaWorks(personTmdbId) {

    if (!personTmdbId) {
        return [];
    }

    try {

        /*
         * 1. Recuperiamo tutti i crediti della persona
         *
         * combined_credits contiene:
         * - cast
         * - crew
         *
         * e può contenere:
         * - film
         * - serie TV
         */

        const response =
            await axios.get(
                `https://api.themoviedb.org/3/person/${personTmdbId}/combined_credits`,
                {
                    params: {
                        api_key: TMDB_API_KEY,
                        language: "it-IT"
                    }
                }
            );

        const data =
            response.data;


        /*
         * 2. Uniamo CAST + CREW
         */

        const allCredits = [

            ...(data.cast || []),

            ...(data.crew || [])

        ];


        /*
         * 3. Teniamo solo film e serie TV
         */

        const supportedCredits =
            allCredits.filter(
                mediaWork =>
                    mediaWork.media_type === "movie" ||
                    mediaWork.media_type === "tv"
            );


        /*
         * 4. Eliminiamo i duplicati
         *
         * La stessa persona può comparire:
         *
         * cast → film
         * crew → film
         *
         * quindi non vogliamo verificare due volte
         * la stessa opera.
         */

        const uniqueCredits =
            Array.from(

                new Map(

                    supportedCredits.map(
                        mediaWork => [

                            `${mediaWork.media_type}:${mediaWork.id}`,

                            mediaWork

                        ]
                    )

                ).values()

            );


        console.log(
            `MEDIAWORKS DA VERIFICARE: ${uniqueCredits.length}`
        );


        /*
         * 5. Verifichiamo ogni opera direttamente
         *    nei crediti dell'opera stessa.
         */

        const verifiedMediaWorks = [];


        for (const mediaWork of uniqueCredits) {

            try {

                console.log(
                    `VERIFICA: ${mediaWork.media_type} ${mediaWork.id} - ${
                        mediaWork.title ||
                        mediaWork.name ||
                        "Senza titolo"
                    }`
                );


                const verified =
                    await verifyMediaWork(
                        personTmdbId,
                        mediaWork
                    );


                /*
                 * Se la persona è realmente presente
                 * nei crediti dell'opera, la conserviamo.
                 */

                if (verified) {

                    verifiedMediaWorks.push(
                        verified
                    );

                    console.log(
                        `✓ VERIFICATO: ${
                            mediaWork.title ||
                            mediaWork.name ||
                            "Senza titolo"
                        }`
                    );

                } else {

                    console.log(
                        `✗ SCARTATO: ${
                            mediaWork.title ||
                            mediaWork.name ||
                            "Senza titolo"
                        }`
                    );

                }

            } catch (error) {

                console.error(
                    `Errore verifica ${
                        mediaWork.media_type
                    } ${mediaWork.id}:`,
                    error.message
                );

                /*
                 * Se una singola opera dà errore,
                 * non blocchiamo tutta la filmografia.
                 *
                 * Passiamo alla successiva.
                 */

            }

        }


        console.log(
            `MEDIAWORKS VERIFICATI: ${verifiedMediaWorks.length}`
        );


        return verifiedMediaWorks;


    } catch (error) {

        console.error(
            "TMDB combined credits failed:",
            error.message
        );

        throw error;

    }

}


/*
 * TEST TEMPORANEO
 *
 * Verifica se una persona ha realmente
 * partecipato a uno specifico film.
 */
async function verifyMediaWork(
    personTmdbId,
    mediaWork
) {

    if (
        !personTmdbId ||
        !mediaWork ||
        !mediaWork.id ||
        !mediaWork.media_type
    ) {
        return null;
    }

    try {

        const personId =
            Number(personTmdbId);

        let credits;

        /*
         * FILM
         */
        if (mediaWork.media_type === "movie") {

            const response =
                await axios.get(
                    `https://api.themoviedb.org/3/movie/${mediaWork.id}/credits`,
                    {
                        params: {
                            api_key: TMDB_API_KEY,
                            language: "it-IT"
                        }
                    }
                );

            credits = response.data;

        }

        /*
         * SERIE TV
         */
        else if (mediaWork.media_type === "tv") {

            const response =
                await axios.get(
                    `https://api.themoviedb.org/3/tv/${mediaWork.id}/aggregate_credits`,
                    {
                        params: {
                            api_key: TMDB_API_KEY,
                            language: "it-IT"
                        }
                    }
                );

            credits = response.data;

        }

        /*
         * TIPO NON SUPPORTATO
         */
        else {

            return null;

        }


        /*
         * CERCHIAMO LA PERSONA NEL CAST
         */
        const castMatches =
            credits.cast?.filter(
                person =>
                    person.id === personId
            ) || [];

        const crewMatches =
            credits.crew?.filter(
                person =>
                    person.id === personId
            ) || [];


        /*
         * SE NON COMPARE NEI CREDITI,
         * L'OPERA NON È VERIFICATA
         */
        if (
            castMatches.length === 0 &&
            crewMatches.length === 0
        ) {
            return null;
        }


        /*
         * RACCOGLIAMO TUTTI I RUOLI
         */
        const roles = [];


        /*
         * RUOLI DI CAST
         *
         * Funziona sia per:
         * - film
         * - serie TV
         */
        castMatches.forEach(castMatch => {

            /*
             * Serie TV:
             *
             * aggregate_credits può fornire
             * più ruoli/personaggi.
             */
            if (
                Array.isArray(castMatch.roles) &&
                castMatch.roles.length > 0
            ) {

                castMatch.roles.forEach(role => {

                    roles.push({

                        type: "cast",

                        character:
                            role.character || null,

                        episodeCount:
                            role.episode_count ?? null

                    });

                });

            }

            /*
             * Film:
             *
             * normalmente abbiamo direttamente
             * il campo character.
             */
            else {

                roles.push({

                    type: "cast",

                    character:
                        castMatch.character || null,

                    episodeCount:
                        null

                });

            }

        });


        /*
         * RUOLI DI CREW
         *
         * Funziona sia per:
         * - film
         * - serie TV
         */
        crewMatches.forEach(crewMatch => {

            /*
             * Serie TV:
             *
             * aggregate_credits può contenere
             * più jobs per la stessa persona.
             */
            if (
                Array.isArray(crewMatch.jobs) &&
                crewMatch.jobs.length > 0
            ) {

                crewMatch.jobs.forEach(job => {

                    roles.push({

                        type: "crew",

                        job:
                            job.job || null,

                        department:
                            crewMatch.department || null,

                        episodeCount:
                            job.episode_count ?? null

                    });

                });

            }

            /*
             * Film:
             *
             * normalmente abbiamo direttamente
             * job e department.
             */
            else {

                roles.push({

                    type: "crew",

                    job:
                        crewMatch.job || null,

                    department:
                        crewMatch.department || null,

                    episodeCount:
                        null

                });

            }

        });


        /*
         * RESTITUIAMO IL MEDIAWORK VERIFICATO
         */
        return {

            id:
                mediaWork.id,

            mediaType:
                mediaWork.media_type,

            title:
                mediaWork.title ||
                mediaWork.name ||
                null,

            originalTitle:
                mediaWork.original_title ||
                mediaWork.original_name ||
                null,

            posterPath:
                mediaWork.poster_path ||
                null,

            releaseDate:
                mediaWork.release_date ||
                mediaWork.first_air_date ||
                null,

            roles

        };


    } catch (error) {

        console.error(
            `TMDB credits verification failed for ${mediaWork.media_type} ${mediaWork.id}:`,
            error.message
        );

        throw error;

    }

}


module.exports = {

    getVerifiedMediaWorks,

    verifyMediaWork

};