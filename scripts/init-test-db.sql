-- Runs once, on first container start.
-- Creates the separate database the test suite drops and rebuilds freely,
-- so tests can never touch local development data.
CREATE DATABASE ecoeats_test OWNER ecoeats;
