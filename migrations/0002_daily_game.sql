-- Migration number: 0002 	 2026-04-24T02:47:01.509Z
CREATE TABLE IF NOT EXISTS "group" (
    groupID TEXT PRIMARY KEY NOT NULL,
    words TEXT NOT NULL CHECK (json_valid(words) AND json_type(words) = 'array')
);

CREATE TRIGGER IF NOT EXISTS validate_group_words_insert
BEFORE INSERT ON "group"
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.words)
    WHERE type != 'text'
)
BEGIN
    SELECT RAISE(ABORT, 'group.words must be a JSON array of text values');
END;

CREATE TRIGGER IF NOT EXISTS validate_group_words_update
BEFORE UPDATE OF words ON "group"
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.words)
    WHERE type != 'text'
)
BEGIN
    SELECT RAISE(ABORT, 'group.words must be a JSON array of text values');
END;

CREATE TABLE IF NOT EXISTS daily_game (
    id INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    date TEXT NOT NULL UNIQUE,
    groupA TEXT NOT NULL,
    groupB TEXT NOT NULL,
    "order" TEXT NOT NULL CHECK (json_valid("order") AND json_type("order") = 'array'),
    colorA TEXT NOT NULL,
    colorB TEXT NOT NULL,
    FOREIGN KEY (groupA) REFERENCES "group"(groupID),
    FOREIGN KEY (groupB) REFERENCES "group"(groupID)
);

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

INSERT OR IGNORE INTO "group" (groupID, words)
VALUES
    ('animals', '["tiger","otter","eagle","panda","whale"]'),
    ('fruits', '["apple","mango","peach","grape","lemon"]');

INSERT OR IGNORE INTO daily_game (name, date, groupA, groupB, "order", colorA, colorB)
VALUES (
    'Sample Daily Game',
    '2026-04-24',
    'animals',
    'fruits',
    '["A","B","A","B","A","B","A","B","A","B"]',
    '#3B82F6',
    '#F97316'
);
