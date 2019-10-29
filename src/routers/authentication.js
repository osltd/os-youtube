/**
 *    ------------- Load dependenices -------------
 */
const express           = require('express');
const router            = express.Router();
const passport          = require('passport');
const config            = require('../constants/config');
const db                = require('../libraries/db');
const request           = require('request');
const fs                = require('fs');




/**
 *    ------------- start authentication -------------
 */
router.get('/auth/youtube', (req, res, next) => passport.authenticate('youtube', {
    scope   : [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/yt-analytics.readonly'
    ],
    state   : req.query.shops,
    display : 'popup'
  })(req, res, next));




/**
 *    ------------- authentication callback -------------
 */
router.get('/auth/youtube/callback', passport.authenticate('youtube',{ failureRedirect : '/auth/youtube/failure' }), (req, res) => {
    // setup data conatiner
    var data = {};
    // fetch profile by id
    new Promise((resolve, reject) => {
        // check profile existence
        db.query(`SELECT * FROM profiles WHERE profile_id = ?`, [req.user.id])
        .then(rows => rows.length ? reject(`user.[${req.user.id}].notfound`) : resolve())
        .catch(reject);
    })
    // fetch shop id by token
    .then(() => new Promise((resolve, reject) => request({ 
        uri     : `${config.OS.ENDPOINT}/shops?ids=${req.query.state}`,
        method  : 'GET',
        headers : { 'content-type' : 'application/json' },
        auth : {
          user : config.OS.ID,
          pass : config.OS.KEY
        }
    }, (error, response, body) => {
        var result = null;
        // try to parse result
        try {result = JSON.parse(body)} catch (e) {result = null} finally {result = result || null}
        // has shop id?
        ((((result || {}).data || {}).shops || [])[0] || {}).id ? resolve(result.data.shops[0].id) : reject();
    })))
    // set shop id for profile
    .then((shopId) => new Promise((resolve, reject) => {
        db.query(`UPDATE profiles SET os_shop_id = ? WHERE profile_id = ?`, [shopId, req.user.id])
        .then(res => res.affectedRows ? resolve() : reject(`update.profile.failed[${shopId},${req.user.id}]`))
        .catch(reject);
    }))
    // success
    .then(() => res.redirect(`${config.APP.URL}/auth/youtube/success`))
    // any error occured?
    .catch(err => res.redirect(`${config.APP.URL}/auth/youtube/failure?reason=${err}`));
});




/**
 *    ------------- callback pages -------------
 */

// --------- Auth success ---------
router.get('/auth/youtube/success', (req, res) => fs.readFile(`${__dirname}/../assets/callback.html`, (err, data) => {
    // get html
    var html = data.toString();
    // replace string
    html = html.replace('{{__RESULT__}}', 'Success!');
    html = html.replace('{{__MSG__}}', 'All set! You may now using Oneshop panel to publish your videos to YouTube now!');
    // set mime type
    res.set('content-type', 'text/html');
    res.status(200).end(html);
}));
  

// --------- Auth failure ---------
router.get('/auth/youtube/failure', (req, res) => fs.readFile(`${__dirname}/../assets/callback.html`, (err, data) => {
    // get html
    var html = data.toString();
    // replace string
    html = html.replace('{{__RESULT__}}', 'Failed!');
    html = html.replace('{{__MSG__}}', `Failed to authorize, please try again :(<br/>Reason: ${req.query.reason}`);
    // set mime type
    res.set('content-type', 'text/html');
    res.status(200).end(html);
}));


module.exports = router;