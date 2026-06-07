const Database = require("better-sqlite3");

const db =
    new Database("cinenexus.db");

db.pragma("journal_mode = WAL");

// ========================================
// DROP OLD TABLES
// ========================================

db.exec(`

DROP TABLE IF EXISTS entities;
DROP TABLE IF EXISTS aliases;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS dubbers;

`);

// ========================================
// ENTITIES
// ========================================

db.exec(`

CREATE TABLE entities (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    canonicalTitle TEXT,
    canonicalOriginalTitle TEXT,

    normalizedCanonicalTitle TEXT,

    year TEXT,

    runtime INTEGER,

    mediaType TEXT,
    category TEXT,

    director TEXT,

    tmdbId INTEGER,
    tmdbMediaType TEXT,
    tmdbReleaseDate TEXT,

    sourceConfidence REAL DEFAULT 0,

    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

`);

// ========================================
// ALIASES
// ========================================

db.exec(`

CREATE TABLE aliases (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    entityId INTEGER,

    alias TEXT,
    normalizedAlias TEXT,

    language TEXT DEFAULT 'it',

    isPrimary INTEGER DEFAULT 0,

    source TEXT,

    FOREIGN KEY(entityId)
        REFERENCES entities(id)
);

`);

// ========================================
// SOURCES
// ========================================

db.exec(`

CREATE TABLE sources (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    entityId INTEGER,

    sourceName TEXT,

    sourceUrl TEXT,

    externalId TEXT,

    rawTitle TEXT,

    rawData TEXT,

    lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(entityId)
        REFERENCES entities(id)
);

`);

// ========================================
// DUBBERS
// ========================================

db.exec(`

CREATE TABLE dubbers (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    entityId INTEGER,

    characterName TEXT,

    actorName TEXT,

    source TEXT,

    confidence REAL DEFAULT 0,

    lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(entityId)
        REFERENCES entities(id)
);

`);

// ========================================
// INDEXES
// ========================================

db.exec(`

CREATE INDEX idx_entities_tmdbId
ON entities(tmdbId);

CREATE INDEX idx_entities_title
ON entities(normalizedCanonicalTitle);

CREATE INDEX idx_aliases_alias
ON aliases(normalizedAlias);

CREATE INDEX idx_dubbers_entity
ON dubbers(entityId);

`);

console.log(
    "DATABASE CREATED SUCCESSFULLY"
);

db.close();