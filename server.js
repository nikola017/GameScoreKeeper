require('dotenv').config();

const express = require('express');
const path = require('path');
const { auth } = require('express-openid-connect');

const https = require('https');
const fs = require('fs');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// za deploy
const externalUrl = process.env.RENDER_EXTERNAL_URL;
const port = externalUrl && process.env.PORT ? parseInt(process.env.PORT) : 3000;

if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_CLIENT_ID || !process.env.AUTH0_SECRET) {
    console.error('Neke varijable u .env nisu tu.');
    process.exit(1);
  }

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
    secret: process.env.AUTH0_SECRET,
    baseURL: externalUrl || `http://localhost:${port}`,
    clientID: process.env.AUTH0_CLIENT_ID,
    issuerBaseURL: 'https://dev-j04mw5yqbhcpa5gb.eu.auth0.com'
};

// stvaranje tablica ako ih nema
const createTables = async () => {
  try {
      // Kreiranje Tournaments tablice
      await pool.query(`
          CREATE TABLE IF NOT EXISTS Tournaments (
              id SERIAL PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              scoring_system VARCHAR(20) NOT NULL,
              created_by VARCHAR(255) NOT NULL,
              link VARCHAR(255) UNIQUE NOT NULL
          );
      `);
      console.log('Tablica "Tournaments" uspješno kreirana!');

      // Kreiranje Competitors tablice
      await pool.query(`
          CREATE TABLE IF NOT EXISTS Competitors (
              id SERIAL PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              tournament_id INTEGER REFERENCES Tournaments(id),
              total_points INTEGER DEFAULT 0
          );
      `);
      console.log('Tablica "Competitors" uspješno kreirana!');

      // Kreiranje Results tablice
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
      console.log('Tablica "Results" uspješno kreirana!');

  } catch (error) {
      console.error('Greška prilikom kreiranja tablica:', error);
  }
};

createTables();

// CORS
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

// routes
app.set('view engine', 'ejs');
app.use('/', require('./routes/index'));
app.use('/', require('./routes/home'));

/*
app.get('/callback', (req, res) => {
    if (req.oidc.isAuthenticated()) {
        res.redirect('/home');
    } else {
        res.redirect('/');
        console.log("Callback nije uspio") // Or some error page
    }
});*/


// za deploy
if (externalUrl) {
    const hostname = '0.0.0.0';
    app.listen(port, hostname, () => {
        console.log(`Server locally running at http://${hostname}:${port}/ and from outside on ${externalUrl}`);
    });
  } else {
    https.createServer({
        key: fs.readFileSync('server.key'),
        cert: fs.readFileSync('server.cert')
    }, app).listen(port, () => {
        console.log(`Server pokrenut na http://localhost:${port}`);
    });
  }
