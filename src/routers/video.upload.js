/**
 *    ------------- Load dependenices -------------
 */
const express    = require('express');
const router     = express.Router();
const config     = require('../constants/config');
const db         = require('../libraries/db');
const h2p        = require('html2plaintext');
const request    = require('request');
const {google}   = require('googleapis');
const OAuth2     = google.auth.OAuth2;
const youtubeApi = google.youtube('v3');
const aws        = require('aws-sdk');
const s3         = new aws.S3(config.S3);
const BUCKET     = 'cdn.oneshop.cloud';



/**
 *  ------------- Upload video -------------
 */
router.post('/pre-release', (req, res) => {
    // response first
    res.status(200).end('posted.');
    // release
    request({
      url     : config.APP.URL + '/release',
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
      },
      body     : JSON.stringify({ feed : req.body.feed })
    }, (error, resp, body) => {});
});





router.post('/release', (req, res) => {
    // setup process data container
    var data = {};

    // fetch articles
    new Promise((resolve, reject) => request({
        url    : `${config.OS.ENDPOINT}/articles?statuses=draft,published&ids=${req.body.feed}`,
        method : 'GET',
        auth   : {
            'user' : config.OS.ID,
            'pass' : config.OS.KEY
        }
    }, (error, resp, body) => {
        let result = null;
        try {result = JSON.parse(body)} catch(e) {result = null} finally {result = result || {}}
        // get article
        const article = ((result.data || {}).posts || []).shift() || {};
        // save article
        data.article = article;
        // pass article
        (article.sections || []).length < 1 ? reject({
            code    : 404,
            message : 'page.not.found'
        }) : resolve();
    }))

    // fetch video
    .then(() => new Promise((resolve, reject) => {
        db.query('SELECT * FROM videos WHERE os_feed_id = ?', [data.article.id])
        // 
        .then(rows => {
            // save feed
            data.youtubeFeed = rows.length ? rows[0] : null;
            // next process
            resolve();
        })
        // db error
        .catch(reject);
    }))

    // process article
    .then(() => new Promise((resolve, reject) => {
        // get first section
        var section = data.article.sections.shift();
        // save section
        data.section = section;
        // validate video
        (section.medias || []).forEach(media => {
            // a kind of video?
            if(/^mov|mpeg4|mp4|avi|wmv|mpegps|flv|3gpp|webm|dnxhr|prores|cineform|hevc|qt$/i.test(media.ext)){
                // save file
                data.file = {
                    key : (media.url.split('?').shift() || '').split('/').pop(),
                    ext : media.ext.toLowerCase()
                };
            }
        });
        // no video found?
        if(!data.file) reject({
            code    : 401,
            message :  `video.file.not.found`
        });
        // fetch profile
        db.query(`SELECT * FROM profiles WHERE os_shop_id = ?`,[(data.article.shop || {}).id])
        // profile exists?
        .then(rows => {
            if(rows.length) {
                // save profile
                data.profile = rows[0];
                // next process
                resolve();
            } else {
                reject({
                    code    : 404,
                    message : `shop.not.found`
                });
            }
        })
        // db error
        .catch(reject);
    }))

    // validate access token
    .then(() => new Promise((resolve, reject) => { 
      // init OAuth client
        var oauth2Client = new OAuth2(
            config.YT.ID,
            config.YT.KEY, 
            `${config.APP.URL}/auth/youtube/callback`
        );
        // set refresh token
        oauth2Client.credentials = { 
            refresh_token : data.profile.profile_refresh_token 
        };
        // get diff between now and profile updated time
        var diff = new Date().getTime() - new Date(data.profile.profile_updated_time).getTime();
        // updated more then 30 mins before, access_token expired
        if((diff/60/1000) > 30){
            console.log("====> Token expired.");
            oauth2Client.getRequestHeaders()
            // got new token
            .then(headers => {
                console.log("=====> Got new token: ", headers.Authorization.split(" ").pop());
                // set access token
                oauth2Client.credentials.access_token = headers.Authorization.split(" ").pop();
                // update access token
                db.query(
                    `UPDATE profiles SET profile_access_token = ? WHERE os_shop_id = ?`,
                    [oauth2Client.credentials.access_token, data.profile.os_shop_id]
                )
                // update success?
                .then(res => !res.affectedRows ? reject({
                    code    : 500,
                    message : `update.refresh.token.error`
                }) : resolve(oauth2Client))
                // db error
                .catch(reject);
            })
            // error ?
            .catch(err => reject({
                code : 401,
                message : [`get.refresh.token.error`, err]
            }));
        } else {
            // set access token
            oauth2Client.credentials.access_token = data.profile.profile_access_token;
            // by pass
            resolve(oauth2Client);
        }
    }))
    // insert/update video
    .then(oauth2Client => new Promise((resolve, reject) => {
        // setup params
        var params = {
            auth     : oauth2Client,
            part     : 'snippet',
            resource : {
                snippet: {
                    title       : data.section.title,
                    categoryId  : 2,
                    description : h2p(data.section.description) + data.article.sections.length > 0 ? `\n▶ https://${req.hostname}/articles/${req.body.feed}` : "",
                    tags        : data.section.tags || []
                }
            }
        };
        // update?
        if(data.youtubeFeed){
            // set video id
            params.resource.id = data.youtubeFeed.video_id;
            // set part
            params.part = 'snippet';
            // update youtube
            youtubeApi.videos.update(params, (err, result) => {
                // save response
                data.ytRes = err ? err : result;
                if (err) {
                    console.error('\n\n\n =====> videos.update error');
                    console.error(err);
                    reject({
                        code    : 401,
                        message : `video.update.failed`
                    });
                } else {
                    console.log('\n\n\n=====> videos.update success:\n', result);
                    resolve(result);
                }
            });
        } else {
            // set media
            params.media = {
                mimeType : `video/${data.file.ext}`,
                body     : s3.getObject({ 
                Bucket : BUCKET, 
                Key    : data.file.key
                }).createReadStream() // stream to stream copy
            };
            // set part
            params.part = 'snippet,status';
            // set publish status
            params.resource.status = {
                privacyStatus : /^published$/i.test(data.article.time) ? 'public' : 'private',
                embeddable    : true
            };
            // is a scheduled video?
            if(!/^published$/i.test(data.article.time)){
                params.resource.status.publishAt = new Date(data.article.time).toISOString();
            }
            console.log("=========> Uploading Video");
            console.log(params);
            // upload video
            youtubeApi.videos.insert(params, (err, result) => {
                // save response
                data.ytRes = err ? err : result;
                // handle result
                if (err) {
                    console.error('\n\n\n =====> videos.insert error');
                    console.error(err);
                    reject({
                        code    : 401,
                        message : `video.upload.failed`
                    });
                } else {
                    console.log('\n\n\n=====> videos.insert success:\n', result);
                    resolve(result);
                }
            });
        }
    }))
    // save video info
    .then(video => new Promise((resolve, reject) => {
        // no need to insert new video record
        if(data.youtubeFeed){
            resolve();
        } else {
            console.log("\n\n\n=====> Saving Video details...");
            // insert video record
            db.query(
                'INSERT INTO videos (video_id, os_shop_id, os_feed_id, video_thumbnail, quota_used) VALUES (?,?,?,?,?)',
                [video.data.id, data.article.shop.id, req.body.feed, ((video.data.snippet.thumbnails || {}).high || {}).url, 1605]
            )
            .then(result => !result.affectedRows ? reject({
                code    : 500,
                message : `video.save.error`
            }) : resolve())
            // db error
            .catch(reject);
        }
    }))
    // save log
    .then(() => db.query(
        "INSERT INTO `logs` (`feed_id`, `shop_id`, `log_result`, `log_action`, `log_response_context`) VALUES (?,?,?,?,?)",
        [
            req.body.feed, 
            data.article.shop.id, 
            'SUCCESS', 
            data.youtubeFeed ? 'UPDATE' : 'CREATE', 
            !/^string$/i.test(typeof data.ytRes) ? JSON.stringify(data.ytRes) : data.ytRes
        ]
    ))
    // all process finished
    .then(() => res.status(200).end('posted'))
    // output error
    .catch(err => {
        // create log
        db.query(
            "INSERT INTO `logs` (`feed_id`, `shop_id`, `log_result`, `log_action`, `log_response_context`) VALUES (?,?,?,?,?)",
            [
                req.body.feed, 
                data.article.shop.id, 
                'FAILED', 
                data.youtubeFeed ? 'UPDATE' : 'CREATE',
                !/^string$/i.test(typeof err) ? JSON.stringify(err) : err
            ]
        )
        // response
        .then(result => res.status(401).json({
            result   : false,
            messages : `post.failed`
        }))
        // db error
        .catch(error => {
            res.status(500).json({
            result   : false,
            messages : `save.error.failed:${error}`
        })});
    });

});


module.exports = router;