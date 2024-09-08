import fetch from "node-fetch";
import fs from "fs";
import { MongoClient } from "mongodb";

const MONGODB_URI = "mongodb+srv://mg:mani2244@cluster0.mmtvzb3.mongodb.net/";
const DB_NAME = "gamecodes";
const GAMES_COLLECTION_NAME = "games";
const CODES_COLLECTION_NAME = "codes";
const mongoClient = new MongoClient(MONGODB_URI);

let games = {};
let proggressCount = 0;
let GameChoices = null;

async function fetchGamesFromDB() {
    try {
        await mongoClient.connect();
        const db = mongoClient.db(DB_NAME);
        const gamesCollection = db.collection(GAMES_COLLECTION_NAME);
        const gamesData = await gamesCollection.find({}).toArray();

        games = gamesData.reduce((acc, game, index) => {
            acc[index + 1] = game;
            return acc;
        }, {});

        console.log("Games data fetched successfully:", games);
    } catch (error) {
        console.error(
            `Failed to fetch games data from MongoDB: ${error.message}`,
        );
    }
}

function updateProgress(percentage) {
    proggressCount++;
    console.log(
        games[GameChoices].name +
            " => " +
            proggressCount +
            ` Progress: ${percentage}%`,
    );
}

async function generatePromoCode() {
    try {
        const clientToken = await login();
        await registerEvent(clientToken);
        const promoCode = await createCode(clientToken);
        await saveKeysToMongoDB([promoCode] , games[GameChoices]);
        console.log(`Promo code: ${promoCode}`);
    } catch (error) {
        console.error("Error generating code:", error.message);
    }
}

async function login() {
    const clientId = await generateClientId();
    try {
        const response = await fetch(
            "https://api.gamepromo.io/promo/login-client",
            {
                method: "POST",
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify({
                    appToken: games[GameChoices].appToken,
                    clientId,
                    clientOrigin: "deviceid",
                }),
            },
        );
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        updateProgress(15);
        await new Promise((resolve) => setTimeout(resolve, 21000));
        return data.clientToken;
    } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return login();
    }
}

async function registerEvent(clientToken) {
    const eventId = generateEventId();
    while (true) {
        try {
            const response = await fetch(
                "https://api.gamepromo.io/promo/register-event",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${clientToken}`,
                        "Content-Type": "application/json; charset=utf-8",
                    },
                    body: JSON.stringify({
                        promoId: games[GameChoices].promoId,
                        eventId,
                        eventOrigin: "undefined",
                    }),
                },
            );
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json();
            if (!data.hasCode) {
                await new Promise((resolve) => setTimeout(resolve, 20000));
            } else {
                return true;
            }
        } catch (error) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

async function createCode(clientToken) {
    while (true) {
        try {
            const response = await fetch(
                "https://api.gamepromo.io/promo/create-code",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${clientToken}`,
                        "Content-Type": "application/json; charset=utf-8",
                    },
                    body: JSON.stringify({
                        promoId: games[GameChoices].promoId,
                    }),
                },
            );
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json();
            if (data.promoCode) return data.promoCode;
        } catch (error) {
            console.error("Error creating code:", error.message);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
}

async function generateClientId() {
    const timestamp = Date.now();
    const randomDigits = Array.from({ length: 19 }, () =>
        Math.floor(Math.random() * 10),
    ).join("");
    return `${timestamp}-${randomDigits}`;
}

function generateEventId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        function (char) {
            const randomValue = (Math.random() * 16) | 0;
            return (
                char === "x" ? randomValue : (randomValue & 3) | 8
            ).toString(16);
        },
    );
}

async function saveKeysToMongoDB(keys, gameId) {
    try {
        const db = mongoClient.db(DB_NAME);
        const collection = db.collection(CODES_COLLECTION_NAME);

        const result = await collection.insertMany(
            keys.map((key) => ({ key })),
        );
        console.log(
            `Inserted ${gameId.name} with ${result.insertedCount} keys into MongoDB.`,
        );
    } catch (error) {
        console.error(`Failed to save keys to MongoDB: ${error.message}`);
    }
}


async function closeMongoClient() {
    try {
        if (mongoClient.isConnected()) {
            await mongoClient.close();
        }
    } catch (error) {
        console.error(`Failed to close MongoDB client: ${error.message}`);
    }
}

async function generateMultiplePromoCodes(count, concurrentLimit) {
    const tasks = [];
    for (let i = 0; i < count; i++) {
        tasks.push(generatePromoCode());

        if (tasks.length >= concurrentLimit) {
            await Promise.all(tasks);
            tasks.length = 0;
        }
    }

    if (tasks.length > 0) {
        await Promise.all(tasks);
    }
}

async function runPeriodicTask() {
    while (true) {
        try {
            await generateMultiplePromoCodes(999999999999999999, 1000);
        } catch (error) {
            console.error("Error during periodic execution:", error.message);
        }
    }
}

async function main() {
    await fetchGamesFromDB();
    const randomNumber =
        Math.floor(Math.random() * Object.keys(games).length) + 1;
    GameChoices = 3;
    await runPeriodicTask();
}

main().catch((error) =>
    console.error("Error in main execution:", error.message),
);
