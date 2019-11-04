/**
 *    ------------- Load dependenices -------------
 */
const express = require('express');
const router  = express.Router();
const request = require('request');
const fs      = require('fs');
const config  = require('../constants/config');


// get the home page
router.get('/articles/:article_id', (req, res) => {
    // fetch articles
    new Promise((resolve, reject) => request({
        url    : `${config.OS.ENDPOINT}/articles?ids=${req.params.article_id}`,
        method : 'GET',
        auth   : {
            'user' : config.OS.ID,
            'pass' : config.OS.KEY
        }
    }, (error, resp, body) => {
        let result = null;
        try {result = JSON.parse(body)} catch(e) {result = null} finally {result = result || {}}
        // get article
        const article = ((result.data || {}).rows || []).shift() || {};
        // next process
        resolve(article);
    }))
    // load html source
    .then((article) => fs.readFile(`${__dirname}/../libraries/reader/build/index.html`, (err, data) => {
        // get html
        let html = data.toString();
        // inject json data
        html = html.replace("{{__ARTICLE__}}", JSON.stringify(article));
        html = html.replace("{{__TITLE__}}", ((article.sections || []).shift() || {}).title || 'Oneshop');
        // set header
        res.setHeader('content-type', 'text/html');
        // output
        res.status(200).end(html);
    }))
    // any error?
    .catch(error => res.status(500).json({
        result  : false,
        message : error
    }));
});

// load assets of the file
router.get('/static/:filePath([a-zA-Z0-9\.\/]+)', (req, res) => fs.readFile(`${__dirname}/../libraries/reader/build/static/${req.params.filePath}`, (err, data) => {
    let contentType = {
        js  : 'text/javascript',
        css : 'text/css',
        png : 'image/png',
        jpg : 'image/jpg',
        svg : 'image/svg+xml',
        ico : 'image/x-icon',
        mp4 : 'video/mp4',
        qt  : 'video/qt'
    }
    // set header
    res.setHeader('content-type', contentType[req.params.filePath.split('.').pop()] || 'text/*');
    // output
    res.status(err ? 404 : 200).end(err ? `File not found.` : data.toString());
}))

module.exports = router;