-- 0019_games_unique_title.sql : a game title is unique whatever the capital letters or stray spaces.
-- 0018 made "title" unique, but "GTA V" and "gta v" would both have been accepted.
alter table games drop constraint games_title_key;
create unique index games_title_unique on games (lower(btrim(title)));
