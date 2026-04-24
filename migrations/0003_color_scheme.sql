-- Migration number: 0003	 2026-04-24T05:12:00.000Z
CREATE TABLE IF NOT EXISTS color_scheme (
    id INTEGER PRIMARY KEY NOT NULL,
    hex TEXT NOT NULL,
    borderColor TEXT NOT NULL,
    highlightColor TEXT NOT NULL,
    textColor TEXT NOT NULL
);

INSERT OR IGNORE INTO color_scheme (id, hex, borderColor, highlightColor, textColor)
VALUES (1, '#FFF9EF', '#FFE4B5', '#FFE1AF', '#FCC874');

CREATE TABLE IF NOT EXISTS daily_game_new (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL UNIQUE,
    groupA TEXT NOT NULL,
    groupB TEXT NOT NULL,
    "order" TEXT NOT NULL CHECK (json_valid("order") AND json_type("order") = 'array'),
    colorA INTEGER NOT NULL,
    colorB INTEGER NOT NULL,
    FOREIGN KEY (groupA) REFERENCES "group"(groupID),
    FOREIGN KEY (groupB) REFERENCES "group"(groupID),
    FOREIGN KEY (colorA) REFERENCES color_scheme(id),
    FOREIGN KEY (colorB) REFERENCES color_scheme(id)
);

INSERT OR IGNORE INTO daily_game_new (id, name, date, groupA, groupB, "order", colorA, colorB)
SELECT
    daily_game.id,
    daily_game.name,
    daily_game.date,
    daily_game.groupA,
    daily_game.groupB,
    daily_game."order",
    COALESCE(
        (SELECT id FROM color_scheme WHERE hex = daily_game.colorA LIMIT 1),
        1
    ) AS colorA,
    COALESCE(
        (SELECT id FROM color_scheme WHERE hex = daily_game.colorB LIMIT 1),
        1
    ) AS colorB
FROM daily_game;

DROP TABLE IF EXISTS daily_game;

ALTER TABLE daily_game_new RENAME TO daily_game;

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
