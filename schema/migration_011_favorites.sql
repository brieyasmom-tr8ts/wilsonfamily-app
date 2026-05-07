-- Migration 011: Fun profile favorites
ALTER TABLE members ADD COLUMN favorite_icecream TEXT;
ALTER TABLE members ADD COLUMN favorite_snack TEXT;
ALTER TABLE members ADD COLUMN favorite_color TEXT;
ALTER TABLE members ADD COLUMN favorite_game TEXT;
ALTER TABLE members ADD COLUMN favorite_movie TEXT;
ALTER TABLE members ADD COLUMN favorite_song TEXT;
ALTER TABLE members ADD COLUMN favorite_hobby TEXT;
ALTER TABLE members ADD COLUMN fun_fact TEXT;
