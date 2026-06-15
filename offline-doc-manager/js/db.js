const DB_NAME = "ProjectTaskManagerDB";
const DB_VERSION = 1;

window.dbReady = false;
let db;

const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onupgradeneeded = function (event) {
    db = event.target.result;

    // Master Projects Document Table
    if (!db.objectStoreNames.contains("projects")) {
        const projectStore = db.createObjectStore("projects", {
            keyPath: "id",
            autoIncrement: true
        });
        projectStore.createIndex("projectNo", "projectNo", { unique: false });
        projectStore.createIndex("title", "title", { unique: false });
        projectStore.createIndex("winningBidder", "winningBidder", { unique: false });
        projectStore.createIndex("biddingDate", "biddingDate", { unique: false });
    }

    // Historical Audit Log Store
    if (!db.objectStoreNames.contains("history")) {
        const historyStore = db.createObjectStore("history", {
            keyPath: "id",
            autoIncrement: true
        });
        historyStore.createIndex("projectId", "projectId", { unique: false });
        historyStore.createIndex("editedAt", "editedAt", { unique: false });
    }
};

request.onsuccess = function (event) {
    db = event.target.result;
    console.log("IndexedDB Environment Connected Successfully.");
    window.dbReady = true;
};

request.onerror = function (event) {
    console.error("Database initialization fault:", event.target.error);
};