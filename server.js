const express = require('express');
const { auth } = require('express-openid-connect');
const { requiresAuth } = require('express-openid-connect');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 3000;

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

// req.isAuthenticated is provided from the auth router
app.get('/', (req, res) => {
    res.send(req.oidc.isAuthenticated() ? 'Logged in' : 'Logged out');
});

app.get('/profile', requiresAuth(), (req, res) => {
    res.send(JSON.stringify(req.oidc.user));
});

app.get('/competitions', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM competitions');
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.listen(port, () => {
  console.log(`Server pokrenut na http://localhost:${port}`);
});

/*
if (externalUrl) {
    const hostname = '0.0.0.0';
    app.listen(port, hostname, () => {
        console.log(`Server locally running at http://${hostname}:${port}/ and from outside on ${externalUrl}`);
    });
  } else {
    app.listen(port, () => {
        console.log(`Server pokrenut na http://localhost:${port}`);
    });
  }*/
