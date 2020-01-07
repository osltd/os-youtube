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
        .then(rows => !rows.length ? reject(`user.[${req.user.id}].notfound`) : resolve())
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
        ((((result || {}).data || {}).rows || [])[0] || {}).id ? resolve(result.data.rows[0].id) : reject();
    })))
    // update shop status
    .then((shopId) => new Promise((resolve,reject) => request({
        uri     : config.OS.ENDPOINT + '/shops/' + shopId,
        method  : 'PUT',
        headers : { 'content-type' : 'application/json' },
        auth : {
          user : config.OS.ID,
          pass : config.OS.KEY
        },
        body: JSON.stringify({
            status: 'ACTIVE'
        })
    }, (error, response, body) => {
        // setup result container
        var result = null;
        // parse result
        try {result = JSON.parse(body)} catch(e) {result = null} finally {result = result || {}}
        // shop status updated
        if (!result.result) {
            // output failed result
            reject(error);
        } else {
            resolve(shopId);
        }
    })))
    // set present shop id profile status to delete first
    .then((shopId) => new Promise((resolve, reject) => {
        db.query(`UPDATE profiles SET profile_status = "DELETED" WHERE os_shop_id = ?`, [shopId])
        .then(() => resolve(shopId))
        .catch(reject);
    }))
    // set shop id for profile
    .then((shopId) => new Promise((resolve, reject) => {
        db.query(`UPDATE profiles SET os_shop_id = ?, profile_status = "ACTIVE"  WHERE profile_id = ?`, [shopId, req.user.id])
        .then(res => res.affectedRows ? resolve(shopId) : reject(`update.profile.failed[${shopId},${req.user.id}]`))
        .catch(reject);
    }))
    // success
    .then((shopId) => res.redirect(`${config.APP.URL}/auth/youtube/success?shopId=${shopId}`))
    // any error occured?
    .catch(err => res.redirect(`${config.APP.URL}/auth/youtube/failure?reason=${err}&shopId=${shopId}`));
});




/**
 *    ------------- callback pages -------------
 */

// --------- Auth success ---------
// router.get('/auth/youtube/success', (req, res) => fs.readFile(`${__dirname}/../assets/callback.html`, (err, data) => {
//     // get html
//     var html = data.toString();
//     // replace string
//     html = html.replace('{{__RESULT__}}', 'Success!');
//     html = html.replace('{{__MSG__}}', 'All set! You may now using Oneshop panel to publish your videos to YouTube now!');
//     // set mime type
//     res.set('content-type', 'text/html');
//     res.status(200).end(html);
// }));
router.get('/auth/youtube/success', (req, res) => fs.readFile(`${__dirname}/../assets/callback.html`, (err, data) => {
    var redirectUrl = `https://panel.oneshop.cloud/shops/${req.query.shopId}/settings`;
    // get html
    var html =  '<html>' +
                    '<head>' +
                        '<meta charset="utf-8"/>' +
                        '<title>Matching...</title>' +
                    '</head>' +
                    '<body style="margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; flex-direction: column; height: 100%;">' +
                        '<p style="color: #808080; text-align:center;">All set. You may now using Oneshop panel to publish your videos to YouTube now! ' + 
                        '<br/>This window will automatically back to panel in <span id="countdown" style="color: #fb9e9e; font-weight: 600;">5</span>s.</p>' +
                        `<a style="display: inline-block; background-color: #3257a3; color: #fff; padding: 3px 20px; text-decoration: none; border-radius: 5px;" href="javascript:location.replace('${redirectUrl}');">Done</a>` +
                        '<script>' +
                            'var timer = setInterval(function() {' +
                                'var current = parseInt(document.getElementById("countdown").innerText);' +
                                `--current < 1 ? location.replace('${redirectUrl}') : (document.getElementById("countdown").innerText = current);` +
                            '}, 1000);' +
                        '</script>' +
                    '</body>' +
                '</html>';
    // set mime type
    res.set('content-type', 'text/html');
    res.status(200).end(html);
}));
  

// --------- Auth failure ---------
// router.get('/auth/youtube/failure', (req, res) => fs.readFile(`${__dirname}/../assets/callback.html`, (err, data) => {
//     // get html
//     var html = data.toString();
//     // replace string
//     html = html.replace('{{__RESULT__}}', 'Failed!');
//     html = html.replace('{{__MSG__}}', `Failed to authorize, please try again :(<br/>Reason: ${req.query.reason}`);
//     // set mime type
//     res.set('content-type', 'text/html');
//     res.status(200).end(html);
// }));
router.get('/auth/youtube/failure', (req, res) => fs.readFile(`${__dirname}/../assets/callback.html`, (err, data) => {
    var redirectUrl = `https://panel.oneshop.cloud/shops/${req.query.shopId}/settings`;
    // get html
    var html =  '<html>' +
                    '<head>' +
                        '<meta charset="utf-8"/>' +
                        '<title>Matching...</title>' +
                    '</head>' +
                    '<body style="margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; flex-direction: column; height: 100%;">' +
                        '<p style="color: #808080; text-align:center;">Failed to authorize, please try again! ' + 
                        '<br/>Reason: ' + req.query.reason + 
                        '<br/>This window will automatically back to panel in <span id="countdown" style="color: #fb9e9e; font-weight: 600;">5</span>s.</p>' +
                        `<a style="display: inline-block; background-color: #3257a3;color: #fff; padding: 3px 20px; text-decoration: none; border-radius: 5px;" href="javascript:location.replace('${redirectUrl}');">Done</a>` +
                        '<script>' +
                            'var timer = setInterval(function() {' +
                                'var current = parseInt(document.getElementById("countdown").innerText);' +
                                `--current < 1 ? location.replace('${redirectUrl}') : (document.getElementById("countdown").innerText = current);` +
                            '}, 1000);' +
                        '</script>' +
                    '</body>' +
                '</html>';
    // set mime type
    res.set('content-type', 'text/html');
    res.status(200).end(html);
}));


module.exports = router;