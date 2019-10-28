// Only load the .env file from local!
if(!/^prod$/i.test(process.env.NODE_ENV)){
    require('dotenv').config();
}

// general dependencies
const express           = require('express');
const app               = express();
const bodyParser        = require('body-parser');
const cookieParser      = require('cookie-parser');
const fs                = require('fs');
const passport          = require('passport');
const youTubeV3Strategy = require('passport-youtube-v3').Strategy;
const db                = require('./src/libraries/db');
const config            = require('./src/constants/config');

// configure passport
passport.serializeUser((user, done) => done(null, user));
passport.use(new youTubeV3Strategy({
    clientID     : config.YT.ID,
    clientSecret : config.YT.KEY,
    callbackURL  : config.APP.URL + '/auth/youtube/callback',
    authorizationParams: {
      access_type : 'offline'
    }
}, (accessToken, refreshToken, profile, done) => {
    // create profile
    db.query(
        `REPLACE INTO profiles (profile_id, profile_display_name, profile_access_token, profile_refresh_token) VALUES (?,?,?,?)`
        [profile.id, profile.displayName || '', accessToken, refreshToken]
    )   
    .then(res => done(null, !res.affectedRows ? false : profile))
    .catch(err => done(err));
}));

// load libraries
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(passport.initialize());
// load routers
const ROUTERS = fs.readdirSync('./src/routers');
// apply routers
ROUTERS.forEach(router => app.use('/', require(`./src/routers/${router}`)));

// start application
app.listen(config.APP.PORT, () => console.log(`OS-Youtube engine is listening on port ${config.APP.PORT}.`));

module.exports = app;
