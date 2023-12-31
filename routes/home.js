const express = require('express');
const router = express.Router();
const uuid = require('uuid');
const { Pool } = require('pg');
const { requiresAuth } = require('express-openid-connect');
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

const tournamentLink = uuid.v4();

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
        const userTournaments = await pool.query(`
            SELECT id, name FROM Tournaments WHERE created_by = $1
        `, [req.oidc.user.sub]);
        // Dohvaćanje svih turnira
        const allTournaments = await pool.query(`
            SELECT id, name FROM Tournaments
        `);

        res.render('home', { 
            username, 
            errorMessage: null, 
            tournaments: userTournaments.rows, 
            allTournaments: allTournaments.rows
        });  
    } else {
        res.redirect('/');  
    }
});

router.post('/createTournament', async (req, res) => {
    if (req.oidc.isAuthenticated()) {
        const createdBy = req.oidc.user.sub;
        let username;
        if (req.oidc && req.oidc.user) {
            if (req.oidc.user.name !== undefined) {
                username = req.oidc.user.name;
            } else if (req.oidc.user.sub !== undefined) {
                username = req.oidc.user.sub;
            }
        }
        // Dohvaćanje turnira koje je kreirao trenutni korisnik
        const userTournaments = await pool.query(`
            SELECT id, name FROM Tournaments WHERE created_by = $1
        `, [req.oidc.user.sub]);
        // Dohvaćanje svih turnira
        const allTournaments = await pool.query(`
            SELECT id, name FROM Tournaments
        `);

        // error ako je nije dobar broj natjecatelja te da li je svaki natjecatelj jedinstven
        const { tournamentName, competitors, scoringSystem } = req.body;
        const competitorNames = competitors.split(/\s*[,;\n]+\s*/);
        if (competitorNames.length !== new Set(competitorNames).size) {
            return res.render('home', {
                username,
                errorMessage: 'Svaki natjecatelj mora biti jedinstven.',
                tournaments: userTournaments.rows, 
                allTournaments: allTournaments.rows
            });
        }
        if (competitorNames.length < 4 || competitorNames.length > 8) {
            return res.render('home', {
                username,
                errorMessage: 'Broj natjecatelja mora biti između 4 i 8.',
                tournaments: userTournaments.rows, 
                allTournaments: allTournaments.rows
            });
        }
        // error ako sustav bodovanja nije dobro definiran
        const validScoringSystemFormat = /^(\d+)\/(\d+)\/(\d+)$/.test(scoringSystem);
        if (!validScoringSystemFormat) {
            return res.render('home', {
                username,
                errorMessage: 'Sustav bodovanja mora biti u formatu "broj/broj/broj".',
                tournaments: userTournaments.rows, 
                allTournaments: allTournaments.rows
            });
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
            const competitorNames = competitors.split(/\s*[,;\n]+\s*/);
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

            let roundNumber=1
            // Generiranje rasporeda
            for (let i = 0; i < competitorIds.length; i++) {
                for (let j = i + 1; j < competitorIds.length; j++) {
                    await pool.query(`
                        INSERT INTO Results (round, competitor1_id, competitor2_id, tournament_id)
                        VALUES ($1, $2, $3, $4)
                    `, [roundNumber, competitorIds[i], competitorIds[j], tournamentId]);
                    }
            }

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


router.post('/submitResults', requiresAuth(), async (req, res) => {    
    const resultUpdates = Object.keys(req.body).reduce((acc, key) => {
        const [prefix, resultId] = key.split('_');
        if (!acc[resultId]) acc[resultId] = {};
        acc[resultId][prefix] = req.body[key];
        return acc;
    }, {});

    // Dodana validacija rezultata
    for (const scores of Object.values(resultUpdates)) {
        if (isNaN(scores.score1) || scores.score1.trim() === "" || isNaN(scores.score2) || scores.score2.trim() === "") {
            return res.status(400).send('Molimo unesite ispravne brojeve za rezultate i osigurajte se da polja nisu prazna.');
        }
    }

    // Resetiranje bodova natjecatelja
    const tournamentIds = new Set();  // skup za spremanje svih turnira koji su ažurirani
    for (const resultId of Object.keys(resultUpdates)) {
        const tournamentIdQuery = await pool.query(`SELECT tournament_id FROM Results WHERE id = $1`, [resultId]);
        tournamentIds.add(tournamentIdQuery.rows[0].tournament_id);
    }
    for (const tournamentId of tournamentIds) {
        await pool.query(`UPDATE Competitors SET total_points = 0 WHERE tournament_id = $1`, [tournamentId]);
    }

    for (const [resultId, scores] of Object.entries(resultUpdates)) {
        await pool.query(`UPDATE Results SET score1 = $1, score2 = $2 WHERE id = $3`, [scores.score1, scores.score2, resultId]);
        
        // Dohvačanje sustava bodovanja
        const tournamentIdQuery = await pool.query(`SELECT tournament_id FROM Results WHERE id = $1`, [resultId]);
        const tournamentId = tournamentIdQuery.rows[0].tournament_id;
        const scoringSystemQuery = await pool.query(`SELECT scoring_system FROM Tournaments WHERE id = $1`, [tournamentId]);
        const [winPoints, drawPoints, losePoints] = scoringSystemQuery.rows[0].scoring_system.split('/').map(Number);
        
        // Ažuriranje bodova natjecatelja
        const [score1, score2] = [Number(scores.score1), Number(scores.score2)];
        const result = await pool.query(`SELECT competitor1_id, competitor2_id FROM Results WHERE id = $1`, [resultId]);
        const {competitor1_id, competitor2_id} = result.rows[0];
        
        if (score1 > score2) {
            await pool.query(`UPDATE Competitors SET total_points = total_points + $1 WHERE id = $2`, [winPoints, competitor1_id]);
            await pool.query(`UPDATE Competitors SET total_points = total_points + $1 WHERE id = $2`, [losePoints, competitor2_id]);
        } else if (score1 < score2) {
            await pool.query(`UPDATE Competitors SET total_points = total_points + $1 WHERE id = $2`, [losePoints, competitor1_id]);
            await pool.query(`UPDATE Competitors SET total_points = total_points + $1 WHERE id = $2`, [winPoints, competitor2_id]);
        } else {
            await pool.query(`UPDATE Competitors SET total_points = total_points + $1 WHERE id = $2`, [drawPoints, competitor1_id]);
            await pool.query(`UPDATE Competitors SET total_points = total_points + $1 WHERE id = $2`, [drawPoints, competitor2_id]);
        }
    }
    
    res.redirect('/home');
});

router.get('/tournamentDetails/:tournamentId', async (req, res) => {
    const { tournamentId } = req.params;

    // Dohvati turnir po id-u
    const tournament = await pool.query(`SELECT * FROM Tournaments WHERE id = $1`, [tournamentId]);

    // Dohvati rezultate za turnir
    const results = await pool.query(`
        SELECT r.*, c1.name as competitor1_name, c2.name as competitor2_name 
        FROM Results r
        INNER JOIN Competitors c1 ON r.competitor1_id = c1.id
        INNER JOIN Competitors c2 ON r.competitor2_id = c2.id
        WHERE r.tournament_id = $1
    `, [tournamentId]);

    // Dohvati natjecatelje za turnir poredane po bodovima
    const competitors = await pool.query(`
        SELECT * FROM Competitors WHERE tournament_id = $1 ORDER BY total_points DESC
    `, [tournamentId]);

    res.render('tournamentDetails', { 
        tournament: tournament.rows[0],
        results: results.rows, 
        competitors: competitors.rows 
    });
});

module.exports = router;
