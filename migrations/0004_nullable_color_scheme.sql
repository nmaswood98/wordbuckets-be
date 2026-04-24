-- Migration number: 0004	 2026-04-24T06:10:00.000Z
PRAGMA defer_foreign_keys = ON;

CREATE TABLE color_scheme_new (
    id INTEGER PRIMARY KEY NOT NULL,
    hex TEXT,
    borderColor TEXT,
    highlightColor TEXT,
    textColor TEXT
);

INSERT INTO color_scheme_new (id, hex, borderColor, highlightColor, textColor)
SELECT id, hex, borderColor, highlightColor, textColor
FROM color_scheme;

CREATE TABLE daily_game_copy AS
SELECT id, name, date, groupA, groupB, "order", colorA, colorB
FROM daily_game;

DROP TABLE daily_game;
DROP TABLE color_scheme;

ALTER TABLE color_scheme_new RENAME TO color_scheme;

CREATE TABLE daily_game (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL UNIQUE,
    groupA TEXT NOT NULL,
    groupB TEXT NOT NULL,
    "order" TEXT NOT NULL CHECK (json_valid("order") AND json_type("order") = 'array'),
    colorA INTEGER,
    colorB INTEGER,
    FOREIGN KEY (groupA) REFERENCES "group"(groupID),
    FOREIGN KEY (groupB) REFERENCES "group"(groupID),
    FOREIGN KEY (colorA) REFERENCES color_scheme(id),
    FOREIGN KEY (colorB) REFERENCES color_scheme(id)
);

INSERT INTO daily_game (id, name, date, groupA, groupB, "order", colorA, colorB)
SELECT id, name, date, groupA, groupB, "order", colorA, colorB
FROM daily_game_copy;

DROP TABLE daily_game_copy;

CREATE TRIGGER IF NOT EXISTS validate_daily_game_order_insert
BEFORE INSERT ON daily_game
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW."order")
    WHERE type != 'text' OR value NOT IN ('A', 'B')
)
BEGIN
    SELECT RAISE(ABORT, 'daily_game.order must be a JSON array containing only A or B');
END;

CREATE TRIGGER IF NOT EXISTS validate_daily_game_order_update
BEFORE UPDATE OF "order" ON daily_game
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW."order")
    WHERE type != 'text' OR value NOT IN ('A', 'B')
)
BEGIN
    SELECT RAISE(ABORT, 'daily_game.order must be a JSON array containing only A or B');
END;
