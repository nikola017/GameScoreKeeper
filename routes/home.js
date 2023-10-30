const express = require('express');
const router = express.Router();
const uuid = require('uuid');
const { Pool } = require('pg');
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'gamescorekeeper',
    password: process.env.DB_PASS,
    port: 5432,
    ssl: true
});

router.use(express.urlencoded({ extended: true }));
router.use(express.json());

const tournamentLink = uuid.v4(); // Generira jedinstveni UUID

router.get('/home', async (req, res) => {
    if (req.oidc.isAuthenticated()) {
        let username;
        if (req.oidc && req.oidc.user) {
            if (req.oidc.user.name !== undefined) {
                username = req.oidc.user.name;
            } else if (req.oidc.user.sub !== undefined) {
                username = req.oidc.user.sub;
            }
        }

        // Dohvaćanje turnira koje je kreirao trenutni korisnik
        const tournaments = await pool.query(`
            SELECT id, name FROM Tournaments WHERE created_by = $1
        `, [req.oidc.user.sub]);
        res.render('home', { username, errorMessage: null, tournaments: tournaments.rows });  // Ako je korisnik autenticiran, prikažite mu home stranicu.
    } else {
        res.redirect('/');  // Ako korisnik nije autenticiran, preusmjerite ga natrag na glavnu stranicu.
    }
});

router.post('/createTournament', async (req, res) => {
    if (req.oidc.isAuthenticated()) {
        const { tournamentName, competitors, scoringSystem } = req.body;
        const createdBy = req.oidc.user.sub;
        let username;
        if (req.oidc && req.oidc.user) {
            if (req.oidc.user.name !== undefined) {
                username = req.oidc.user.name;
            } else if (req.oidc.user.sub !== undefined) {
                username = req.oidc.user.sub;
            }
        }

        // Provjera je li isti turnir već postoji
        const existingTournament = await pool.query(`
            SELECT id FROM Tournaments WHERE name = $1 LIMIT 1
        `, [tournamentName]);
        if (existingTournament.rows.length > 0) {
            return res.render('home', { username: username, errorMessage: 'Natjecanje s tim imenom već postoji.' });
        }
  
        // Kreiramnje novog turnira u bazi
        try {
            const tournamentResult = await pool.query(`
                INSERT INTO Tournaments (name, scoring_system, created_by, link)
                VALUES ($1, $2, $3, $4)
                RETURNING id
            `, [tournamentName, scoringSystem, createdBy, tournamentLink]);
  
            const tournamentId = tournamentResult.rows[0].id;
  
            // Dodavanje natjecatelja u tablicu Competitors
            const competitorNames = competitors.split(/\s*[,;\n]+\s*/);  // Razdvajamo po točki, zarezu ili novom retku
            for (const name of competitorNames) {
                let existingCompetitor = await pool.query(`
                    SELECT id FROM Competitors WHERE name = $1 LIMIT 1
                `, [name]);
    
                let competitorId;
        
                if (existingCompetitor.rows.length > 0) {
                    competitorId = existingCompetitor.rows[0].id;
                } else {
                    const newCompetitor = await pool.query(`
                        INSERT INTO Competitors (name, tournament_id)
                        VALUES ($1, $2)
                        RETURNING id
                    `, [name, tournamentId]);
                    competitorId = newCompetitor.rows[0].id;
                }
            
                // Dodajmo natjecatelja u turnir (ako već nije dodan)
                await pool.query(`
                    INSERT INTO TournamentCompetitors (tournament_id, competitor_id)
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                `, [tournamentId, competitorId]);
            }
  
            const competitorsResult = await pool.query(`
                SELECT id FROM Competitors WHERE tournament_id = $1
            `, [tournamentId]);
        
            const competitorIds = competitorsResult.rows.map(row => row.id);
            let roundNumber = 1;
  
            res.redirect('/home');
        } catch (error) {
        console.error('Greška prilikom kreiranja turnira:', error);
        res.redirect('/home');
      }
    } else {
      res.redirect('/');
    }
});

router.get('/updateResults/:tournamentId', async (req, res) => {
    const { tournamentId } = req.params;
    
    const tournamentCheck = await pool.query(`SELECT created_by FROM Tournaments WHERE id = $1`, [tournamentId]);
    if (tournamentCheck.rows[0].created_by !== req.oidc.user.sub) {
        return res.status(403).send('Nemate ovlasti za ažuriranje ovog turnira.');
    }

    const results = await pool.query(`
        SELECT r.*, c1.name as competitor1_name, c2.name as competitor2_name 
        FROM Results r
        INNER JOIN Competitors c1 ON r.competitor1_id = c1.id
        INNER JOIN Competitors c2 ON r.competitor2_id = c2.id
        WHERE r.tournament_id = $1
    `, [tournamentId]);
    res.render('updateResults', { results: results.rows });
});


router.post('/submitResults', async (req, res) => {
    // Provjera autentikacije i ovlasti
    // ...
    
    const resultUpdates = Object.keys(req.body).reduce((acc, key) => {
        const [prefix, resultId] = key.split('_');
        if (!acc[resultId]) acc[resultId] = {};
        acc[resultId][prefix] = req.body[key];
        return acc;
    }, {});
    
    for (const [resultId, scores] of Object.entries(resultUpdates)) {
        await pool.query(`UPDATE Results SET score1 = $1, score2 = $2 WHERE id = $3`, [scores.score1, scores.score2, resultId]);
    }
    
    res.redirect('/home');
});

/*
router.get('/schedule/:tournamentId', async (req, res) => {
    const tournamentId = req.params.tournamentId;
    // Ovdje dohvatite raspored iz baze podataka koristeći tournamentId
    //const schedule = await; 

    res.render('schedule', { schedule });
});
*/


module.exports = router;
