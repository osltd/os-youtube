/**
 *    ------------- Load dependenices -------------
 */
const express           = require('express');
const router            = express.Router();
const fs                = require('fs');


// ---------- Health check ----------
router.get('/healthcheck', (req, res) => res.json({
    result   : true,
    messages : [`no problemo.`]
}));


// ---------- Google domain verification ----------
router.get('/googleecbb584a62ea25e2.html', (req, res) => {
    res.set('Content-Type', 'text/html');
    res.status(200).end('google-site-verification: googleecbb584a62ea25e2.html');
});


// ---------- Home Page ----------
router.get('/', (req, res) => fs.readFile(`${__dirname}/../assets/index.html`, (err, data) => {
    // set mime type
    res.set('content-type', 'text/html');
    res.status(200).end(data.toString());
}))


// ---------- Privacy policy ----------
router.get('/privacy_policy', (req, res) => fs.readFile(`${__dirname}/../assets/privacy_policy.html`, (err, data) => {
    // set mime type
    res.set('content-type', 'text/html');
    res.status(200).end(data.toString());
}));

module.exports = router;

