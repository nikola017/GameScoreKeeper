const dotenv = require('dotenv');
const express = require('express');
const https = require('https');
const fs = require('fs');
const logger = require('morgan');
const path = require('path');
const { auth } = require('express-openid-connect');;
const { Pool } = require('pg');

dotenv.config();

const app = express();

// routes
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Za provjeru .env
if (!process.env.AUTH0_CLIENT_ID || !process.env.AUTH0_SECRET) {
    console.error('Neke varijable u .env nisu tu.');
    process.exit(1);
}

// za deploy
const externalUrl = process.env.RENDER_EXTERNAL_URL;
const port = externalUrl && process.env.PORT ? parseInt(process.env.PORT) : 3000;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'gamescorekeeper',
    password: process.env.DB_PASS,
    port: 5432,
    ssl: true
});

const config = {
    authRequired: false,
    auth0Logout: true,
    secret: process.env.SECRET,
    baseURL: externalUrl || `https://localhost:${port}`,
    clientID: process.env.AUTH0_CLIENT_ID,
    issuerBaseURL: 'https://dev-j04mw5yqbhcpa5gb.eu.auth0.com',
    clientSecret: process.env.AUTH0_SECRET,
    authorizationParams: {
        response_type: 'code',
        scope: "openid profile email"
    }
};

// brisanje baze
const clearDatabase = async () => {
    try {
        await pool.query('DELETE FROM TournamentCompetitors');
        await pool.query('DELETE FROM Results;');
        await pool.query('DELETE FROM Competitors;');
        await pool.query('DELETE FROM Tournaments;');
        
        await pool.query('ALTER SEQUENCE Results_id_seq RESTART WITH 1;');
        await pool.query('ALTER SEQUENCE Competitors_id_seq RESTART WITH 1;');
        await pool.query('ALTER SEQUENCE Tournaments_id_seq RESTART WITH 1;');  
        
        console.log('Baza je očišćena.');
    } catch (error) {
        console.error('Greška prilikom brisanja podataka iz baze:', error);
    }
}

async function displayAllTables() {
    try {
        const tournamentResults = await pool.query("SELECT * FROM Tournaments");
        console.log("Sadržaj tablice Tournaments:", tournamentResults.rows);
      
        const competitorResults = await pool.query("SELECT * FROM Competitors");
        console.log("Sadržaj tablice Competitors:", competitorResults.rows);
      
        const resultsResults = await pool.query("SELECT * FROM Results");
        console.log("Sadržaj tablice Results:", resultsResults.rows);

        const tournamentCompetitorsResults = await pool.query("SELECT * FROM TournamentCompetitors");
        console.log("Sadržaj tablice TournamentCompetitors:", resultsResults.rows);
    } catch (error) {
        console.error("Greška prilikom dohvaćanja podataka iz tablica:", error);
    }
}

// stvaranje tablica ako ih nema
const createTables = async () => {
    try {
        await pool.query(`
        CREATE TABLE IF NOT EXISTS Tournaments (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          scoring_system VARCHAR(20) NOT NULL,
          created_by VARCHAR(255) NOT NULL,
          link VARCHAR(255) UNIQUE NOT NULL
        );
        `);
        console.log('Tablica "Tournaments" uspješno ažurirana!');
  
        await pool.query(`
        CREATE TABLE IF NOT EXISTS Competitors (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          tournament_id INTEGER REFERENCES Tournaments(id),
          total_points INTEGER DEFAULT 0
        );
        `);
        console.log('Tablica "Competitors" uspješno ažurirana!');
  
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Results (
                id SERIAL PRIMARY KEY,
                round INTEGER NOT NULL,
                competitor1_id INTEGER REFERENCES Competitors(id),
                competitor2_id INTEGER REFERENCES Competitors(id),
                score1 INTEGER,
                score2 INTEGER,
                tournament_id INTEGER REFERENCES Tournaments(id)
            );
        `);
        console.log('Tablica "Results" uspješno ažurirana!');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS TournamentCompetitors (
                tournament_id INT REFERENCES Tournaments(id),
                competitor_id INT REFERENCES Competitors(id),
                PRIMARY KEY (tournament_id, competitor_id)
            );
        `);
        console.log('Tablica "TournamentCompetitors" uspješno ažurirana!');
        
        await displayAllTables();
  
    } catch (error) {
        console.error('Greška prilikom ažuriranja tablica:', error);
    }
};

//clearDatabase();
createTables();

app.use(auth(config));

// Middleware to make the `user` object available for all views
app.use(function (req, res, next) {
    res.locals.user = req.oidc.user;
    next();
});

app.use('/', require('./routes/index'));
app.use('/', require('./routes/home'));
app.use('/', require('./routes/profile'));

/*
// Catch 404 and forward to error handler
app.use(function (req, res, next) {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// Error handlers
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: process.env.NODE_ENV !== 'production' ? err : {}
    });
});*/

// za deploy
if (externalUrl) {
    const hostname = '0.0.0.0'; // ne 127.0.0.1
    app.listen(port, hostname, () => {
        console.log(`Server locally running at http://${hostname}:${port}/ and from outside on ${externalUrl}`);
    });
  }
  else {
    https.createServer({
        key: fs.readFileSync('server.key'),
        cert: fs.readFileSync('server.cert')
    }, app)
    .listen(port, () => {
        console.log(`Server running at https://localhost:${port}/`);
    });
  }
